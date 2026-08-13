import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
  Field,
  FieldHook,
} from "payload";

import { adminOnlyField, hasAdminRole, isAdmin, metierOwnedAccess, partnerIdOf } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { validatePhone } from "@/core/lib/validators";
import { requireTestSchedule } from "@/modules/marketing/hooks/requireTestSchedule";
import { ONBOARDING_STATUS_OPTIONS } from "@/modules/marketing/lib/onboarding";
import { CLIENT_STATUS_OPTIONS, CLIENT_STATUS_RANK } from "@/modules/partner/lib/clientStatus";
import { round2 } from "@/modules/partner/lib/format";
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
  const status = (data?.clientStatus ?? originalDoc?.clientStatus ?? "prospect") as string;
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
    partner?: unknown;
  };
  const caPaye = Number(doc.caPaye ?? 0);
  if (!caPaye || !isBillableClient(doc.clientStatus)) return 0;

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
 * Avant de supprimer un client, on supprime ses contacts rattachés.
 * Le champ `client` d'un contact est REQUIS (colonne `client_id` NOT NULL) alors
 * que sa clé étrangère est `ON DELETE SET NULL` : supprimer un client qui a des
 * contacts ferait échouer Postgres (SET NULL sur une colonne NOT NULL → 500).
 * Les contacts sont des enfants du client → on les supprime en cascade ici.
 * `req` transmis = même transaction ; overrideAccess car nettoyage d'intégrité.
 */
