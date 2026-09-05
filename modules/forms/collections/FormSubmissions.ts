import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { CHANNEL_SOURCES } from "@/modules/forms/lib/channel";
import { CHANNELS, PLACEMENTS } from "@/modules/forms/lib/form-schema";

/**
 * Ce qu'un visiteur a envoyé depuis le site vitrine — la trace BRUTE.
 *
 * L'opportunité créée dans la foulée en est une lecture métier, que l'équipe
 * modifie ensuite ; la soumission, elle, ne bouge plus. C'est ce qui permet de
 * dire six mois après ce que la personne avait coché et par quelle campagne elle
 * était arrivée. D'où l'absence d'écriture manuelle : elle est reçue, pas saisie.
 *
 * Les dimensions d'attribution sont des champs à part, indexés, et non un objet
 * fourre-tout : un tag concaténé ne s'agrège pas.
 */

/** Titre lisible : une liste d'identifiants ne dit ni la société ni la personne. */
const buildSummary: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const answers = (data?.answers ?? originalDoc?.answers ?? {}) as Record<string, unknown>;
  const company = String(answers.company_name ?? "").trim();
  const person = String(answers.nom ?? "").trim();
  const summary = [company, person].filter(Boolean).join(" — ");
  return { ...data, summary: summary || "Soumission sans nom" };
};

