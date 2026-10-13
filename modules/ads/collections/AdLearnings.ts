import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { NOTEBOOK_SCOPES } from "@/modules/ads/collections/AdInstructions";

/**
 * Le carnet d'apprentissages de l'agent (plan Publicité, §9 quinquies) : ce
 * qu'on a constaté, une phrase par ligne, avec sa confiance et sa preuve.
 *
 * Seuls les apprentissages « Actif » sont lus au lancement d'un passage. Passée
 * la date de revalidation (90 jours par défaut), l'agent les lit encore, avec
 * la mention « à revalider ». Un apprentissage de campagne ne devient global
 * que par le geste de Charlie : « Global proposé » attend, et le passage en
 * global actif note qui l'a validé et quand.
 *
 * En 3c, le carnet ne se remplit qu'à la main et par les refus (4 ter) ; les
 * tests de la 3d y écriront leurs verdicts.
 */
export const LEARNING_STATUSES = [
  { label: "Actif", value: "actif" },
  { label: "Global proposé (à valider)", value: "global-propose" },
  { label: "Archivé", value: "archive" },
] as const;

export const LEARNING_SOURCES = [
  { label: "Test", value: "test" },
  { label: "Refus d'une créa", value: "refus" },
  { label: "Consigne", value: "consigne" },
  { label: "Résultat d'une décision", value: "resultat-decision" },
  { label: "Saisie", value: "saisie" },
] as const;

export const REVALIDATE_DAYS = 90;

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString();

/**
 * Dates et validation : `learnedAt` au jour de la saisie, revalidation 90 jours
 * plus tard si personne n'en a fixé une, et la promotion en global datée et
 * signée quand elle a lieu.
 */
const stampLearning: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data) return data;
  const out = { ...data };
  const learnedAt = (out.learnedAt ?? originalDoc?.learnedAt ?? new Date().toISOString()) as string;
  out.learnedAt = learnedAt;
  if (!(out.revalidateAt ?? originalDoc?.revalidateAt)) out.revalidateAt = addDays(learnedAt, REVALIDATE_DAYS);
  const scope = out.scope ?? originalDoc?.scope;
  // Global : la campagne choisie avant n'a plus de sens, et la photo la lirait encore.
  if (scope === "global") out.campaign = null;
  const status = out.status ?? originalDoc?.status;
  const wasGlobalActive = originalDoc?.scope === "global" && originalDoc?.status === "actif";
  if (scope === "global" && status === "actif" && !wasGlobalActive) {
    out.promotedBy = req.user?.id ?? null;
    out.promotedAt = new Date().toISOString();
  }
  return out;
};

export const AdLearnings: CollectionConfig = {
  slug: "ad-learnings",
  labels: { singular: "Apprentissage", plural: "Carnet d'apprentissages" },
  admin: {
    useAsTitle: "statement",
    defaultColumns: ["statement", "scope", "campaign", "confidence", "status", "revalidateAt"],
    group: "Publicité",
    description: "Ce que les campagnes ont appris, une phrase par ligne. L'agent les lit au lancement et cite ceux qui ont pesé sur chaque décision.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "-learnedAt",
  hooks: { beforeChange: [stampLearning] },
  fields: [
    { name: "statement", type: "text", label: "Ce qu'on a appris", required: true, maxLength: 300, admin: { placeholder: "L'angle « temps gagné » coûte moins cher par lead qualifié que « zéro papier »." } },
    {
      type: "row",
      fields: [
        { name: "scope", type: "select", label: "Portée", options: [...NOTEBOOK_SCOPES], defaultValue: "campagne", required: true, admin: { width: "25%" } },
        {
          name: "campaign",
          type: "relationship",
          relationTo: "ad-campaigns",
          label: "Campagne",
          index: true,
          validate: (value: unknown, { siblingData }: { siblingData: { scope?: string } }) =>
            siblingData?.scope !== "campagne" || Boolean(value) || "Choisissez la campagne.",
          admin: { width: "25%", condition: (_, s) => s?.scope === "campagne" },
        },
        {
          name: "confidence",
          type: "select",
          label: "Confiance",
          options: [
            { label: "Faible", value: "faible" },
            { label: "Moyenne", value: "moyenne" },
            { label: "Forte", value: "forte" },
          ],
          defaultValue: "moyenne",
          required: true,
          admin: { width: "25%" },
        },
        { name: "status", type: "select", label: "État", options: [...LEARNING_STATUSES], defaultValue: "actif", required: true, index: true, admin: { width: "25%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "source", type: "select", label: "Source", options: [...LEARNING_SOURCES], defaultValue: "saisie", required: true, admin: { width: "34%" } },
        { name: "learnedAt", type: "date", label: "Appris le", admin: { width: "33%" } },
        { name: "revalidateAt", type: "date", label: "À revalider le", admin: { width: "33%", description: `${REVALIDATE_DAYS} jours après, par défaut.` } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "sourceDecision", type: "relationship", relationTo: "ad-decisions", label: "Décision d'origine", admin: { width: "50%" } },
        { name: "sourceCreative", type: "relationship", relationTo: "ad-creatives", label: "Créa d'origine", admin: { width: "50%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "promotedBy", type: "relationship", relationTo: "users", label: "Validé en global par", admin: { width: "50%", readOnly: true } },
        { name: "promotedAt", type: "date", label: "Validé en global le", admin: { width: "50%", readOnly: true } },
      ],
    },
  ],
};
