import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { CHANNELS, PLACEMENTS } from "@/modules/forms/lib/form-schema";

/**
 * Ce qu'un visiteur a envoyé depuis le site vitrine.
 *
 * C'est la TRACE BRUTE, conservée telle qu'elle est arrivée. L'opportunité créée
 * dans la foulée en est une lecture métier : elle ne garde que ce qui a un sens
 * commercial, et l'équipe la modifie ensuite librement. La soumission, elle, ne
 * bouge plus — c'est ce qui permet de dire, six mois après, ce que la personne
 * avait réellement coché et par quelle campagne elle était arrivée.
 *
 * D'où l'absence d'écriture manuelle : une soumission n'est pas quelque chose
 * qu'on saisit, c'est quelque chose qu'on a reçu. Le serveur écrit en
 * `overrideAccess`, personne d'autre.
 *
 * Les dimensions d'attribution sont des CHAMPS À PART, indexés, et non un objet
 * fourre-tout : ce sont elles qui rendront les statistiques croisables (leads par
 * page, par campagne, A/B test des landing pages). Un tag concaténé ne s'agrège
 * pas — c'est exactement ce qui a rendu fragile le mapping d'étapes de Brevo.
 */

/**
 * Titre lisible de la fiche. Sans lui, une liste de soumissions n'affiche que des
 * identifiants — or ce qu'on cherche, c'est une société et une personne.
 */
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
                  /**
                   * Copie de l'identifiant au moment de l'envoi. La définition peut
                   * être renommée ou supprimée ; la soumission doit rester
                   * attribuable sans dépendre d'elle.
                   */
                  name: "formIdSnapshot",
                  type: "text",
                  label: "Identifiant du formulaire",
                  index: true,
                  admin: { width: "50%", readOnly: true },
                },
              ],
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
              name: "sourcePagePath",
              type: "text",
              label: "Page",
              index: true,
              admin: { readOnly: true, description: "Chemin de la page qui portait le formulaire." },
            },
            { name: "sourcePageUrl", type: "text", label: "URL complète", admin: { readOnly: true } },
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
                  /**
                   * Sans cette dimension, l'A/B test des landing pages n'est pas
                   * mesurable : la même définition de formulaire est atteignable
                   * depuis au moins cinq contextes (quatre URL plus l'override ?v=v2).
                   */
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
