import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Dépenses IA de la publicité — une ligne par appel payant (texte, image,
 * vidéo), écrite par le serveur, jamais saisie.
 *
 * Un registre plutôt qu'un compteur : il répond à « combien a coûté cette
 * créa », « qu'a-t-on dépensé ce mois-ci en vidéo », et c'est lui que les
 * plafonds relisent avant chaque appel. Un compteur ne dirait que le total, et
 * se remettrait mal d'un appel qui échoue au milieu.
 */
export const AD_SPEND_KINDS = [
  { label: "Textes", value: "texte" },
  { label: "Images", value: "image" },
  { label: "Vidéo générée", value: "video" },
] as const;

export type AdSpendKind = (typeof AD_SPEND_KINDS)[number]["value"];

export const AdAiUsage: CollectionConfig = {
  slug: "ad-ai-usage",
  labels: { singular: "Dépense IA", plural: "Dépenses IA" },
  admin: {
    useAsTitle: "detail",
    defaultColumns: ["createdAt", "kind", "model", "eur", "campaign", "detail"],
    group: "Publicité",
    description: "Chaque appel payant de l'atelier de créas, avec son coût. Écrit par le serveur ; les plafonds le relisent avant chaque appel.",
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    { name: "kind", type: "select", label: "Nature", options: [...AD_SPEND_KINDS], required: true, index: true },
    {
      type: "row",
      fields: [
        { name: "provider", type: "text", label: "Fournisseur", admin: { width: "33%" } },
        { name: "model", type: "text", label: "Modèle", admin: { width: "33%" } },
        { name: "eur", type: "number", label: "Coût (€)", required: true, admin: { width: "34%" } },
      ],
    },
    { name: "usd", type: "number", label: "Coût facturé ($)" },
    { name: "campaign", type: "relationship", relationTo: "ad-campaigns", label: "Campagne", index: true },
    { name: "batch", type: "text", label: "Lot", index: true, admin: { description: "Les créas nées de cet appel portent le même lot." } },
    { name: "detail", type: "text", label: "Détail" },
    { name: "usage", type: "json", label: "Consommation", admin: { description: "Tokens, images ou secondes, tels que le fournisseur les a comptés." } },
  ],
};