export const FormSubmissions: CollectionConfig = {
  slug: "form-submissions",
  labels: { singular: "Soumission", plural: "Soumissions" },
  admin: {
    useAsTitle: "summary",
    defaultColumns: ["summary", "formIdSnapshot", "channel", "placement", "createdAt"],
    group: "Marketing",
    description:
      "Ce que les visiteurs du site vitrine ont envoyé, tel qu'ils l'ont envoyé. Lecture seule.",
  },
  access: {
    read: isAdmin,
    // Une soumission n'est pas saisie : elle est reçue. Seul le serveur écrit.
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  hooks: { beforeChange: [buildSummary] },
  fields: [
    // Titre calculé (useAsTitle) — non éditable en UI.
    { name: "summary", type: "text", admin: { hidden: true } },
    {
      type: "tabs",
      tabs: [
        {
          label: "Réponses",
          description: "Ce que la personne a rempli, avec les libellés qu'elle a vus.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "form",
                  type: "relationship",
                  relationTo: "forms",
                  label: "Formulaire",
                  index: true,
                  admin: { width: "50%", readOnly: true },
                },
                {
                  // Copie au moment de l'envoi : la définition peut être renommée
                  // ou supprimée, la soumission doit rester attribuable.
                  name: "formIdSnapshot",
                  type: "text",
                  label: "Identifiant du formulaire",
                  index: true,
                  admin: { width: "50%", readOnly: true },
                },
              ],
            },
            {
              /**
               * Identifiant OPAQUE renvoyé au site, qui le pousse dans GA4 :
               * il rapproche un événement de conversion de cette ligne sans faire
               * transiter de donnée personnelle. Non séquentiel — un identifiant
               * énumérable révélerait le volume de leads à qui sait compter.
               */
              name: "submissionId",
              type: "text",
              label: "Identifiant de soumission",
              index: true,
              unique: true,
              admin: { readOnly: true },
            },
            {
              name: "answers",
              type: "json",
              label: "Réponses",
              admin: {
                readOnly: true,
                description: "Valeurs postées, telles que reçues.",
              },
            },
          ],
        },
        {
          label: "Attribution",
          description: "D'où vient ce lead. C'est ce qui alimente les statistiques.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "channel",
                  type: "select",
                  label: "Canal",
                  options: [...CHANNELS],
                  index: true,
                  admin: { width: "50%", readOnly: true },
                },
                {
                  name: "placement",
                  type: "select",
                  label: "Emplacement",
                  options: [...PLACEMENTS],
                  index: true,
                  admin: { width: "50%", readOnly: true },
                },
              ],
            },
            {
              name: "channelSource",
              type: "select",
              label: "Canal déduit de",
              options: [...CHANNEL_SOURCES],
              index: true,
              admin: {
                readOnly: true,
                description:
                  "« Clic payant » est un fait ; « landing page » est une présomption. Beaucoup de présomptions = le taggage automatique de Google Ads ne remonte plus, ou le cookie d'attribution ne tient pas.",
              },
            },
            {
              name: "sourcePagePath",
              type: "text",
              label: "Page",
              index: true,
              admin: { readOnly: true, description: "Chemin de la page qui portait le formulaire." },
            },
            { name: "sourcePageUrl", type: "text", label: "URL complète", admin: { readOnly: true } },
            {
              name: "landingPath",
              type: "text",
              label: "Page d'arrivée",
              index: true,
              admin: {
                readOnly: true,
                description:
                  "Première page de la visite. Différente de « Page » quand la personne a navigué avant de remplir le formulaire.",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "lpSlug",
                  type: "text",
                  label: "Landing page",
                  index: true,
                  admin: { width: "50%", readOnly: true },
                },
                {
                  // Sans elle, l'A/B test des landing pages n'est pas mesurable :
                  // la même LP est atteignable depuis au moins cinq contextes.
                  name: "lpVariant",
                  type: "text",
                  label: "Variante",
                  index: true,
                  admin: { width: "50%", readOnly: true },
                },
              ],
            },
            { name: "referrer", type: "text", label: "Référent", admin: { readOnly: true } },
            {
              type: "collapsible",
              label: "Campagne",
              admin: { initCollapsed: true },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "utmSource", type: "text", label: "utm_source", index: true, admin: { width: "33%", readOnly: true } },
                    { name: "utmMedium", type: "text", label: "utm_medium", index: true, admin: { width: "33%", readOnly: true } },
                    { name: "utmCampaign", type: "text", label: "utm_campaign", index: true, admin: { width: "34%", readOnly: true } },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    { name: "utmTerm", type: "text", label: "utm_term", admin: { width: "50%", readOnly: true } },
                    { name: "utmContent", type: "text", label: "utm_content", admin: { width: "50%", readOnly: true } },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    { name: "gclid", type: "text", label: "gclid", admin: { width: "50%", readOnly: true } },
                    { name: "msclkid", type: "text", label: "msclkid", admin: { width: "50%", readOnly: true } },
                    {
                      name: "oaiclid",
                      type: "text",
                      label: "oaiclid",
                      admin: {
                        width: "50%",
                        readOnly: true,
                        description: "Référence de clic ChatGPT Ads, posée par la vitrine.",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Suite",
          description: "Ce que la soumission est devenue.",
          fields: [
            {
              name: "client",
              type: "relationship",
              relationTo: "partner-clients",
              label: "Opportunité créée",
              index: true,
              admin: { readOnly: true },
            },
            {
              name: "processingStatus",
              type: "select",
              label: "Traitement",
              defaultValue: "recue",
              options: [
                { label: "Reçue", value: "recue" },
                { label: "Opportunité créée", value: "opportunite" },
                { label: "Opportunité en brouillon", value: "brouillon" },
                { label: "Échec", value: "echec" },
              ],
              index: true,
              admin: {
                readOnly: true,
                description:
                  "« Brouillon » signale une soumission sans e-mail exploitable : la fiche existe mais n'est pas publiée.",
              },
            },
            {
              name: "processingError",
              type: "textarea",
              label: "Détail de l'échec",
              admin: {
                readOnly: true,
                condition: (data) => data?.processingStatus === "echec",
              },
            },
            {
              type: "collapsible",
              label: "Contexte technique",
              admin: { initCollapsed: true },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "ip", type: "text", label: "IP", admin: { width: "50%", readOnly: true } },
                    { name: "sessionId", type: "text", label: "Session", admin: { width: "50%", readOnly: true } },
                  ],
                },
                { name: "userAgent", type: "text", label: "Navigateur", admin: { readOnly: true } },
              ],
            },
          ],
        },
      ],
    },
  ],
};
