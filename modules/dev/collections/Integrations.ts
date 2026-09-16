import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { documentsField } from "@/core/fields/documents";
import { stampDocuments } from "@/core/hooks/documents";
import { assigneeField } from "@/modules/dev/fields/assignee";
import { PASSWORD_MASK, encryptPasswordValue } from "@/modules/marketing/lib/credential-secrets";

/**
 * Connexions API — une fiche par logiciel tiers que le LOGICIEL TIM
 * (app.tim-management.co) connecte ou connectera : paie, comptabilité,
 * ERP, signature… chez les clients.
 *
 * Pas les outils du support (Pennylane, Brevo, INSEE, Google) : ceux-là sont
 * de l'infrastructure, décrits dans le code et docs/. Ici, c'est le produit.
 *
 * Ce qu'on cherche en ouvrant la fiche, dans l'ordre : de quel logiciel il
 * s'agit et ce qu'on peut en tirer, QUI est notre interlocuteur chez eux, le
 * compte de démonstration pour que l'équipe puisse entrer et voir, la doc de
 * l'API, et le fil des échanges qu'on a eus avec eux. Avant, tout ça vivait
 * dans des e-mails et des têtes.
 *
 * Le mot de passe du compte démo est CHIFFRÉ au repos et masqué à la lecture,
 * comme les accès de test des clients ; il se révèle d'un clic sur la fiche
 * (admins seulement — la collection l'est déjà), sans code par e-mail : c'est
 * un compte de démonstration chez un éditeur, pas l'accès d'un client.
 *
 * Accès : ADMIN SEUL, comme les développements — c'est de l'outillage interne.
 */

const INTEGRATION_KINDS = [
  { label: "Comptabilité / facturation", value: "compta" },
  { label: "Paie / RH", value: "paie" },
  { label: "ERP / gestion", value: "erp" },
  { label: "CRM / marketing", value: "crm" },
  { label: "Signature / documents", value: "documents" },
  { label: "Données publiques", value: "donnees" },
  { label: "Messagerie / agenda", value: "messagerie" },
  { label: "Autre", value: "autre" },
] as const;

const INTEGRATION_STATUS = [
  { label: "En étude", value: "etude" },
  { label: "En cours d'intégration", value: "en-cours" },
  { label: "Connectée", value: "connectee" },
  { label: "Abandonnée", value: "abandonnee" },
] as const;

type Comment = { body?: unknown; author?: unknown; at?: unknown };

/**
 * Auteur et date d'un échange, posés à l'écriture et jamais réécrits — même
 * règle que la discussion d'un point de checklist (dev/hooks/checklist.ts) :
 * un message reste de qui l'a écrit, même si quelqu'un d'autre réenregistre.
 * Les lignes sans texte sont retirées plutôt qu'horodatées.
 */
const stampExchanges: CollectionBeforeChangeHook = ({ data, req }) => {
  const raw = data?.exchanges;
  if (!Array.isArray(raw)) return data;
  const now = new Date().toISOString();
  const userId = (req?.user as { id?: string | number } | undefined)?.id;
  const written = raw.filter(
    (c): c is Comment => Boolean(c) && typeof c === "object" && typeof (c as Comment).body === "string" && ((c as Comment).body as string).trim() !== "",
  );
  for (const c of written) {
    if (c.at == null) c.at = now;
    if (c.author == null && userId != null) c.author = userId;
  }
  return { ...data, exchanges: written };
};

