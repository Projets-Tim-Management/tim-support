import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
  Field,
  FieldHook,
} from "payload";

import { adminOnlyField, hasAdminRole, isAdmin, metierOwnedAccess, partnerIdOf } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { validatePhone } from "@/core/lib/validators";
import { enrollSequence } from "@/modules/marketing/hooks/enrollSequence";
import { requireTestSchedule } from "@/modules/marketing/hooks/requireTestSchedule";
import { armAutoStep } from "@/modules/marketing/lib/auto-steps";
import { ONBOARDING_STATUS_OPTIONS } from "@/modules/marketing/lib/onboarding";
import {
  CLIENT_STATUS_OPTIONS,
  CLIENT_STATUS_RANK,
  DEFAULT_CLIENT_STATUS,
  hasContractPhase,
  isPipelineStatus,
  needsEndDate,
} from "@/modules/partner/lib/clientStatus";
import { round2 } from "@/modules/partner/lib/format";
import { requireContractStart } from "@/modules/partner/hooks/requireContractStart";
import { requireLossReason } from "@/modules/partner/hooks/requireLossReason";
import { LOSS_REASON_OPTIONS, needsLossReason } from "@/modules/partner/lib/lossReason";
import { journalEntries, logActivity } from "@/modules/partner/lib/journal";
import {
  computeClientCA,
  isBillableClient,
  LICENCE_BASE_PRICES,
  PROFILS,
} from "@/modules/partner/lib/pricing";

/**
 * Opportunités — les entreprises BTP qu'un partenaire a amenées à Tim, du
 * prospect au client actif (le slug reste `partner-clients`).
 *
 * Pour chaque profil : une QUANTITÉ + un PRIX UNITAIRE (€ HT, pré-rempli avec
 * le prix de base mais modifiable — tarif négocié). Le CA se calcule dessus
 * (barème PDF 2026 : Σ qté × prix, puis remise volume) — voir lib/pricing.ts.
 * La commission du partenaire (CA payé HT × son taux) est calculée sur la fiche
 * partenaire (où le taux est connu) pour éviter toute désynchronisation.
 */

/** Recalcule les totaux CA + l'historique mensuel à chaque enregistrement. */
const computeCA: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  // Repli sur originalDoc si `licences` absent d'une mise à jour partielle
  // (sinon le CA serait remis à zéro en éditant un autre champ).
  const lic = (data?.licences ?? originalDoc?.licences ?? {}) as Record<string, number | undefined>;
  const lines = PROFILS.map((p) => ({
    qty: lic[`${p.key}Qty`] ?? 0,
    price: lic[`${p.key}Price`] ?? LICENCE_BASE_PRICES[p.key],
  }));
  const { totalLicences, caHT, suggestedDiscountPct } = computeClientCA(lines);

  // Taux de commission du partenaire lié (figé dans chaque période d'historique).
  const pref = (data?.partner ?? originalDoc?.partner) as unknown;
  const partnerId = pref && typeof pref === "object" ? (pref as { id?: unknown }).id : pref;
  let commissionRate = 0;
  const db = req?.payload?.db as { findOne?: (a: unknown) => Promise<Record<string, unknown> | null> } | undefined;
  if (partnerId != null && db?.findOne) {
    try {
      const partner = await db.findOne({ collection: "partners", where: { id: { equals: partnerId } }, req });
      if (typeof partner?.commissionRate === "number") commissionRate = partner.commissionRate;
    } catch {
      /* taux indisponible → 0 */
    }
  }
  const commission = round2((caHT * commissionRate) / 100);

  // Détail complet par profil (pour le drawer d'historique).
  const detail = PROFILS.map((p, i) => ({
    key: p.key,
    label: p.label,
    qty: lines[i].qty,
    price: lines[i].price,
    subtotal: Math.round(lines[i].qty * lines[i].price * 100) / 100,
  }));

  // Historique = facturation MENSUELLE : une seule ligne par mois (datée du 1er).
  // Les variations dans le mois mettent à jour la ligne du mois ; un nouveau mois
  // (ou un changement de config/taux) ajoute une ligne. Sinon → rien.
  type HistEntry = {
    at?: string;
    totalLicences?: number;
    caHT?: number;
    commission?: number;
    commissionRate?: number;
    detail?: unknown;
  };
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
  const prev = (Array.isArray(data?.history) ? data.history : originalDoc?.history) ?? [];
  const history = [...(prev as HistEntry[])];
  const last = history[history.length - 1];
  // Signature stable (indépendante de l'ordre des clés jsonb) : qté×prix / profil + taux.
  const sig = (arr: unknown): string =>
    (Array.isArray(arr) ? (arr as { key?: string; qty?: number; price?: number }[]) : [])
      .map((d) => `${d.key}:${d.qty}x${d.price}`)
      .join("|");
  const configChanged =
    !last || sig(last.detail) !== sig(detail) || Number(last.commissionRate ?? -1) !== commissionRate;
  if (configChanged) {
    const lastKey = last?.at
      ? (() => {
          const d = new Date(last.at);
          return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
        })()
      : null;
    const entry: HistEntry = { at: monthStart, totalLicences, caHT, commission, commissionRate, detail };
    if (last && lastKey === monthKey) history[history.length - 1] = entry; // même mois → maj
    else history.push(entry); // nouveau mois / première ligne
  }

  // Consolidation : une seule ligne par mois (dernier état), datée du 1er,
  // triée. Nettoie les données héritées de l'ancien hook (dates au jour, doublons).
  const monthKeyOf = (iso: string) => {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  };
  const monthStartOf = (iso: string) => {
    const d = new Date(iso);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  };
  const byMonth = new Map<string, HistEntry>();
  for (const e of history) {
    if (!e.at) continue;
    byMonth.set(monthKeyOf(e.at), { ...e, at: monthStartOf(e.at) });
  }
  const cleanHistory = [...byMonth.values()].sort((a, b) => Date.parse(a.at ?? "") - Date.parse(b.at ?? ""));

  // Le partenaire fixe les prix → le CA HT est directement Σ(qté × prix), sans
  // remise appliquée. `discountPct` reste stocké à titre indicatif.
  return { ...data, totalLicences, caBrut: caHT, caPaye: caHT, discountPct: suggestedDiscountPct, history: cleanHistory };
};

