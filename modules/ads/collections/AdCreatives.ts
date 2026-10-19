import type { Access, CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { CTA_OPTIONS } from "@/modules/ads/lib/cta";
import { CREATIVE_FORMATS, CREATIVE_STATUSES, REFUSAL_REASONS, TEXT_KINDS } from "@/modules/ads/lib/creative-options";
import { BRIEF_KINDS } from "@/modules/ads/lib/creative-files";
import { DEFAULT_TONE, TEST_DIMENSIONS, TONES } from "@/modules/ads/lib/dimensions";

/**
 * Créas (plan Publicité) — un angle, ses textes, son brief Claude Design et
 * les fichiers finis importés.
 *
 * Depuis le 19/10/2026, le support ne fabrique plus les visuels : l'agent écrit
 * un BRIEF (le prompt à coller dans Claude Design, les rushes à joindre, les
 * formats attendus), Charlie crée la pub dans Claude Design puis IMPORTE les
 * fichiers sur la créa, vérifiés aux exigences de Meta.
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
  const copy = Array.isArray(data.copy)
    ? (data.copy as { text?: string }[]).map((t) => ({ ...t, chars: [...String(t.text ?? "")].length }))
    : data.copy;
  const tests = Array.isArray(data.tests) ? data.tests : undefined;
  return { ...data, copy, ...(tests ? { isTest: tests.length > 0 } : {}) };
};

const decision = { create: () => false, update: () => false };

/** Une créa supprimée emporte ses fichiers importés : rien ne reste en ligne pour rien. */
const deleteFiles: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const urls = ((Array.isArray(doc?.files) ? doc.files : []) as { url?: string }[]).map((f) => f.url).filter((u): u is string => Boolean(u));
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return doc;
  try {
    const { del } = await import("@vercel/blob");
    await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (e) {
    req.payload.logger.warn(`[publicité] fichiers de la créa ${doc?.id} non supprimés : ${(e as Error).message}`);
  }
  return doc;
};

export const AdCreatives: CollectionConfig = {
  slug: "ad-creatives",
  labels: { singular: "Créa", plural: "Créas" },
  admin: {
    useAsTitle: "angle",
    defaultColumns: ["angle", "campaign", "tone", "isTest", "status", "updatedAt"],
    group: "Publicité",
    description: "Un angle, ses textes, son brief Claude Design et les fichiers finis. Elles se valident dans la file « À valider ».",
  },
  // Créées par la génération (serveur) ; statut posé par les gestes de validation.
  access: { read: isAdmin, create: () => false, update: isAdmin, delete: deleteUndecided },
  disableDuplicate: true,
  defaultSort: "-createdAt",
  hooks: { beforeChange: [derive], afterDelete: [deleteFiles] },
  fields: [
    { name: "angle", type: "text", label: "Angle", required: true, admin: { description: "L'idée en une ligne." } },
    {
      // L'angle tel que l'agent l'a demandé (plan, §9 quater ; décision du 30/09/2026) : le rédacteur le
      // reformule parfois, on garde la trace de ce qui avait été choisi, et par quel passage.
      name: "requestedAngle",
      type: "text",
      label: "Angle demandé par l'agent",
      admin: { readOnly: true, condition: (d) => Boolean(d?.requestedAngle) },
    },
    { name: "run", type: "relationship", relationTo: "ad-agent-runs", label: "Passage d'agent", index: true, admin: { readOnly: true, position: "sidebar", condition: (d) => Boolean(d?.run) } },
    { name: "hook", type: "text", label: "Accroche du visuel", admin: { description: "Le texte posé sur l'image ou en ouverture de la vidéo." } },
    /**
     * Le BRIEF Claude Design, écrit par l'agent (outil ecrire_brief_design) :
     * le prompt prêt à coller, ce qu'il faut joindre, ce qu'on attend en retour.
     * Écrit par le serveur seul.
     */
    {
      name: "brief",
      type: "group",
      label: "Brief Claude Design",
      access: decision,
      admin: { readOnly: true, condition: (d) => Boolean(d?.brief?.prompt) },
      fields: [
        {
          type: "row",
          fields: [
            { name: "kind", type: "select", label: "À créer", options: [...BRIEF_KINDS], admin: { width: "30%" } },
            { name: "formats", type: "select", hasMany: true, label: "Formats attendus", options: [...CREATIVE_FORMATS], admin: { width: "40%" } },
            { name: "durationSec", type: "number", label: "Durée visée (s)", admin: { width: "30%" } },
          ],
        },
        { name: "rationale", type: "textarea", label: "Pourquoi cette pub", admin: { description: "L'angle face aux concurrents, en quelques phrases." } },
        { name: "prompt", type: "textarea", label: "Prompt à coller dans Claude Design" },
        { name: "rushes", type: "relationship", relationTo: "ad-rushes", hasMany: true, label: "Rushes à joindre" },
        { name: "writtenAt", type: "date", label: "Écrit le", admin: { date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } } },
      ],
    },
    /**
     * Les fichiers finis, importés depuis Claude Design : un par format (et par
     * nature), vérifiés aux exigences de Meta à l'import. Écrits par la route
     * d'import seule.
     */
    {
      name: "files",
      type: "array",
      label: "Fichiers importés",
      labels: { singular: "Fichier", plural: "Fichiers" },
      access: decision,
      admin: { readOnly: true },
      fields: [
        {
          type: "row",
          fields: [
            { name: "format", type: "select", label: "Format", options: [...CREATIVE_FORMATS], required: true, admin: { width: "20%" } },
            {
              name: "kind",
              type: "select",
              label: "Nature",
              options: [
                { label: "Image", value: "image" },
                { label: "Vidéo", value: "video" },
              ],
              required: true,
              admin: { width: "20%" },
            },
            { name: "filename", type: "text", label: "Fichier", admin: { width: "60%" } },
          ],
        },
        { name: "url", type: "text", required: true },
        { name: "pathname", type: "text" },
        { name: "mime", type: "text" },
        {
          type: "row",
          fields: [
            { name: "bytes", type: "number", label: "Poids (octets)", admin: { width: "25%" } },
            { name: "width", type: "number", label: "Largeur", admin: { width: "25%" } },
            { name: "height", type: "number", label: "Hauteur", admin: { width: "25%" } },
            { name: "durationSec", type: "number", label: "Durée (s)", admin: { width: "25%" } },
          ],
        },
        { name: "warnings", type: "json", label: "Avertissements" },
        { name: "importedAt", type: "date", label: "Importé le" },
      ],
    },
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
      // « copy » et non « texts » : Payload réserve la table `<collection>_texts`
      // à ses champs texte à valeurs multiples. Nommé `texts`, ce tableau prenait
      // cette table, et toute lecture complète d'une créa échouait (Drizzle :
      // « reading 'referencedTable' », relation `_texts` inconnue).
      name: "copy",
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
      // Les visuels rendus par l'ancien moteur (jusqu'au 19/10/2026) : remplacés par `files`, gardés jusqu'au nettoyage.
      name: "assets",
      type: "array",
      label: "Anciens visuels",
      labels: { singular: "Visuel", plural: "Visuels" },
      admin: { readOnly: true, hidden: true },
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
