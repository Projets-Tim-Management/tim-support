import type { Access, CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { CTA_OPTIONS } from "@/modules/ads/lib/cta";
import { CREATIVE_FORMATS, CREATIVE_STATUSES, REFUSAL_REASONS, TEXT_KINDS } from "@/modules/ads/lib/creative-options";
import { DEFAULT_TONE, TEST_DIMENSIONS, TONES } from "@/modules/ads/lib/dimensions";

/**
 * Créas (plan Publicité, §4.3 et §9 ter) — un angle, ses textes, ses visuels.
 *
 * Deux principes qui se voient dans les champs :
 *  - UNE VARIANTE = UNE DIMENSION ÉTIQUETÉE (décision du 29/09/2026). Le ton
 *    est porté par chaque créa et chaque texte ; tout ce qui est testé (ton,
 *    angle, accroche, format…) est déclaré dans `tests`, et `isTest` permet de
 *    compter ces créas à part dans les résultats. On ne reconstitue pas une
 *    comparaison après coup : on la déclare au moment où on la crée ;
 *  - LE STATUT NE SE CHOISIT PAS DANS UN MENU : il change par les gestes de la
 *    file de validation (valider, refuser avec un motif), qui posent aussi qui
 *    a décidé et quand. Un menu déroulant laisserait valider sans trace.
 *
 * Les textes rejetés par un garde-fou restent visibles, avec la raison : on voit
 * ce que le modèle a tenté, pas seulement ce qui est passé.
 */

/** Seuls un brouillon ou une créa refusée se suppriment : une créa validée est une trace. */
const deleteUndecided: Access = ({ req: { user } }) =>
  isAdmin({ req: { user } } as never) ? { status: { in: ["brouillon", "refusee"] } } : false;

/** Longueur de chaque texte et drapeau « test », recalculés à chaque écriture. */
const derive: CollectionBeforeChangeHook = ({ data }) => {
  if (!data) return data;
  const texts = Array.isArray(data.texts)
    ? (data.texts as { text?: string }[]).map((t) => ({ ...t, chars: [...String(t.text ?? "")].length }))
    : data.texts;
  const tests = Array.isArray(data.tests) ? data.tests : undefined;
  return { ...data, texts, ...(tests ? { isTest: tests.length > 0 } : {}) };
};

const decision = { create: () => false, update: () => false };

export const AdCreatives: CollectionConfig = {
  slug: "ad-creatives",
  labels: { singular: "Créa", plural: "Créas" },
  admin: {
    useAsTitle: "angle",
    defaultColumns: ["angle", "campaign", "tone", "isTest", "status", "updatedAt"],
    group: "Publicité",
    description: "Les créas de l'atelier : un angle, ses textes, ses visuels. Elles se valident dans la file « À valider ».",
  },
  // Créées par la génération (serveur) ; statut posé par les gestes de validation.
  access: { read: isAdmin, create: () => false, update: isAdmin, delete: deleteUndecided },
  disableDuplicate: true,
  defaultSort: "-createdAt",
  hooks: { beforeChange: [derive] },
  fields: [
    { name: "angle", type: "text", label: "Angle", required: true, admin: { description: "L'idée en une ligne." } },
    { name: "hook", type: "text", label: "Accroche du visuel", admin: { description: "Le texte posé sur l'image." } },
    {
      type: "row",
      fields: [
        { name: "campaign", type: "relationship", relationTo: "ad-campaigns", label: "Campagne", required: true, index: true, admin: { width: "40%" } },
        { name: "tone", type: "select", label: "Ton", options: [...TONES], defaultValue: DEFAULT_TONE, required: true, index: true, admin: { width: "20%" } },
        { name: "cta", type: "select", label: "Bouton d'action", options: CTA_OPTIONS, admin: { width: "20%" } },
        {
          name: "status",
          type: "select",
          label: "Statut",
          options: [...CREATIVE_STATUSES],
          defaultValue: "brouillon",
          index: true,
          access: decision,
          admin: { width: "20%", readOnly: true },
        },
      ],
    },
    {
      name: "tests",
      type: "array",
      label: "Ce que cette créa teste",
      labels: { singular: "Dimension testée", plural: "Dimensions testées" },
      admin: { description: "Une variante = une dimension étiquetée. Vide : la créa n'est pas un test." },
      fields: [
        {
          type: "row",
          fields: [
            { name: "dimension", type: "select", label: "Dimension", options: [...TEST_DIMENSIONS], required: true, admin: { width: "40%" } },
            { name: "value", type: "text", label: "Valeur testée", required: true, admin: { width: "60%", placeholder: "tu" } },
          ],
        },
      ],
    },
    {
      name: "isTest",
      type: "checkbox",
      label: "Variante de test",
      defaultValue: false,
      index: true,
      admin: { position: "sidebar", readOnly: true, description: "Comptée à part dans les résultats." },
    },
    {
      name: "texts",
      type: "array",
      label: "Textes",
      labels: { singular: "Texte", plural: "Textes" },
      admin: { readOnly: true, description: "Générés et contrôlés par les garde-fous. Un texte rejeté reste visible, avec sa raison." },
      fields: [
        {
          type: "row",
          fields: [
            { name: "kind", type: "select", label: "Champ Meta", options: [...TEXT_KINDS], required: true, admin: { width: "25%" } },
            { name: "tone", type: "select", label: "Ton", options: [...TONES], required: true, admin: { width: "15%" } },
            { name: "chars", type: "number", label: "Caractères", admin: { width: "15%" } },
            {
              name: "status",
              type: "select",
              label: "Garde-fous",
              options: [
                { label: "Passé", value: "ok" },
                { label: "Rejeté", value: "rejete" },
              ],
              required: true,
              admin: { width: "15%" },
            },
            { name: "reason", type: "text", label: "Raison du rejet", admin: { width: "30%" } },
          ],
        },
        { name: "text", type: "textarea", label: "Texte", required: true },
      ],
    },
    {
      name: "assets",
      type: "array",
      label: "Visuels",
      labels: { singular: "Visuel", plural: "Visuels" },
      admin: { readOnly: true },
      fields: [
        {
          type: "row",
          fields: [
            { name: "format", type: "select", label: "Format", options: [...CREATIVE_FORMATS], required: true, admin: { width: "20%" } },
            {
              name: "type",
              type: "select",
              label: "Nature",
              options: [
                { label: "Image", value: "image" },
                { label: "Vidéo", value: "video" },
              ],
              required: true,
              admin: { width: "15%" },
            },
            { name: "template", type: "text", label: "Gabarit", admin: { width: "25%" } },
            { name: "media", type: "upload", relationTo: "ad-media", label: "Fichier", required: true, admin: { width: "40%" } },
          ],
        },
      ],
    },
    {
      name: "facts",
      type: "relationship",
      relationTo: "ad-facts",
      hasMany: true,
      label: "Faits cités",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      type: "collapsible",
      label: "Décision",
      admin: { position: "sidebar" },
      fields: [
        { name: "refusalReason", type: "select", label: "Motif du refus", options: [...REFUSAL_REASONS], access: decision, admin: { readOnly: true, condition: (d) => d?.status === "refusee" } },
        { name: "refusalDetail", type: "textarea", label: "Précision", access: decision, admin: { readOnly: true, condition: (d) => d?.status === "refusee" } },
        { name: "decidedBy", type: "relationship", relationTo: "users", label: "Décidé par", access: decision, admin: { readOnly: true } },
        { name: "decidedAt", type: "date", label: "Le", access: decision, admin: { readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
      ],
    },
    {
      name: "origin",
      type: "select",
      label: "Origine",
      options: [
        { label: "Générée (bouton)", value: "generee" },
        { label: "Agent", value: "agent" },
        { label: "Manuelle", value: "manuelle" },
      ],
      defaultValue: "generee",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "generation",
      type: "group",
      label: "Génération",
      admin: { position: "sidebar" },
      fields: [
        { name: "model", type: "text", label: "Modèle", admin: { readOnly: true } },
        { name: "costEur", type: "number", label: "Coût (€)", admin: { readOnly: true } },
        { name: "batch", type: "text", label: "Lot", index: true, admin: { readOnly: true, description: "Les créas nées de la même génération." } },
      ],
    },
    // Chiffres de la créa chez la régie (phase 3b et suivantes).
    { name: "performance", type: "json", admin: { hidden: true } },
  ],
};