/**
 * Rang de tri du statut : « actif » d'abord (clients payants), puis le pipeline
 * vivant (en test, en cours, prospect), puis les fins de contrat (résilié,
 * archivé). `client_status` est un enum Postgres trié par ordre de déclaration :
 * on ne peut donc PAS obtenir « actifs en premier » par un tri direct sur l'enum.
 * On stocke un rang numérique dédié (voir CLIENT_STATUSES), utilisé comme tri par
 * défaut de la liste et par l'onglet « Tous » (PartnerClientsStatusTabs).
 *
 * Les rangs sont décimaux quand il le faut (« en-test » = 0.5, colonne `numeric`) :
 * insérer un statut sans renuméroter l'échelle. Les rangs déjà STOCKÉS ne sont
 * recalculés qu'au prochain enregistrement de chaque client — décaler l'échelle
 * aurait mal trié toutes les fiches non ré-enregistrées.
 */
const setStatusRank: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const status = (data?.clientStatus ?? originalDoc?.clientStatus ?? DEFAULT_CLIENT_STATUS) as string;
  return { ...data, statusRank: CLIENT_STATUS_RANK[status] ?? 9 };
};

/**
 * Commission mensuelle du partenaire SUR CE CLIENT, calculée à la lecture :
 * CA payé HT × taux de la fiche partenaire, et 0 tant que le client n'est pas
 * **Actif** (voir `isBillableClient`) — même règle partout, donc la somme de la
 * colonne égale bien la tuile « Commission / mois ».
 *
 * Lecture du taux via `payload.db` (comme computeCA) et NON via `payload.find` :
 * lire une fiche partenaire par l'API peuplerait son champ `join` clients, qui
 * relancerait ce hook sur chaque client → boucle. Le taux est mémoïsé par requête
 * dans `req.context` : un seul aller-retour pour tout un tableau.
 */
const computeCommissionMonthly: FieldHook = async ({ data, req, siblingData }) => {
  const doc = (siblingData ?? data ?? {}) as {
    caPaye?: number;
    clientStatus?: string;
    contractStartDate?: string | null;
    partner?: unknown;
  };
  const caPaye = Number(doc.caPaye ?? 0);
  if (!caPaye || !isBillableClient(doc)) return 0;

  const ref = doc.partner;
  const partnerId = ref && typeof ref === "object" ? (ref as { id?: unknown }).id : ref;
  if (partnerId == null) return 0;

  const ctx = req?.context as { partnerRates?: Map<string, number> } | undefined;
  if (ctx && !ctx.partnerRates) ctx.partnerRates = new Map();
  const cache = ctx?.partnerRates;
  const key = String(partnerId);
  const cached = cache?.get(key);
  if (cached !== undefined) return round2((caPaye * cached) / 100);

  let rate = 0;
  const db = req?.payload?.db as
    | { findOne?: (a: unknown) => Promise<Record<string, unknown> | null> }
    | undefined;
  if (db?.findOne) {
    try {
      const partner = await db.findOne({
        collection: "partners",
        where: { id: { equals: partnerId } },
        req,
      });
      if (typeof partner?.commissionRate === "number") rate = partner.commissionRate;
    } catch {
      /* taux indisponible → 0 */
    }
  }
  cache?.set(key, rate);
  return round2((caPaye * rate) / 100);
};

/**
 * Un client se supprime AVEC tout ce qui n'existe que par lui.
 *
 * Ces neuf collections portent un champ `client` REQUIS (colonne `client_id`
 * NOT NULL) dont la clé étrangère est `ON DELETE SET NULL` : supprimer le
 * client sans les avoir vidées fait échouer Postgres (SET NULL sur une colonne
 * NOT NULL → 500). Seuls les contacts étaient nettoyés, parce qu'ils étaient
 * seuls à exister quand la règle a été écrite ; les huit autres sont arrivées
 * depuis, et chacune rendait la suppression impossible sans dire pourquoi.
 *
 * L'ORDRE compte : un accès de test référence un salarié du dossier, on vide
 * donc les accès avant les salariés. Le reste est indépendant.
 *
 * Ce qui n'est PAS supprimé : les tickets. Leur lien vers la phase de test est
 * facultatif, il passe à NULL — un échange avec le support est une trace qui
 * survit au client, comme une facture survit à celui qui l'a payée.
 *
 * `req` transmis = même transaction (tout part, ou rien) ; `overrideAccess` car
 * c'est un nettoyage d'intégrité, pas une action d'utilisateur.
 */
const CLIENT_CHILDREN = [
  "client-activities",
  "client-employees",
  "client-sites",
  "client-vehicles",
  "client-machines",
  "client-portal-accounts",
  "journey-runs",
  "client-contacts",
] as const;