const deleteClientContacts: CollectionBeforeDeleteHook = async ({ req, id }) => {
  await req.payload.delete({
    collection: "client-contacts",
    where: { client: { equals: id } },
    overrideAccess: true,
    req,
  });
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
const AVANT_TEST = ["prospect", "en-cours"];
const hasTestPhase = (data?: { clientStatus?: string }): boolean =>
  !AVANT_TEST.includes(data?.clientStatus ?? "prospect");

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
    beforeChange: [requireTestSchedule, enforcePartnerField(), setStatusRank, computeCA],
    // Supprime les contacts liés avant de supprimer le client (cf. deleteClientContacts).
    beforeDelete: [deleteClientContacts],
  },
  fields: [
    // Recherche INSEE (préremplissage) — tout en haut du formulaire : remplit
    // « Entreprise cliente », raison sociale, SIREN, TVA et adresse d'un coup.
    // Masquée dès qu'« Entreprise cliente » est renseignée ; réapparaît si on
    // efface ce champ (permet de relancer une recherche).
    {
      name: "inseeLookup",
      type: "ui",
      admin: {
        condition: (data) => !data?.companyName,
        components: { Field: "/modules/partner/admin/InseeLookup#InseeLookup" },
      },
    },
    {
      name: "companyName",
      type: "text",
      label: "Entreprise cliente",
      required: true,
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
      // Nommé `clientStatus` (et non `status`) pour éviter la collision de
      // nom d'enum avec le champ `_status` des brouillons dans la table de
      // versions (les deux se réduiraient à « ..._version_status »).
      // (La « Date de signature » vit désormais dans l'onglet « Contrat client ».)
      name: "clientStatus",
      type: "select",
      label: "Statut",
      // Une opportunité naît PROSPECT : la mettre « Actif » d'office ferait
      // entrer un client dans le CA et les commissions dès sa création.
      defaultValue: "prospect",
      admin: {
        width: "50%",
        components: {
          // En tableau : pastille colorée (même code couleur que le Kanban).
          Cell: "/modules/partner/admin/ClientStatusCell#ClientStatusCell",
          // Dans le formulaire : champ custom qui intercepte le passage à
          // « En test » pour ouvrir le modal de démarrage (date + contact +
          // aperçu des étapes) — le même que celui du Kanban.
          Field: "/modules/marketing/admin/ClientStatusField#ClientStatusField",
        },
      },
      options: CLIENT_STATUS_OPTIONS,
    },
    {
      name: "resiliationDate",
      type: "date",
      label: "Date de fin de contrat",
      admin: {
        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
        // Visible dès que le contrat est terminé : client résilié OU archivé.
        condition: (data) => data?.clientStatus === "resilie" || data?.clientStatus === "archive",
        description:
          "Fin du contrat / de l'abonnement mensuel — la commission du partenaire s'arrête à cette date.",
      },
    },

    // ─── Onglets : contrat / facturation / licences ──────────────────────────
    {
      type: "tabs",
      tabs: [
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
                {
                  name: "email",
                  type: "email",
                  label: "Adresse e-mail",
                  required: true,
                  admin: { width: "50%", description: "Requis — envoi des factures." },
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
        // ── Dossier de démarrage : ce que le client remplit avant son test ──
        // Remplace le fichier Excel « éléments de l'entreprise » (5 sections).
        // L'Administrateur n'est PAS dupliqué ici : c'est l'onglet « Contact »
        // ci-dessous, qui existait déjà — un contact client reste un contact.
        {
          label: "Dossier de démarrage",
          description:
            "Les éléments que le client remplit avant le démarrage du test : effectif, chantiers, matériel. Le comptage des salariés « Accès TIM » alimente le tableau des licences.",
          admin: { condition: hasTestPhase },
          fields: [
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
              name: "employees",
              type: "join",
              collection: "client-employees",
              on: "client",
              label: "Salariés",
              admin: {
                allowCreate: true,
                description:
                  "Tout l'effectif. Cochez « Accès TIM » sur ceux qui consomment une licence — eux seuls comptent dans le devis.",
                defaultColumns: ["matricule", "firstName", "lastName", "poste", "isUser", "licenceProfile"],
              },
            },
            {
              name: "sites",
              type: "join",
              collection: "client-sites",
              on: "client",
              label: "Chantiers",
              admin: {
                allowCreate: true,
                defaultColumns: ["name", "address", "startDate", "endDate", "zone"],
              },
            },
            {
              name: "vehicles",
              type: "join",
              collection: "client-vehicles",
              on: "client",
              label: "Véhicules",
              admin: {
                allowCreate: true,
                defaultColumns: ["brand", "year", "plate", "insuranceDate", "licenseTypes"],
              },
            },
            {
              name: "machines",
              type: "join",
              collection: "client-machines",
              on: "client",
              label: "Engins",
              admin: {
                allowCreate: true,
                defaultColumns: ["brand", "year", "serial", "insuranceDate", "cacesTypes"],
              },
            },
          ],
        },
        // ── Espace client : connexion du client + accès applicatifs de test ──
        {
          label: "Espace client",
          description:
            "Le compte qui permet au client de se connecter (code à usage unique, session 24 h), et les identifiants TIM qu'il distribue lui-même à ses équipes. Création réservée aux admins.",
          admin: { condition: hasTestPhase },
          fields: [
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
            {
              // Génère les accès depuis les salariés « Accès TIM » du dossier :
              // sans ça, TIM retape à la main ce que le client a déjà déclaré.
              name: "credentialsGenerator",
              type: "ui",
              admin: {
                components: {
                  Field: "/modules/marketing/admin/CredentialsGenerator#CredentialsGenerator",
                },
              },
            },
            {
              name: "credentials",
              type: "join",
              collection: "client-credentials",
              on: "client",
              label: "Accès de test à remettre",
              admin: {
                allowCreate: true,
                description:
                  "Les comptes TIM créés pour les utilisateurs. Le client les consulte et les imprime depuis son espace — ils ne partent jamais par e-mail.",
                defaultColumns: ["firstName", "lastName", "licenceProfile", "username", "deliveredAt"],
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
                // Payload masque le bouton « Créer » tant que le client n'a pas
                // d'id (un contact se rattache à un client existant) → on l'explique.
                description:
                  "Enregistrez d'abord la fiche client, puis cliquez « Créer un Contact » pour ajouter les personnes à contacter chez ce client.",
                defaultColumns: ["firstName", "lastName", "role", "email", "phone"],
              },
            },
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
