import { randomBytes } from "crypto";

import type { CollectionConfig, Field } from "payload";

import { adminOnlyField, adminOnlyFieldRead, isAdmin, ownPartnerRecord } from "@/core/access";
import { validatePhone } from "@/core/lib/validators";

/** Génère un code partenaire unique au format TIM-XXXXXX (6 hex majuscules). */
const generatePartnerCode = (): string =>
  "TIM-" + randomBytes(3).toString("hex").toUpperCase();

/**
 * Barème du programme partenaire (PDF « Programme partenaire 2026 ») :
 * la commission et sa durée découlent du modèle choisi.
 */
const MODEL_RATE: Record<string, number> = {
  "apporteur-affaires": 15,
  revendeur: 25,
  "revendeur-sav": 40,
};
const MODEL_DURATION: Record<string, string> = {
  "apporteur-affaires": "24m",
  revendeur: "24m",
  "revendeur-sav": "vie",
};
const modelValue = (data: unknown): string | undefined =>
  (data as { partnershipModel?: string })?.partnershipModel;

/**
 * Champs INTERNES TIM (commission, conditions contractuelles, suivi commercial) :
 * un partenaire consultant SA propre fiche ne doit ni les voir ni les modifier.
 * Voir docs/RBAC-PLAN.md §7.
 */
const INTERNAL_FIELDS = new Set([
  "partnershipModel",
  "commissionRate",
  "commissionDuration",
  "contractNotes",
  "joinedAt",
  "acquisitionSource",
  "tier",
  "accountManager",
  "tags",
  "notes",
]);

/**
 * Applique récursivement un field-level access « admin uniquement » (lecture +
 * écriture) aux champs internes ci-dessus, en descendant dans les onglets et les
 * rows imbriqués. Une seule source de vérité (la liste INTERNAL_FIELDS) plutôt
 * que d'annoter chaque champ à la main.
 */
const protectInternalFields = (fields: Field[]): Field[] =>
  (fields as unknown[]).map((field) => {
    const f = field as {
      fields?: unknown[];
      tabs?: { fields: unknown[] }[];
      name?: string;
      access?: Record<string, unknown>;
    };
    let out: Record<string, unknown> = f as Record<string, unknown>;
    if (Array.isArray(f.fields)) {
      out = { ...out, fields: protectInternalFields(f.fields as Field[]) };
    }
    if (Array.isArray(f.tabs)) {
      out = {
        ...out,
        tabs: f.tabs.map((t) => ({ ...t, fields: protectInternalFields(t.fields as Field[]) })),
      };
    }
    if (typeof f.name === "string" && INTERNAL_FIELDS.has(f.name)) {
      out = { ...out, access: { ...f.access, read: adminOnlyFieldRead, update: adminOnlyField } };
    }
    return out;
  }) as Field[];

/**
 * Partenaires — apporteurs d'affaires (BTP) du programme de points/récompenses.
 *
 * - `email` reste la clé de rapprochement (migration + SSO app de Mathieu).
 * - `code` = code de parrainage/leads, généré automatiquement à la création.
 * - Le solde de points n'est PAS stocké : il se calcule en sommant les
 *   `point-transactions` (auditable, réversible) — voir la vue « Points &
 *   activité » (composant PartnerActivity) et lib/partner.ts getBalance.
 *
 * Fiche enrichie (onglets) : contact/identité, entreprise/légal, suivi
 * commercial, et une vue lecture seule de l'activité points.
 */
