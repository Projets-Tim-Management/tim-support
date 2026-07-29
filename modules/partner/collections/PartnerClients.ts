import type { CollectionBeforeChangeHook, CollectionConfig, Field } from "payload";

import { metierOwnedAccess } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { validatePhone } from "@/core/lib/validators";
import { round2 } from "@/modules/partner/lib/format";
import { computeClientCA, LICENCE_BASE_PRICES, PROFILS } from "@/modules/partner/lib/pricing";

/**
 * Clients apportés — les entreprises BTP qu'un partenaire a amenées à Tim.
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
 * Champs quantité/prix cachés : la SAISIE se fait via le tableau custom
 * (LicencesTable), mais les valeurs sont stockées dans ces vrais champs (liés
 * au tableau par useField). `hidden` = présent dans l'état + en base, non rendu.
 */
const hiddenNum = (name: string, def: number): Field => ({
  name,
  type: "number",
  defaultValue: def,
  min: 0,
  admin: { hidden: true },
});

export const PartnerClients: CollectionConfig = {
  slug: "partner-clients",
  labels: { singular: "Client apporté", plural: "Clients apportés" },
  admin: {
    useAsTitle: "companyName",
    defaultColumns: ["companyName", "partner", "signatureDate", "clientStatus"],
    group: "Partenaires",
    // Boutons natifs masqués → toutes les actions passent par le menu 3-points.
    components: {
      edit: {
        // Boutons natifs masqués → un seul bouton « intelligent » à la place.
        SaveButton: "/modules/partner/admin/HiddenControl#HiddenControl",
        SaveDraftButton: "/modules/partner/admin/HiddenControl#HiddenControl",
        PublishButton: "/modules/partner/admin/HiddenControl#HiddenControl",
        // Bouton « Publier » / « Enregistrer le brouillon » (création + édition).
        beforeDocumentControls: ["/modules/partner/admin/SmartSaveButton#SmartSaveButton"],
        // « Archiver » ajouté au menu 3-points natif (édition).
        editMenuItems: ["/modules/partner/admin/PartnerClientEditMenu#PartnerClientEditMenu"],
      },
    },
  },
  // Retire « Dupliquer » du menu 3-points natif.
  disableDuplicate: true,
  // Clients : partenaire-métier = CRUD scopé à sa fiche ; admin = tout.
  access: metierOwnedAccess,
  // Brouillons : permet de créer un client incomplet (sans l'e-mail requis).
  // Les champs obligatoires ne sont exigés qu'à la publication.
  versions: { drafts: true },
  // enforcePartnerField : un partenaire est forcé sur SA fiche (anti-usurpation).
  hooks: { beforeChange: [enforcePartnerField(), computeCA] },
  fields: [
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
      // Pré-rempli quand on crée depuis la fiche d'un partenaire
      // (bouton « + Ajouter un client » → ?partner=<id>).
      defaultValue: ({ req }) => {
        const p = req?.searchParams?.get?.("partner");
        return p ? p : undefined;
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "signatureDate",
          type: "date",
          label: "Date de signature",
          admin: { width: "50%", date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } },
        },
        {
          // Nommé `clientStatus` (et non `status`) pour éviter la collision de
          // nom d'enum avec le champ `_status` des brouillons dans la table de
          // versions (les deux se réduiraient à « ..._version_status »).
          name: "clientStatus",
          type: "select",
          label: "Statut",
          defaultValue: "actif",
          admin: { width: "50%" },
          options: [
            { label: "Actif", value: "actif" },
            { label: "Résilié", value: "resilie" },
            { label: "Archivé", value: "archive" },
          ],
        },
      ],
    },
    {
      name: "resiliationDate",
      type: "date",
      label: "Date de résiliation",
      admin: {
        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
        // N'apparaît que si le client est résilié.
        condition: (data) => data?.clientStatus === "resilie",
        description: "Fin du contrat client — la commission s'arrête à cette date.",
      },
    },

    // ─── Onglets : facturation / licences / historique ───────────────────────
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
    { name: "caPaye", type: "number", admin: { hidden: true } },
    { name: "caBrut", type: "number", admin: { hidden: true } },
    { name: "discountPct", type: "number", admin: { hidden: true } },
  ],
};
