import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { checkParams } from "@/modules/ads/video/element-params";
import { ELEMENT_LABELS, ELEMENT_TYPES, isElementType } from "@/modules/ads/video/elements";

/**
 * Éléments de motion design (plan Publicité, atelier des éléments) : chaque
 * élément de base (liste, notification, titre…) et ses VARIANTES, avec leurs
 * réglages. L'agent ne voit que les éléments actifs, par leur « quand
 * l'employer » ; une vidéo cite la variante qu'elle utilise, pour qu'on sache
 * plus tard ce qui marche.
 *
 * On améliore un élément dans son fil (ad-element-notes) : idées de Charlie,
 * propositions de l'IA, décisions. Appliquer une proposition crée une
 * nouvelle VERSION (l'ancienne reste restaurable) ; en faire une variante
 * crée une nouvelle fiche. Le comportement de base est du code
 * (remotion/elements.tsx) : ce qui dépasse les réglages part au développement.
 */

export const ELEMENT_STATUSES = [
  { label: "Brouillon", value: "brouillon" },
  { label: "Actif : l'agent peut l'employer", value: "actif" },
  { label: "Retiré", value: "retire" },
] as const;

export const PREVIEW_STATUSES = [
  { label: "En attente de rendu", value: "en-attente" },
  { label: "Rendu en cours", value: "en-cours" },
  { label: "Prêt", value: "pret" },
  { label: "Échec", value: "echec" },
] as const;

export type ElementVersion = { n: number; params: Record<string, unknown>; at: string; by: string | null; note: string };

/** Les réglages sont vérifiés à chaque enregistrement ; un changement de réglages ajoute une version et relance l'aperçu. */
const checkAndVersion: CollectionBeforeChangeHook = ({ data, originalDoc, req, context, operation }) => {
  if (!data) return data;
  // L'aperçu écrit par le cron ne change ni les réglages ni l'historique.
  if (context?.previewOnly) return data;
  const base = (data.base ?? originalDoc?.base) as string;
  if (!isElementType(base)) throw new Error(`Élément de base « ${base} » inconnu.`);
  const raw = data.params ?? originalDoc?.params ?? {};
  const { params, errors } = checkParams(base, raw);
  if (errors.length) throw new Error(`Réglages refusés : ${errors.join(" ")}`);
  // On ne garde que ce qui diffère des défauts : la fiche reste lisible, et un défaut changé plus tard s'applique.
  const own = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k]) => k in params));
  const before = JSON.stringify(originalDoc?.params ?? {});
  const changed = JSON.stringify(own) !== before;
  const out: Record<string, unknown> = { ...data, params: own };
  // À la création, Payload ne donne pas de document d'avant vide : c'est l'opération qui dit qu'il faut la version 1.
  if (changed || operation === "create") {
    const versions = ((originalDoc?.versions as ElementVersion[] | null) ?? []).slice();
    const user = req.user as { name?: string; email?: string } | null;
    versions.push({ n: versions.length + 1, params: own, at: new Date().toISOString(), by: user?.name ?? user?.email ?? null, note: String(data.versionNote ?? (operation === "create" ? "Création" : "Réglages modifiés")) });
    out.versions = versions;
    out.preview = { ...(originalDoc?.preview ?? {}), status: "en-attente", error: null, attempts: 0, leaseUntil: null };
  }
  delete out.versionNote;
  return out;
};

/** Un élément supprimé emporte son fil (le lien est obligatoire). Mieux vaut le passer « Retiré » : les vidéos qui l'ont employé le citent encore. */
const dropNotes: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({ collection: "ad-element-notes", where: { element: { equals: id } }, overrideAccess: true, req });
};

export const AdElements: CollectionConfig = {
  slug: "ad-elements",
  labels: { singular: "Élément", plural: "Éléments" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "base", "status", "updatedAt"],
    group: "Publicité",
    description:
      "Les éléments de motion design que l'agent pose dans les vidéos, et leurs variantes. Améliorez-les dans leur fil : vos idées, les propositions de l'IA, un aperçu rendu à chaque changement.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "base",
  hooks: { beforeChange: [checkAndVersion], beforeDelete: [dropNotes] },
  fields: [
    {
      type: "row",
      fields: [
        { name: "name", type: "text", label: "Nom", required: true, unique: true, admin: { width: "50%", placeholder: "Notification · verre dépoli" } },
        { name: "base", type: "select", label: "Élément de base", options: ELEMENT_TYPES.map((t) => ({ label: ELEMENT_LABELS[t], value: t })), required: true, index: true, admin: { width: "25%" } },
        { name: "status", type: "select", label: "État", options: [...ELEMENT_STATUSES], defaultValue: "brouillon", required: true, index: true, admin: { width: "25%" } },
      ],
    },
    { name: "variantOf", type: "relationship", relationTo: "ad-elements", label: "Variante de", admin: { readOnly: true, condition: (d) => Boolean(d?.variantOf) } },
    {
      name: "whenToUse",
      type: "textarea",
      label: "Quand l'employer",
      required: true,
      admin: { description: "Ce que l'agent lit pour choisir cet élément : ce qu'il montre, sur quel fond il rend le mieux, pour quel message." },
    },
    // L'aperçu rendu, les réglages (éditeur généré depuis le contrat), le fil d'amélioration.
    { name: "previewPanel", type: "ui", admin: { components: { Field: "/modules/ads/admin/ElementPreview#ElementPreview" } } },
    { name: "paramsEditor", type: "ui", admin: { components: { Field: "/modules/ads/admin/ElementParamsEditor#ElementParamsEditor" } } },
    { name: "params", type: "json", label: "Réglages", admin: { hidden: true } },
    { name: "thread", type: "ui", admin: { components: { Field: "/modules/ads/admin/ElementThread#ElementThread" } } },
    { name: "versions", type: "json", label: "Versions", admin: { hidden: true } },
    {
      name: "preview",
      type: "group",
      label: "Aperçu",
      admin: { hidden: true },
      fields: [
        { name: "status", type: "select", options: [...PREVIEW_STATUSES], defaultValue: "en-attente", index: true },
        { name: "videoUrl", type: "text" },
        { name: "imageUrl", type: "text" },
        { name: "error", type: "text" },
        { name: "attempts", type: "number", defaultValue: 0 },
        { name: "leaseUntil", type: "date", index: true },
      ],
    },
  ],
};