const deleteClientChildren: CollectionBeforeDeleteHook = async ({ req, id }) => {
  for (const collection of CLIENT_CHILDREN) {
    const { docs, errors } = await req.payload.delete({
      collection,
      where: { client: { equals: id } },
      overrideAccess: true,
      req,
    });

    // Une suppression en lot NE LÈVE PAS : Payload collecte les échecs. Sans ce
    // relais, une ligne récalcitrante ferait échouer la suppression du client
    // plus loin, avec l'erreur Postgres pour seule explication — exactement ce
    // qu'on est en train de corriger. On la nomme tout de suite.
    if (errors?.length) {
      throw new Error(
        `Suppression impossible : ${errors.length} ${collection} n'ont pas pu être supprimés ` +
          `(${errors[0]?.message ?? "raison inconnue"}).`,
      );
    }

    // Tracé : la cascade emporte des données irrécupérables (phase de test,
    // dossier de démarrage, accès). Savoir ce qui est parti est le minimum.
    if (docs.length) {
      req.payload.logger.info(
        `[client ${id}] suppression en cascade : ${docs.length} × ${collection}.`,
      );
    }
  }
};

/**
 * Deux étapes du parcours se constatent ICI, sur la fiche client — et nulle part
 * ailleurs : le dossier de démarrage passé à « Transmis » et la date de
 * signature du contrat.
 *
 * C'est le principe posé pour tout le parcours : une étape se coche par le
 * GESTE qui la réalise, jamais par une case à part. Sans ce hook, l'admin qui
 * enregistre la signature devrait encore aller cocher « Contrat signé » dans la
 * phase de test — deux endroits pour un seul fait, donc tôt ou tard deux
 * versions de la vérité.
 *
 * Seule la TRANSITION compte : on n'arme que si le champ vient de changer, pour
 * qu'un simple réenregistrement de la fiche ne relance rien.
 */
/**
 * Journal automatique : chaque fait marquant laisse une ligne dans l'historique
 * de l'opportunité (voir journalEntries pour ce qui compte comme un fait).
 *
 * `void` volontaire ? Non : on attend, pour que la trace parte dans la MÊME
 * transaction que le changement. Une trace qui survit à un enregistrement annulé
 * raconterait quelque chose qui n'a pas eu lieu.
 */
const writeJournal: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  for (const entry of journalEntries(doc, previousDoc, operation)) {
    await logActivity(req.payload, { client: doc.id, ...entry, req });
  }
  return doc;
};

const armJourneySteps: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (doc?.onboardingStatus === "transmis" && previousDoc?.onboardingStatus !== "transmis") {
    await armAutoStep(req.payload, doc.id, "dossier-demarrage", req);
  }
  // Dossier passé à « Validé » depuis la fiche : l'étape du parcours suit, pour
  // qu'il n'existe jamais deux vérités sur le même fait.
  if (doc?.onboardingStatus === "valide" && previousDoc?.onboardingStatus !== "valide") {
    await armAutoStep(req.payload, doc.id, "validation-dossier", req);
  }
  if (doc?.signatureDate && !previousDoc?.signatureDate) {
    await armAutoStep(req.payload, doc.id, "signature", req);
  }
  return doc;
};

/**
 * Champs quantité/prix cachés : la SAISIE se fait via le tableau custom
 * (LicencesTable), mais les valeurs sont stockées dans ces vrais champs (liés
 * au tableau par useField). `hidden` = présent dans l'état + en base, non rendu.
 */
/**
 * Onglets liés à la phase de test (dossier de démarrage, espace client) : ils
 * n'apparaissent qu'à partir du moment où un test existe.
 *
 * Sur un prospect ou un client « en cours », ces écrans n'ont rien à montrer et
 * rien à demander — ils encombrent la fiche de deux onglets vides. On les
 * affiche donc à partir de « En test » (le statut que pose le Kanban quand on
 * date la phase), et on les GARDE ensuite : les données du dossier survivent au
 * test, y compris sur un client devenu actif ou résilié.
 */
const hasTestPhase = (data?: { clientStatus?: string }): boolean =>
  !isPipelineStatus(data?.clientStatus ?? DEFAULT_CLIENT_STATUS);

/**
 * Onglet « Contrat client » : réservé aux affaires GAGNÉES (et à ce qu'elles
 * deviennent — résiliées, archivées).
 *
 * Tant qu'on négocie, il n'y a pas de contrat à décrire : mode de paiement,
 * date de signature et document signé n'ont aucun objet. Une affaire perdue n'en
 * a jamais eu non plus. L'onglet apparaît dès la bascule en « Gagnée » — au
 * moment exact où le modal réclame la date de début de contrat.
 *
 * « Facturation client » suit une autre règle : toujours visible, mais rangé en
 * DERNIER. Ses champs (SIREN, adresse) se collectent parfois dès la négociation.
 */
const hasContract = (data?: { clientStatus?: string }): boolean =>
  hasContractPhase(data?.clientStatus ?? DEFAULT_CLIENT_STATUS);

const hiddenNum = (name: string, def: number): Field => ({
  name,
  type: "number",
  defaultValue: def,
  min: 0,
  admin: { hidden: true },
});

