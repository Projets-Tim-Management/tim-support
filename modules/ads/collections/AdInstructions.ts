import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Consignes de l'agent de campagne (plan Publicité, §9 quinquies) : ce que
 * Charlie exige, une phrase par ligne — « Jamais de chantier de nuit sur les
 * visuels ». Globales ou propres à une campagne.
 *
 * Seules les consignes « Active » sont lues, au lancement d'un passage (une
 * photo, voir agent/notebook.ts). Une consigne née d'un refus de créa arrive
 * « Proposée » (commit 4 ter) et ne compte qu'une fois confirmée.
 *
 * Une consigne n'est qu'un texte donné au modèle : elle ne peut ni sauter une
 * vérification codée, ni en changer un seuil.
 */
export const INSTRUCTION_STATUSES = [
  { label: "Active", value: "active" },
  { label: "Proposée", value: "proposee" },
  { label: "Écartée", value: "ecartee" },
] as const;

export const NOTEBOOK_SCOPES = [
  { label: "Toutes les campagnes", value: "global" },
  { label: "Une campagne", value: "campagne" },
] as const;

/** Qui a confirmé et quand : posé quand la consigne DEVIENT active, pas avant. Une consigne globale perd sa campagne. */
const stampConfirmation: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data) return data;
  const out = { ...data };
  // Globale : la campagne choisie avant n'a plus de sens.
  if ((out.scope ?? originalDoc?.scope) === "global") out.campaign = null;
  const becomesActive = (out.status ?? originalDoc?.status) === "active" && originalDoc?.status !== "active";
  return becomesActive ? { ...out, confirmedBy: req.user?.id ?? null, confirmedAt: new Date().toISOString() } : out;
};

export const AdInstructions: CollectionConfig = {
  slug: "ad-instructions",
  labels: { singular: "Consigne", plural: "Consignes" },
  admin: {
    useAsTitle: "text",
    defaultColumns: ["text", "scope", "campaign", "status", "confirmedAt"],
    group: "Publicité",
    description:
      "Ce que l'agent doit respecter, une phrase par consigne. Lues au lancement de chaque passage ; elles n'assouplissent aucun garde-fou du code.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "-createdAt",
  hooks: { beforeChange: [stampConfirmation] },
  fields: [
    { name: "text", type: "textarea", label: "Consigne", required: true, maxLength: 500, admin: { placeholder: "Jamais de chantier de nuit sur les visuels." } },
    {
      type: "row",
      fields: [
        { name: "scope", type: "select", label: "Portée", options: [...NOTEBOOK_SCOPES], defaultValue: "global", required: true, admin: { width: "34%" } },
        {
          name: "campaign",
          type: "relationship",
          relationTo: "ad-campaigns",
          label: "Campagne",
          index: true,
          validate: (value: unknown, { siblingData }: { siblingData: { scope?: string } }) =>
            siblingData?.scope !== "campagne" || Boolean(value) || "Choisissez la campagne.",
          admin: { width: "33%", condition: (_, s) => s?.scope === "campagne" },
        },
        { name: "status", type: "select", label: "État", options: [...INSTRUCTION_STATUSES], defaultValue: "active", required: true, index: true, admin: { width: "33%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "origin", type: "select", label: "Origine", options: [{ label: "Saisie", value: "saisie" }, { label: "Refus d'une créa", value: "refus" }, { label: "Retouche d'une créa", value: "retouche" }], defaultValue: "saisie", admin: { width: "34%", readOnly: true } },
        { name: "confirmedBy", type: "relationship", relationTo: "users", label: "Confirmée par", admin: { width: "33%", readOnly: true } },
        { name: "confirmedAt", type: "date", label: "Confirmée le", admin: { width: "33%", readOnly: true } },
      ],
    },
    { name: "sourceCreative", type: "relationship", relationTo: "ad-creatives", label: "Créa refusée d'origine", admin: { readOnly: true, condition: (d) => d?.origin === "refus" } },
    { name: "refusalReason", type: "text", label: "Motif du refus", admin: { readOnly: true, condition: (d) => d?.origin === "refus" } },
  ],
};