export const Partners: CollectionConfig = {
  slug: "partners",
  labels: { singular: "Partenaire", plural: "Partenaires" },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["partnerKind", "email", "name", "societe", "status"],
    group: "Partenaires",
  },
  // admin = toutes les fiches ; un partenaire = UNIQUEMENT la sienne (lecture +
  // mise à jour). Création/suppression réservées aux admins.
  access: {
    read: ownPartnerRecord,
    create: isAdmin,
    update: ownPartnerRecord,
    delete: isAdmin,
  },
  // Les champs internes TIM sont masqués aux partenaires (field-level access).
  fields: protectInternalFields([
    {
      name: "avatar",
      type: "upload",
      relationTo: "media",
      label: "Photo de profil",
      admin: {
        position: "sidebar",
        description: "Photo / logo du partenaire.",
        components: { Field: "/admin/fields/DirectUpload#default" },
      },
    },
    // ─── En-tête (toujours visible) ──────────────────────────────────────────
    {
      name: "partnerKind",
      type: "select",
      label: "Type de partenaire",
      required: true,
      defaultValue: "metier",
      options: [
        { label: "Métier — revendeur / apporteur d'affaires (commission)", value: "metier" },
        { label: "Utilisateur — personne (points & missions)", value: "utilisateur" },
      ],
      admin: {
        description:
          "Métier = payé en commission via un contrat. Utilisateur = personne individuelle qui gagne des points.",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "email",
          type: "email",
          label: "Email",
          required: true,
          unique: true,
          admin: { width: "50%", description: "Clé de rapprochement (app + migration)." },
        },
        { name: "name", type: "text", label: "Nom", admin: { width: "50%" } },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "firstName",
          type: "text",
          label: "Prénom",
          admin: { width: "50%", condition: (data) => data?.partnerKind === "utilisateur" },
        },
        {
          name: "phone",
          type: "text",
          label: "Téléphone",
          validate: validatePhone,
          admin: { width: "50%", placeholder: "+33 6 12 34 56 78" },
        },
      ],
    },

    // ─── Onglets ─────────────────────────────────────────────────────────────
    {
      type: "tabs",
      tabs: [
        // ── Contact & identité (partenaire métier) ──────────────────────────
        {
          label: "Contact & identité",
          description: "Coordonnées et nature du partenaire.",
          admin: { condition: (data) => data?.partnerKind !== "utilisateur" },
          fields: [
            {
              type: "row",
              fields: [
                { name: "societe", type: "text", label: "Société / raison sociale", admin: { width: "50%" } },
                {
                  name: "mobile",
                  type: "text",
                  label: "Mobile",
                  validate: validatePhone,
                  admin: { width: "50%", placeholder: "+33 6 12 34 56 78" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "contactName", type: "text", label: "Personne de contact", admin: { width: "50%" } },
                { name: "contactRole", type: "text", label: "Fonction du contact", admin: { width: "50%" } },
              ],
            },
            {
              name: "address",
              type: "group",
              label: "Adresse",
              fields: [
                { name: "street", type: "text", label: "Rue" },
                {
                  type: "row",
                  fields: [
                    { name: "postalCode", type: "text", label: "Code postal", admin: { width: "30%" } },
                    { name: "city", type: "text", label: "Ville", admin: { width: "40%" } },
                    { name: "country", type: "text", label: "Pays", defaultValue: "France", admin: { width: "30%" } },
                  ],
                },
              ],
            },
          ],
        },

        // ── Entreprise & légal (partenaire métier) ──────────────────────────
        {
          label: "Entreprise & légal",
          description: "Informations utiles à la facturation, aux cadeaux et aux seuils fiscaux.",
          admin: { condition: (data) => data?.partnerKind !== "utilisateur" },
          fields: [
            {
              type: "row",
              fields: [
                { name: "siret", type: "text", label: "SIRET / SIREN", admin: { width: "50%" } },
                { name: "vatNumber", type: "text", label: "TVA intracommunautaire", admin: { width: "50%" } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "legalForm", type: "text", label: "Forme juridique", admin: { width: "50%", placeholder: "SARL, SAS, EI…" } },
                { name: "headcount", type: "number", label: "Effectif", min: 0, admin: { width: "50%" } },
              ],
            },
          ],
        },

        // ── Contrat & programme partenaire (métier) ─────────────────────────
        {
          label: "Contrat & programme",
          description:
            "Modèle de partenariat (PDF 2026), commission et contrat signé. La commission et sa durée découlent du modèle.",
          admin: { condition: (data) => data?.partnerKind !== "utilisateur" },
          fields: [
            {
              name: "partnershipModel",
              type: "select",
              label: "Modèle de partenariat",
              options: [
                { label: "Apporteur d'affaires — 15 % / 24 mois", value: "apporteur-affaires" },
                { label: "Revendeur — 25 % / 24 mois", value: "revendeur" },
                { label: "Revendeur + S.A.V. — 40 % / à vie", value: "revendeur-sav" },
              ],
              admin: { description: "Détermine automatiquement le taux et la durée de commission." },
            },
            {
              type: "row",
              fields: [
                {
                  name: "commissionRate",
                  type: "number",
                  label: "Commission (%)",
                  min: 0,
                  max: 100,
                  admin: {
                    width: "50%",
                    description: "Pré-rempli selon le modèle. Modifiable (taux négocié) ; videz pour re-déduire.",
                  },
                  hooks: {
                    beforeChange: [
                      ({ value, siblingData }) => {
                        if (value !== undefined && value !== null && (value as unknown) !== "") return value;
                        const m = modelValue(siblingData);
                        return m ? (MODEL_RATE[m] ?? null) : null;
                      },
                    ],
                  },
                },
                {
                  name: "commissionDuration",
                  type: "select",
                  label: "Durée de commission",
                  admin: {
                    width: "50%",
                    description: "Pré-remplie selon le modèle. Modifiable ; videz pour re-déduire.",
                  },
                  options: [
                    { label: "24 mois", value: "24m" },
                    { label: "À vie", value: "vie" },
                  ],
                  hooks: {
                    beforeChange: [
                      ({ value, siblingData }) => {
                        if (value !== undefined && value !== null && (value as unknown) !== "") return value;
                        const m = modelValue(siblingData);
                        return m ? (MODEL_DURATION[m] ?? null) : null;
                      },
                    ],
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "contractSigned", type: "checkbox", label: "Contrat signé", defaultValue: false, admin: { width: "34%" } },
                {
                  name: "contractSignatureDate",
                  type: "date",
                  label: "Date de signature",
                  admin: { width: "33%", date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } },
                },
                {
                  name: "contractStartDate",
                  type: "date",
                  label: "Début du contrat",
                  admin: { width: "33%", date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } },
                },
              ],
            },
            {
              name: "contractEndDate",
              type: "date",
              label: "Fin du contrat",
              admin: {
                description: "Pour un modèle 24 mois. Laisser vide si « à vie ».",
                date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
              },
            },
            {
              name: "contractDocument",
              type: "upload",
              relationTo: "media",
              label: "Contrat (document signé)",
              admin: {
                description: "PDF du contrat signé.",
                custom: { accept: "*", noun: "un fichier" },
                components: { Field: "/admin/fields/DirectUpload#default" },
              },
            },
            {
              name: "contractAttachments",
              type: "upload",
              relationTo: "media",
              hasMany: true,
              label: "Autres documents",
              admin: {
                description: "Avenants, annexes, pièces justificatives…",
                custom: { accept: "*", noun: "un fichier" },
                components: { Field: "/admin/fields/DirectUpload#default" },
              },
            },
            { name: "contractNotes", type: "textarea", label: "Notes contrat" },
          ],
        },

        // ── Suivi commercial / programme (métier) ───────────────────────────
        {
          label: "Suivi commercial",
          description: "Relation, acquisition et notes internes.",
          admin: { condition: (data) => data?.partnerKind !== "utilisateur" },
          fields: [
            {
              type: "row",
              fields: [
                { name: "joinedAt", type: "date", label: "Date d'adhésion", admin: { width: "33%", date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } } },
                {
                  name: "acquisitionSource",
                  type: "select",
                  label: "Source d'acquisition",
                  admin: { width: "33%" },
                  options: [
                    { label: "Recommandation", value: "recommandation" },
                    { label: "Salon / événement", value: "salon" },
                    { label: "Prospection", value: "prospection" },
                    { label: "Site web", value: "site-web" },
                    { label: "Réseaux sociaux", value: "reseaux-sociaux" },
                    { label: "Autre", value: "autre" },
                  ],
                },
                {
                  name: "tier",
                  type: "select",
                  label: "Niveau",
                  admin: { width: "34%" },
                  options: [
                    { label: "Bronze", value: "bronze" },
                    { label: "Argent", value: "argent" },
                    { label: "Or", value: "or" },
                  ],
                },
              ],
            },
            {
              name: "accountManager",
              type: "relationship",
              relationTo: "users",
              label: "Référent interne (TIM)",
              admin: { description: "Commercial / interlocuteur TIM qui suit ce partenaire." },
            },
            {
              name: "tags",
              type: "text",
              hasMany: true,
              label: "Tags",
              admin: { description: "Étiquettes libres (ex. prioritaire, région Sud…)." },
            },
            { name: "notes", type: "richText", label: "Notes internes" },
          ],
        },

        // ── Clients & commission (métier) ───────────────────────────────────
        {
          label: "Clients & commission",
          admin: { condition: (data) => data?.partnerKind !== "utilisateur" },
          fields: [
            // Synthèse commission (tuiles calculées en direct).
            {
              name: "clientsPanel",
              type: "ui",
              admin: {
                components: {
                  Field: "/modules/partner/admin/PartnerClientsPanel#PartnerClientsPanel",
                },
              },
            },
            // Liste des clients apportés : ajout/édition en DRAWER (modal),
            // sans quitter la page. Le partenaire est associé automatiquement.
            {
              name: "clients",
              type: "join",
              collection: "partner-clients",
              on: "partner",
              label: "Clients apportés",
              defaultSort: "-createdAt",
              admin: {
                allowCreate: true,
                defaultColumns: ["companyName", "clientStatus", "signatureDate"],
              },
            },
          ],
        },

        // ── Points & activité — partenaire UTILISATEUR uniquement ───────────
        {
          label: "Points & activité",
          admin: { condition: (data) => data?.partnerKind === "utilisateur" },
          fields: [
            // Synthèse (solde, total gagné/dépensé, missions, commandes).
            {
              name: "activity",
              type: "ui",
              admin: {
                components: {
                  Field: "/modules/partner/admin/PartnerActivity#PartnerActivity",
                },
              },
            },
            // Transactions de points : ajout/édition en DRAWER, sans quitter la
            // fiche. Le partenaire est associé automatiquement.
            {
              name: "ledger",
              type: "join",
              collection: "point-transactions",
              on: "partner",
              label: "Transactions de points",
              defaultSort: "-createdAt",
              admin: {
                allowCreate: true,
                defaultColumns: ["delta", "source", "motif", "createdAt"],
              },
            },
          ],
        },
      ],
    },

    // ─── Barre latérale ──────────────────────────────────────────────────────
    {
      name: "code",
      type: "text",
      label: "Code partenaire",
      unique: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Généré automatiquement (TIM-XXXXXX).",
      },
      hooks: {
        beforeChange: [({ value }) => value || generatePartnerCode()],
      },
    },
    {
      name: "status",
      type: "select",
      label: "Statut",
      defaultValue: "active",
      options: [
        { label: "Actif", value: "active" },
        { label: "En pause", value: "paused" },
        { label: "Archivé", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "appUserId",
      type: "text",
      label: "ID utilisateur app",
      admin: {
        position: "sidebar",
        description: "Identifiant sur app.tim-management.co, si disponible.",
      },
    },
  ]),
};