export const PartnerClients: CollectionConfig = {
  slug: "partner-clients",
  // Libellé « Opportunités » : la liste couvre tout le pipeline commercial, du
  // prospect au client résilié. Le slug `partner-clients` reste inchangé — le
  // renommer casserait relations, URLs et migrations pour un simple intitulé.
  labels: { singular: "Opportunité", plural: "Opportunités" },
  // Tri par défaut de la liste : « actifs en premier » (via le rang `statusRank`),
  // plutôt que par date de création. L'onglet « Tous » réapplique ce tri (cf. tabs).
  defaultSort: "statusRank",
  admin: {
    useAsTitle: "companyName",
    defaultColumns: [
      "companyName",
      "partner",
      "signatureDate",
      "clientStatus",
      "caPaye",
      "commissionMonthly",
    ],
    group: "Partenaires",
    // Boutons natifs masqués → toutes les actions passent par le menu 3-points.
    components: {
      edit: {
        // Boutons natifs masqués → un seul bouton « intelligent » à la place.
        SaveButton: "/modules/partner/admin/HiddenControl#HiddenControl",
        SaveDraftButton: "/modules/partner/admin/HiddenControl#HiddenControl",
        PublishButton: "/modules/partner/admin/HiddenControl#HiddenControl",
        // « Annuler la publication » retiré : le retour en brouillon n'a de sens
        // que pour une fiche incomplète non enregistrée (géré par SmartSaveButton),
        // pas pour rétrograder une fiche déjà validée.
        UnpublishButton: "/modules/partner/admin/HiddenControl#HiddenControl",
        // Bouton « Publier » / « Enregistrer le brouillon » (création + édition).
        beforeDocumentControls: [
          // Le retour « ← Clients apportés » est injecté en tête pour toutes les
          // collections (voir withBackToList dans payload.config.ts).
          "/modules/partner/admin/SmartSaveButton#SmartSaveButton",
          // Modal de confirmation d'archivage (monté en permanence, ouvert par le menu).
          "/modules/partner/admin/ArchiveClientModal#ArchiveClientModal",
        ],
        // « Archiver » ajouté au menu 3-points natif (édition).
        editMenuItems: ["/modules/partner/admin/PartnerClientEditMenu#PartnerClientEditMenu"],
      },
      // En-tête de liste : bascule Tableau/Kanban. En mode tableau, affiche les
      // onglets de statut (pré-filtrage) ; en mode kanban, le board par statut.
      beforeListTable: ["/modules/partner/admin/PartnerClientsViewSwitcher#PartnerClientsViewSwitcher"],
      // Ligne de total (CA + commissions) sous le tableau.
      afterListTable: ["/modules/partner/admin/PartnerClientsTotals#PartnerClientsTotals"],
    },
  },
  // Retire « Dupliquer » du menu 3-points natif.
  disableDuplicate: true,
  // Verrouillage de document désactivé : Payload verrouille une fiche pendant
  // son édition et refuse alors de la SUPPRIMER (« Document is currently locked
  // and cannot be deleted »). Comme les fiches client sont éditées par peu de
  // personnes, on désactive ce verrou pour pouvoir supprimer depuis la fiche.
  lockDocuments: false,
  // Clients : partenaire-métier = CRU scopé à sa fiche ; admin = tout.
  // SUPPRESSION réservée à l'admin (un partenaire ne peut pas supprimer un client) →
  // retire aussi le bouton « Supprimer » des contrôles de document pour le métier.
  access: { ...metierOwnedAccess, delete: isAdmin },
  // Brouillons : permet de créer un client incomplet (sans l'e-mail requis).
  // Les champs obligatoires ne sont exigés qu'à la publication.
  versions: { drafts: true },
  // enforcePartnerField : un partenaire est forcé sur SA fiche (anti-usurpation).
  hooks: {
    // requireTestSchedule en TÊTE : le passage « En test » est refusé avant tout
    // calcul, plutôt que d'échouer à mi-chemin sur une fiche déjà recalculée.
    beforeChange: [
      requireTestSchedule,
      requireContractStart,
      requireLossReason,
      enforcePartnerField(),
      setStatusRank,
      computeCA,
    ],
    // Les faits saisis ici cochent les étapes du parcours correspondantes.
    // `enrollSequence` en dernier : il ouvre ou ferme une séquence de relance
    // sur les transitions de « Perdue », et ne doit jamais faire échouer un
    // enregistrement — on ne refuse pas de clore une affaire parce qu'un envoi
    // futur n'a pas pu être planifié.
    afterChange: [armJourneySteps, writeJournal, enrollSequence],
    // Vide ce qui n'existe que par ce client avant de le supprimer, sans quoi
    // Postgres refuse la suppression (cf. deleteClientChildren).
    beforeDelete: [deleteClientChildren],
  },
  fields: [
    // Recherche INSEE (préremplissage) — tout en haut du formulaire : remplit
    // « Entreprise cliente », raison sociale, SIREN, TVA et adresse d'un coup.
    // Masquée dès qu'« Entreprise cliente » est renseignée ; réapparaît si on
    // efface ce champ (permet de relancer une recherche).
    /**
     * TÊTE DE FICHE : deux champs, et c'est tout.
     *
     * Ce qui QUALIFIE l'opportunité (statut, apporteur, provenance, identifiant
     * Brevo, date de fin) est passé dans la COLONNE LATÉRALE. Empilés en pleine
     * largeur, ces champs poussaient les onglets sous la ligne de flottaison :
     * il fallait faire défiler pour atteindre l'historique, c'est-à-dire l'écran
     * qu'on vient consulter.
     *
     * Dans la barre latérale, ils restent visibles DEPUIS N'IMPORTE QUEL ONGLET —
     * le statut sous les yeux pendant qu'on saisit des licences, ce que la
     * disposition précédente ne permettait pas.
     */
    {
      name: "inseeLookup",
      type: "ui",
      admin: {
        condition: (data) => !data?.companyName,
        components: { Field: "/modules/partner/admin/InseeLookup#InseeLookup" },
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "companyName",
          type: "text",
          label: "Entreprise cliente",
          required: true,
          admin: { width: "50%" },
        },
        {
          // En tête de fiche et non dans « Facturation client » : cet onglet est
          // rangé en dernier, et le champ est REQUIS à la publication. C'est
          // d'ailleurs son premier usage — écrire à la personne bien avant de
          // lui envoyer une facture.
          name: "email",
          type: "email",
          label: "Adresse e-mail",
          required: true,
          admin: { width: "50%", description: "Contact, puis envoi des factures." },
        },
      ],
    },

    // ─── Colonne latérale ────────────────────────────────────────────────────
    {
      // Nommé `clientStatus` (et non `status`) pour éviter la collision de
      // nom d'enum avec le champ `_status` des brouillons dans la table de
      // versions (les deux se réduiraient à « ..._version_status »).
      name: "clientStatus",
      type: "select",
      label: "Statut",
      // Une opportunité naît « Nouvelle » : la mettre « Gagnée » d'office ferait
      // entrer un client dans le CA et les commissions dès sa création.
      defaultValue: DEFAULT_CLIENT_STATUS,
      admin: {
        position: "sidebar",
        components: {
          // En tableau : pastille colorée (même code couleur que le Kanban).
          Cell: "/modules/partner/admin/ClientStatusCell#ClientStatusCell",
          // Dans le formulaire : champ custom qui intercepte le passage à
          // « En test » (modal de démarrage) et à « Gagnée » (date de début de
          // contrat) — les mêmes que ceux du Kanban.
          Field: "/modules/marketing/admin/ClientStatusField#ClientStatusField",
        },
      },
      options: CLIENT_STATUS_OPTIONS,
    },
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      label: "Partenaire apporteur",
      required: true,
      index: true,
      // Anti-usurpation : `enforcePartnerField` (beforeChange) force déjà la valeur
      // sur SA fiche pour un rôle partenaire. Côté UI on VERROUILLE pour le métier :
      //  - access create/update réservé à l'admin → champ en lecture seule (le
      //    métier ne peut pas changer la sélection ; enforcé aussi côté serveur) ;
      //  - allowEdit/allowCreate = false → masque l'icône crayon (édition inline de
      //    la fiche liée) et le bouton « créer », inutiles ici. L'admin garde le
      //    choix via le menu déroulant.
      access: { create: adminOnlyField, update: adminOnlyField },
      admin: {
        position: "sidebar",
        allowEdit: false,
        allowCreate: false,
      },
      // Pré-rempli : rôle partenaire → SA propre fiche (verrouillée, satisfait
      // `required`) ; sinon valeur passée en query (?partner=<id>) lors d'un
      // « + Ajouter un client » depuis une fiche partenaire (admin).
      defaultValue: ({ req }) => {
        const own = partnerIdOf(req?.user);
        if (own != null && !hasAdminRole(req?.user)) return own;
        const p = req?.searchParams?.get?.("partner");
        return p ? p : undefined;
      },
    },
    {
      // ── Pourquoi ça s'arrête ─────────────────────────────────────────────
      // Renseigné au moment du geste (modal), modifiable ensuite. Sans motif,
      // une affaire perdue ne dit rien : on constate un chiffre qui baisse sans
      // savoir quoi corriger.
      name: "lossReason",
      type: "select",
      label: "Motif",
      options: LOSS_REASON_OPTIONS,
      index: true,
      admin: {
        position: "sidebar",
        condition: (data) => needsLossReason(data?.clientStatus),
        description: "Pourquoi l'affaire s'est arrêtée.",
      },
    },
    {
      name: "lossReasonDetail",
      type: "textarea",
      label: "Précision",
      admin: {
        position: "sidebar",
        condition: (data) => needsLossReason(data?.clientStatus),
        description: "Facultatif — ce que le motif ne dit pas.",
      },
    },
    {
      /**
       * Où en est la relance automatique. Sous le motif de perte, parce que
       * c'est le motif qui l'a ouverte — et parce qu'on lit les deux ensemble
       * avant de rappeler quelqu'un.
       *
       * Ne s'affiche que s'il y a quelque chose à dire : le composant ne rend
       * rien quand la fiche n'a jamais été enrôlée.
       */
      name: "sequenceState",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "/modules/marketing/admin/SequenceState#SequenceState" },
      },
    },
    {
      name: "resiliationDate",
      type: "date",
      label: "Date de fin de contrat",
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
        // Visible dès que le contrat est terminé : client résilié OU archivé.
        condition: (data) => needsEndDate(data?.clientStatus),
        description: "La commission du partenaire s'arrête à cette date.",
      },
    },
    {
      // Un lead du site vitrine n'a pas la même fraîcheur qu'une fiche saisie à
      // la main : on le dit, plutôt que de laisser deviner.
      name: "source",
      type: "select",
      label: "Provenance",
      defaultValue: "manuelle",
      /**
       * Canal d'ACQUISITION, et non moyen technique d'arrivée : c'est ce qu'on
       * veut lire sur une fiche et croiser dans les statistiques.
       *
       * `site-vitrine` est conservée pour les fiches importées de Brevo — les
       * renommer ferait mentir l'historique, qui ne savait pas distinguer SEO
       * et SEA. Les nouveaux leads prennent l'une des deux valeurs précises.
       */
      options: [
        { label: "Saisie manuelle", value: "manuelle" },
        { label: "Site vitrine — SEO", value: "site-vitrine-seo" },
        { label: "Google Ads — SEA", value: "google-ads-sea" },
        { label: "ChatGPT Ads — SEA", value: "chatgpt-ads-sea" },
        { label: "Site vitrine (import Brevo)", value: "site-vitrine" },
      ],
      admin: { position: "sidebar", readOnly: true },
    },
    {
      /**
       * Effectif déclaré au formulaire. En TEXTE et non en liste : les tranches
       * sont modifiables en back-office côté formulaire, et une valeur d'enum
       * qui n'existerait pas encore ferait échouer la création du lead — donc
       * perdre le lead pour un libellé.
       */
      name: "collaborateurs",
      type: "text",
      label: "Effectif",
      index: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        condition: (data) => Boolean(data?.collaborateurs),
        description: "Déclaré au formulaire du site vitrine.",
      },
    },
    {
      // Soumission dont vient cette fiche. Clé anti-doublon, comme `brevoDealId`
      // l'était pour l'import : une soumission ne peut créer qu'une opportunité.
      name: "formSubmission",
      type: "relationship",
      relationTo: "form-submissions",
      label: "Soumission",
      index: true,
      unique: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        condition: (data) => Boolean(data?.formSubmission),
      },
    },
    {
      // Identifiant de l'opportunité Brevo dont vient ce lead. C'est la CLÉ
      // ANTI-DOUBLON de l'import : sans elle, chaque passage du cron recréerait
      // les mêmes fiches. Indexé (une lecture par lead traité), unique (deux
      // fiches ne peuvent pas revendiquer la même opportunité Brevo).
      name: "brevoDealId",
      type: "text",
      label: "Opportunité Brevo",
      index: true,
      unique: true,
      admin: { position: "sidebar", readOnly: true, condition: (data) => Boolean(data?.brevoDealId) },
    },

    // ─── Onglets : historique, facturation, licences, contrat, démarrage ─────
    {
      type: "tabs",
      tabs: [
        // ── Historique : ce qu'on a fait, et ce qui reste à faire ───────────
        // EN PREMIER, c'est-à-dire l'onglet ouvert par défaut. Sur un lead, les
        // onglets d'après-signature sont masqués et les autres ne font que
        // décrire un état ; l'historique, lui, dit où on en est et ce qui reste
        // à faire — la première chose qu'on veut voir en ouvrant une fiche.
        {
          // Sans description : l'onglet montre déjà ce qu'il contient, et cette
          // ligne poussait la chronologie vers le bas à chaque ouverture.
          label: "Historique",
          fields: [
            {
              // Ce que le lead a demandé sur le site (besoins cochés, date de
              // réception). Sa place est ICI : c'est le premier événement de la
              // vie de l'opportunité, pas une propriété de son en-tête — et il
              // n'existe que pour les fiches venues du site vitrine.
              //
              // En lecture seule : c'est une trace de ce qui est arrivé, pas une
              // note de travail. La retoucher effacerait la demande d'origine.
              name: "leadNotes",
              type: "textarea",
              label: "Demande du lead",
              admin: {
                readOnly: true,
                condition: (data) => Boolean(data?.leadNotes),
                description: "Repris du formulaire du site vitrine.",
              },
            },
            {
              name: "historyBoard",
              type: "ui",
              admin: {
                components: { Field: "/modules/partner/admin/ClientHistory#ClientHistory" },
              },
            },
          ],
        },
        {
          label: "Licences par profil",
          fields: [
            {
              name: "licences",
              type: "group",
              label: false,
              fields: [
                // Tableau de saisie (lié aux champs cachés ci-dessous par useField).
                {
                  name: "table",
                  type: "ui",
                  admin: {
                    components: { Field: "/modules/partner/admin/LicencesTable#LicencesTable" },
                  },
                },
                hiddenNum("adminQty", 0),
                hiddenNum("adminPrice", LICENCE_BASE_PRICES.admin),
                hiddenNum("conducteurQty", 0),
                hiddenNum("conducteurPrice", LICENCE_BASE_PRICES.conducteur),
                hiddenNum("chefChantierQty", 0),
                hiddenNum("chefChantierPrice", LICENCE_BASE_PRICES.chefChantier),
                hiddenNum("chefEquipeQty", 0),
                hiddenNum("chefEquipePrice", LICENCE_BASE_PRICES.chefEquipe),
                hiddenNum("compagnonQty", 0),
                hiddenNum("compagnonPrice", LICENCE_BASE_PRICES.compagnon),
              ],
            },
            // Historique mensuel, sous le tableau des licences.
            {
              name: "historyBox",
              type: "ui",
              admin: {
                components: { Field: "/modules/partner/admin/PartnerClientHistory#PartnerClientHistory" },
              },
            },
          ],
        },
        // ── Contrat client (métier + admin) — en dernier ────────────────────
        {
          label: "Contrat client",
          admin: { condition: hasContract },
          description:
            "Mode de paiement, conditions et contrat signé avec le client apporté.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "paymentMethod",
                  type: "select",
                  label: "Mode de paiement",
                  admin: { width: "50%" },
                  options: [
                    { label: "Prélèvement (GoCardless)", value: "prelevement-gocardless" },
                    { label: "Virement", value: "virement" },
                  ],
                },
                {
                  name: "paymentTerms",
                  type: "select",
                  label: "Conditions de paiement",
                  // Uniquement pour le virement (le prélèvement GoCardless est
                  // déclenché automatiquement, sans délai à choisir).
                  admin: {
                    width: "50%",
                    condition: (data) => data?.paymentMethod === "virement",
                    description: "Délai de règlement du virement.",
                  },
                  options: [
                    { label: "1er du mois", value: "1er-du-mois" },
                    { label: "7 jours", value: "7j" },
                    { label: "15 jours", value: "15j" },
                    { label: "30 jours", value: "30j" },
                    { label: "45 jours", value: "45j" },
                    { label: "60 jours", value: "60j" },
                  ],
                },
              ],
            },
            {
              // Dans un `row` : sinon `admin.width` est ignoré, le champ prend
              // toute la largeur et l'icône du calendrier file tout à droite.
              type: "row",
              fields: [
                {
                  name: "signatureDate",
                  type: "date",
                  label: "Date de signature",
                  admin: { width: "50%", date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } },
                },
                {
                  // Signature et début de contrat sont deux dates différentes :
                  // on signe en mars pour un abonnement qui court au 1er avril.
                  // C'est CELLE-CI qui déclenche la facturation des licences
                  // (voir isBillableClient) — d'où sa présence dès la bascule en
                  // « Gagnée », demandée par le Kanban et le champ « Statut ».
                  name: "contractStartDate",
                  type: "date",
                  label: "Date de début de contrat",
                  index: true,
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
                    description:
                      "Début de l'abonnement mensuel : le CA et la commission ne comptent qu'à partir de cette date.",
                  },
                },
              ],
            },
            {
              name: "contractDocument",
              type: "upload",
              relationTo: "media",
              label: "Contrat signé (document)",
              admin: {
                description: "PDF du contrat signé avec le client.",
                custom: { accept: "*", noun: "un fichier" },
                components: { Field: "/admin/fields/DirectUpload#default" },
              },
            },
          ],
        },
        // ── Dossier & accès : le poste de travail de TIM ────────────────────
        // Fusion de deux onglets qui montraient LES MÊMES données. « Dossier de
        // démarrage » listait salariés, chantiers, véhicules et engins en champs
        // `join` (une ligne à la fois, dans un tiroir) ; la console les affiche
        // à plat, éditables en tableau, en plein écran, avec les mots de passe
        // en face des utilisateurs — c'est-à-dire faits pour recopier dans TIM.
        // Deux écrans pour une même vérité, c'était un de trop.
        //
        // Ce qui n'existait QUE dans l'ancien onglet a été remonté ici : le logo,
        // l'état du dossier (il coche l'étape du parcours et déclenche la
        // relance) et sa date de transmission.
        {
          label: "Dossier & accès",
          admin: { condition: hasTestPhase },
          fields: [
            {
              // Déposé par le CLIENT depuis son espace, récupéré par TIM pour
              // habiller son compte de test. C'est la seule pièce du dossier
              // qu'on ne peut pas ressaisir à sa place : ni le SIREN ni l'INSEE
              // ne donnent le fichier.
              name: "logo",
              type: "upload",
              relationTo: "media",
              label: "Logo de l'entreprise",
              admin: {
                description:
                  "Déposé par le client depuis son espace. Téléchargez-le pour l'ajouter à son compte de test.",
                custom: { accept: "image/*", noun: "un logo" },
                components: { Field: "/admin/fields/DirectUpload#default" },
              },
            },
            {
              name: "onboardingRecap",
              type: "ui",
              admin: {
                components: { Field: "/modules/marketing/admin/OnboardingRecap#OnboardingRecap" },
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "onboardingStatus",
                  type: "select",
                  label: "État du dossier",
                  defaultValue: "en-cours",
                  options: ONBOARDING_STATUS_OPTIONS,
                  admin: {
                    width: "50%",
                    description: "« Transmis » = le client a fini sa saisie ; « Validé » = TIM a contrôlé.",
                  },
                },
                {
                  name: "onboardingSubmittedAt",
                  type: "date",
                  label: "Transmis le",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
                    condition: (data) => data?.onboardingStatus !== "en-cours",
                  },
                },
              ],
            },
            {
              name: "preparationConsole",
              type: "ui",
              admin: {
                components: {
                  Field: "/modules/marketing/admin/PreparationConsole#PreparationConsole",
                },
              },
            },
          ],
        },
        {
          label: "Espace client",
          description:
            "Le compte qui permet au client de se connecter à l'espace support : code à usage unique, session de 24 h. Rien d'autre — les accès au logiciel TIM vivent dans l'onglet « Préparation des accès », sur la ligne de chaque utilisateur.",
          admin: { condition: hasTestPhase },
          fields: [
            {
              // Le tableau ci-dessous montre une LIGNE d'accès ; il ne dit pas
              // si le client a reçu son lien. C'est pourtant la seule question
              // qu'on se pose ici — d'où cet encart, et le bouton de renvoi.
              name: "portalAccessBox",
              type: "ui",
              admin: {
                components: {
                  Field: "/modules/marketing/admin/PortalAccessBox#PortalAccessBox",
                },
              },
            },
            {
              name: "portalAccounts",
              type: "join",
              collection: "client-portal-accounts",
              on: "client",
              label: "Compte de connexion",
              admin: {
                allowCreate: true,
                description:
                  "Un seul compte par client : l'e-mail du référent. Aucun mot de passe — un code à 6 chiffres lui est envoyé à chaque connexion.",
                defaultColumns: ["email", "firstName", "lastName", "active", "lastLoginAt"],
              },
            },
          ],
        },
        // ── Contact (tout à la fin) : contacts de l'entreprise cliente ───────
        {
          label: "Contact",
          fields: [
            {
              // Champ `join` : tableau des contacts liés (client-contacts.client),
              // lignes cliquables → drawer d'édition. `allowCreate` affiche le
              // bouton « Créer un Contact » → drawer d'ajout (client pré-rempli).
              // Voir ClientContacts.ts.
              name: "contacts",
              type: "join",
              collection: "client-contacts",
              on: "client",
              label: false,
              admin: {
                allowCreate: true,
                defaultColumns: ["firstName", "lastName", "role", "email", "phone"],
              },
            },
          ],
        },
        // Toujours visible, mais EN DERNIER : sur un lead, ces champs comptables
        // n'ont pas encore d'objet — ils ne doivent donc pas occuper le début de
        // la fiche. Ils restent accessibles pour qui a déjà l'information (un
        // SIREN, une adresse de facturation collectés pendant la négociation).
        {
          label: "Facturation client",
          description:
            "Éléments comptables du client, pour que TIM puisse le facturer. L'e-mail est requis (envoi des factures électroniques).",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "raisonSociale",
                  type: "text",
                  label: "Raison sociale",
                  admin: { width: "50%", description: "Nom officiel de l'entreprise (pour la facture)." },
                },
                {
                  name: "siren",
                  type: "text",
                  label: "SIREN",
                  admin: { width: "50%", placeholder: "9 chiffres" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "vatNumber",
                  type: "text",
                  label: "Numéro de TVA",
                  admin: { width: "50%", placeholder: "FR + 11 chiffres" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "billingAddress", type: "text", label: "Adresse de facturation", admin: { width: "50%" } },
                {
                  name: "billingAddressComplement",
                  type: "text",
                  label: "Complément (facturation)",
                  admin: { width: "50%" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "phone",
                  type: "text",
                  label: "Numéro de téléphone",
                  validate: validatePhone,
                  admin: { width: "50%", placeholder: "+33 6 12 34 56 78" },
                },
                {
                  name: "recipient",
                  type: "text",
                  label: "Destinataire",
                  admin: { width: "50%", description: "Nom du destinataire de la facture (optionnel)." },
                },
              ],
            },
            { name: "billingRemarks", type: "textarea", label: "Remarques", admin: { description: "Optionnel." } },
          ],
        },
      ],
    },
    {
      name: "history",
      type: "array",
      label: "Historique des montants",
      admin: { hidden: true }, // stocké ; affiché via PartnerClientHistory
      fields: [
        { name: "at", type: "date" }, // 1er du mois concerné
        { name: "totalLicences", type: "number" },
        { name: "caHT", type: "number" },
        { name: "commissionRate", type: "number" },
        { name: "commission", type: "number" },
        { name: "detail", type: "json" }, // [{ key, label, qty, price, subtotal }]
      ],
    },

    // ─── Barre latérale (fixe à droite) ──────────────────────────────────────
    // « Où en est-on avec ce client ? » — la question qu'on se pose en ouvrant
    // la fiche, répondue en haut de la barre latérale : statut de la phase de
    // test, dates, avancement, étape en cours (ou bouton pour en démarrer une).
    {
      name: "journeyBox",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "/modules/marketing/admin/ClientJourneyBox#ClientJourneyBox" },
      },
    },
    // Récap LIVE (total licences, CA HT, remise conseillée, commission) →
    // toujours cohérent avec le tableau, sans attendre l'enregistrement.
    {
      name: "summaryBox",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "/modules/partner/admin/PartnerCommissionBox#PartnerCommissionBox" },
      },
    },
    { name: "notes", type: "textarea", label: "Notes", admin: { position: "sidebar" } },

    // Totaux STOCKÉS par le hook (reporting / colonnes de liste), non affichés
    // dans le formulaire (le récap ci-dessus est la source visible, en direct).
    { name: "totalLicences", type: "number", admin: { hidden: true } },
    // `caPaye` sert de COLONNE (fiche partenaire, liste clients) : il ne peut donc
    // pas être `hidden` (Payload exclut les champs cachés des colonnes) — on le
    // sort du formulaire avec un composant vide à la place du champ.
    {
      name: "caPaye",
      type: "number",
      label: "CA / mois",
      admin: {
        components: {
          Field: "/modules/partner/admin/HiddenControl#HiddenControl",
          Cell: "/modules/partner/admin/MoneyCell#MoneyCell",
        },
      },
    },
    // Commission mensuelle du partenaire sur CE client — VIRTUELLE : calculée à
    // la lecture depuis le taux de la fiche partenaire, donc jamais désynchronisée
    // si le taux change (les montants stockés le sont dans `history`, figés).
    {
      name: "commissionMonthly",
      type: "number",
      label: "Commission / mois",
      virtual: true,
      admin: {
        components: {
          Field: "/modules/partner/admin/HiddenControl#HiddenControl",
          Cell: "/modules/partner/admin/MoneyCell#MoneyCell",
        },
      },
      hooks: { afterRead: [computeCommissionMonthly] },
    },
    { name: "caBrut", type: "number", admin: { hidden: true } },
    { name: "discountPct", type: "number", admin: { hidden: true } },
    // Rang de tri dérivé de `clientStatus` (0 = actif). Stocké/indexé pour trier
    // « actifs en premier » côté BDD — voir setStatusRank + defaultSort.
    { name: "statusRank", type: "number", index: true, admin: { hidden: true } },
  ],
};