export const Integrations: CollectionConfig = {
  slug: "integrations",
  labels: { singular: "Connexion API", plural: "Connexions API" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["logo", "name", "kind", "status", "contactName", "updatedAt"],
    listSearchableFields: ["name", "contactName", "contactEmail"],
    group: "Développements",
    description: "Une fiche par logiciel tiers que le logiciel TIM connecte (ou connectera) : l'interlocuteur, le compte démo, la doc, les échanges.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "name",
  hooks: {
    beforeChange: [stampExchanges, stampDocuments],
  },
  fields: [
    // ─── En-tête ─────────────────────────────────────────────────────────────
    {
      type: "row",
      fields: [
        { name: "name", type: "text", label: "Logiciel", required: true, admin: { width: "50%", placeholder: "Sage, Silae, Cegid, Yousign…" } },
        {
          name: "kind",
          type: "select",
          label: "Type",
          options: [...INTEGRATION_KINDS],
          defaultValue: "autre",
          admin: { width: "25%" },
        },
        {
          name: "status",
          type: "select",
          label: "État",
          options: [...INTEGRATION_STATUS],
          defaultValue: "etude",
          admin: { width: "25%" },
        },
      ],
    },
    {
      name: "website",
      type: "text",
      label: "Site du logiciel",
      admin: { placeholder: "https://…" },
      validate: (value: unknown) =>
        !value || (typeof value === "string" && /^https?:\/\/.+\..+/i.test(value.trim()))
          ? true
          : "Adresse invalide : elle doit commencer par http:// ou https://.",
    },

    {
      type: "tabs",
      tabs: [
        // ─── Le logiciel ─────────────────────────────────────────────────────
        {
          label: "Le logiciel",
          fields: [
            {
              name: "summary",
              type: "textarea",
              label: "Ce que c'est",
              admin: {
                description: "Ce que fait le logiciel, pour qui, et pourquoi on s'y connecte. Markdown accepté.",
                components: { Field: "/modules/dev/admin/MarkdownField#MarkdownField" },
              },
            },
            {
              name: "capabilities",
              type: "textarea",
              label: "Ce que l'API permet",
              admin: {
                description: "Ce qu'on peut lire, écrire, recevoir (webhooks) — et ce qu'on ne peut pas. Markdown accepté.",
                components: { Field: "/modules/dev/admin/MarkdownField#MarkdownField" },
              },
            },
            {
              name: "docUrl",
              type: "text",
              label: "Documentation de l'API",
              admin: { placeholder: "https://…" },
              validate: (value: unknown) =>
                !value || (typeof value === "string" && /^https?:\/\/.+\..+/i.test(value.trim()))
                  ? true
                  : "Adresse invalide : elle doit commencer par http:// ou https://.",
            },
            {
              name: "links",
              type: "array",
              label: "Autres liens",
              labels: { singular: "Lien", plural: "Liens" },
              admin: {
                description: "Console développeur, statut de l'API, changelog, portail partenaire…",
                components: { Field: "/modules/dev/admin/DevLinks#DevLinks" },
              },
              fields: [
                {
                  name: "url",
                  type: "text",
                  label: "Adresse",
                  required: true,
                  validate: (value: unknown) =>
                    typeof value === "string" && /^https?:\/\/.+\..+/i.test(value.trim())
                      ? true
                      : "Adresse invalide : elle doit commencer par http:// ou https://.",
                },
                { name: "label", type: "text", label: "Intitulé" },
              ],
            },
          ],
        },

        // ─── L'interlocuteur ─────────────────────────────────────────────────
        {
          label: "Interlocuteur",
          description: "Qui on appelle chez eux.",
          fields: [
            {
              type: "row",
              fields: [
                { name: "contactName", type: "text", label: "Nom", admin: { width: "50%" } },
                { name: "contactRole", type: "text", label: "Rôle", admin: { width: "50%", placeholder: "Partenariats, support API…" } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "contactEmail", type: "email", label: "E-mail", admin: { width: "50%" } },
                { name: "contactPhone", type: "text", label: "Téléphone", admin: { width: "50%" } },
              ],
            },
            {
              name: "contactNotes",
              type: "textarea",
              label: "À savoir",
              admin: { description: "Disponibilités, canal préféré, autres personnes à connaître chez eux." },
            },
          ],
        },

        // ─── Le compte démo ──────────────────────────────────────────────────
        {
          label: "Compte démo",
          description: "Pour que l'équipe puisse entrer dans le logiciel et voir.",
          fields: [
            {
              name: "demoUrl",
              type: "text",
              label: "Adresse de connexion",
              admin: { placeholder: "https://app.…/login" },
              validate: (value: unknown) =>
                !value || (typeof value === "string" && /^https?:\/\/.+\..+/i.test(value.trim()))
                  ? true
                  : "Adresse invalide : elle doit commencer par http:// ou https://.",
            },
            {
              type: "row",
              fields: [
                { name: "demoEmail", type: "text", label: "Identifiant / e-mail", admin: { width: "50%" } },
                {
                  name: "demoPassword",
                  type: "text",
                  label: "Mot de passe",
                  admin: {
                    width: "50%",
                    components: { Field: "/modules/dev/admin/SecretField#SecretField" },
                  },
                  hooks: {
                    // Chiffré à l'écriture, masqué à la lecture — le masque doit
                    // revenir intact à l'écriture suivante, sinon enregistrer la
                    // fiche sans y toucher remplacerait le mot de passe par des points.
                    beforeChange: [
                      ({ value, originalDoc, req }) =>
                        encryptPasswordValue(value, {
                          payload: req.payload,
                          id: originalDoc?.id,
                          collection: "integrations",
                          field: "demoPassword",
                        }),
                    ],
                    afterRead: [({ value }) => (value ? PASSWORD_MASK : value)],
                  },
                },
              ],
            },
            {
              name: "demoNotes",
              type: "textarea",
              label: "À savoir",
              admin: { description: "Environnement (sandbox / prod), données de test, limites, clé API de test à demander à…" },
            },
          ],
        },

        // ─── Les échanges ────────────────────────────────────────────────────
        {
          label: "Échanges",
          description: "Le fil de ce qu'on s'est dit avec eux : réunions, réponses du support, engagements.",
          fields: [
            {
              name: "exchanges",
              type: "array",
              label: "Échanges",
              labels: { singular: "Échange", plural: "Échanges" },
              admin: {
                className: "dev-comments",
                // La même discussion que sur un point de checklist : on vient
                // dire une phrase, pas remplir un formulaire.
                components: { Field: "/modules/dev/admin/Discussion#Discussion" },
              },
              fields: [
                { name: "body", type: "textarea", label: false },
                assigneeField({ name: "askedTo", label: "Réponse attendue de" }),
                {
                  type: "row",
                  fields: [
                    { name: "author", type: "relationship", relationTo: "users", label: "Par", admin: { width: "50%", readOnly: true } },
                    {
                      name: "at",
                      type: "date",
                      label: "Le",
                      admin: { width: "50%", readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } },
                    },
                  ],
                },
              ],
            },
            documentsField({
              description: "Contrats, présentations, exports d'exemple, comptes rendus.",
            }),
          ],
        },

        // ─── Les développements liés ─────────────────────────────────────────
        {
          label: "Développements",
          description: "Ce qui se développe autour de cette connexion.",
          fields: [
            {
              name: "developments",
              type: "join",
              collection: "developments",
              on: "integrations",
              label: "Développements liés",
              admin: { defaultColumns: ["number", "title", "status", "priority"] },
            },
          ],
        },
      ],
    },

    // ─── Barre latérale ──────────────────────────────────────────────────────
    {
      name: "logo",
      type: "upload",
      relationTo: "media",
      label: "Logo",
      admin: {
        position: "sidebar",
        description: "Le logo du logiciel — on le reconnaît avant de lire.",
        components: { Field: "/admin/fields/DirectUpload#default" },
      },
    },
    assigneeField({ label: "Référent chez TIM", description: "Qui suit cette connexion de notre côté.", position: "sidebar" }),
  ],
};
