import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Concurrents suivis (plan Publicité, §9 quater, décision 2 du 29/09/2026).
 *
 * La liste de départ se saisit à la main. L'agent peut en proposer d'autres,
 * trouvés par mots-clés dans la bibliothèque publicitaire : ils naissent
 * `propose` et n'entrent dans la liste (`suivi`) que sur le geste de Charlie.
 * Seuls les `suivi` sont lus quand l'agent étudie les publicités concurrentes.
 */
export const COMPETITOR_STATUSES = [
  { label: "Suivi", value: "suivi" },
  { label: "Proposé par l'agent", value: "propose" },
  { label: "Refusé", value: "refuse" },
] as const;

/** La date du geste : posée quand l'état passe à « suivi » ou « refusé », pas avant. */
const stampDecision: CollectionBeforeChangeHook = ({ data, originalDoc }) =>
  data?.status && data.status !== "propose" && data.status !== originalDoc?.status ? { ...data, decidedAt: new Date().toISOString() } : data;

export const AdCompetitors: CollectionConfig = {
  slug: "ad-competitors",
  labels: { singular: "Concurrent", plural: "Concurrents" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "status", "pageUrl", "decidedAt"],
    group: "Publicité",
    description: "Les pages Facebook des concurrents dont l'agent lit les publicités. Il peut en proposer ; elles n'entrent qu'après validation.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "name",
  hooks: { beforeChange: [stampDecision] },
  fields: [
    { name: "name", type: "text", label: "Nom", required: true },
    {
      type: "row",
      fields: [
        { name: "pageUrl", type: "text", label: "Page Facebook", admin: { width: "60%", placeholder: "https://www.facebook.com/…" } },
        { name: "pageId", type: "text", label: "Identifiant de la page", index: true, admin: { width: "40%", description: "Facultatif : retrouvé depuis la bibliothèque publicitaire s'il manque." } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "status", type: "select", label: "État", options: [...COMPETITOR_STATUSES], defaultValue: "suivi", required: true, index: true, admin: { width: "50%" } },
        { name: "decidedAt", type: "date", label: "Ajouté ou refusé le", admin: { width: "50%", readOnly: true } },
      ],
    },
    { name: "proposedBy", type: "relationship", relationTo: "ad-agent-runs", label: "Proposé par le passage", admin: { readOnly: true } },
    { name: "keywords", type: "text", label: "Mots-clés qui l'ont fait trouver", admin: { readOnly: true } },
    { name: "rationale", type: "textarea", label: "Pourquoi l'agent le propose", admin: { readOnly: true } },
  ],
};
