import type { CollectionBeforeValidateHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Médias publicitaires (plan Publicité, §9 ter) — la matière des créas et les
 * créas elles-mêmes.
 *
 * Séparés de la médiathèque : celle-ci est lisible par les partenaires selon des
 * règles de propriété (RBAC), et rien de ce qui prépare une publicité n'a à y
 * paraître. Admin seul. Stockés sur Vercel Blob sous le préfixe `ads/`.
 *
 * Chaque fichier dit ce qu'il est (`kind`) et ce qui permet de s'en servir :
 * une photo sans droits, une police sans licence ou une capture qui montre de
 * vrais clients ne doivent pas finir dans une publicité. Ces conditions sont
 * exigées à l'enregistrement, pas rappelées dans une note.
 */

export const AD_MEDIA_KINDS = [
  { label: "Logo", value: "logo" },
  { label: "Police", value: "police" },
  { label: "Capture de l'app", value: "capture" },
  { label: "Photo", value: "photo" },
  { label: "Musique", value: "musique" },
  { label: "Fond généré", value: "fond" },
  { label: "Créa rendue", value: "crea" },
] as const;

export type AdMediaKind = (typeof AD_MEDIA_KINDS)[number]["value"];

const FONT_EXT = /\.(ttf|otf)$/i;

/** Une police se dépose en TTF ou OTF : le moteur de rendu des gabarits ne lit pas le WOFF2. */
const checkFontFormat: CollectionBeforeValidateHook = ({ data, req }) => {
  const name = String(req.file?.name ?? data?.filename ?? "");
  if (data?.kind === "police" && name && !FONT_EXT.test(name)) {
    throw new Error("Une police se dépose en .ttf ou .otf (le WOFF2 n'est pas lisible par le rendu des créas).");
  }
  return data;
};

const required = (message: string) => (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) =>
  value || !siblingData ? true : message;

export const AdMedia: CollectionConfig = {
  slug: "ad-media",
  labels: { singular: "Média publicitaire", plural: "Médias publicitaires" },
  admin: {
    useAsTitle: "filename",
    defaultColumns: ["filename", "kind", "feature", "updatedAt"],
    group: "Publicité",
    description: "Logos, polices, captures de l'app, photos : la matière des créas. Et les créas rendues. Réservé à TIM.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { beforeValidate: [checkFontFormat] },
  upload: {
    focalPoint: false,
    crop: false,
    mimeTypes: [
      "image/*",
      "video/mp4",
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      // Les navigateurs envoient une police sous des types variables : le
      // format est contrôlé par l'extension (checkFontFormat).
      "font/ttf",
      "font/otf",
      "font/sfnt",
      "application/x-font-ttf",
      "application/x-font-otf",
      "application/font-sfnt",
      "application/vnd.ms-opentype",
      "application/octet-stream",
    ],
  },
  fields: [
    { name: "kind", type: "select", label: "Nature", required: true, options: [...AD_MEDIA_KINDS], index: true },
    { name: "alt", type: "text", label: "Description", admin: { description: "Ce que montre le fichier, en une phrase." } },
    {
      type: "row",
      fields: [
        {
          name: "platform",
          type: "select",
          label: "Plateforme",
          options: [
            { label: "Web", value: "web" },
            { label: "Mobile", value: "mobile" },
          ],
          admin: { width: "30%", condition: (d) => d?.kind === "capture" },
        },
        {
          name: "feature",
          type: "text",
          label: "Fonctionnalité montrée",
          index: true,
          admin: { width: "70%", placeholder: "Planning, pointage, véhicules…", condition: (d) => d?.kind === "capture" },
        },
      ],
    },
    {
      // Une capture qui montre de vrais noms de clients ou de salariés ne sort pas.
      name: "noClientData",
      type: "checkbox",
      label: "Aucune donnée de vrai client ni de vrai salarié visible",
      validate: (v: unknown, { siblingData }: { siblingData: Record<string, unknown> }) =>
        siblingData?.kind !== "capture" || v === true ? true : "À vérifier avant de déposer une capture : aucune donnée réelle visible.",
      admin: { condition: (d) => d?.kind === "capture" },
    },
    {
      name: "rights",
      type: "textarea",
      label: "Droits d'usage",
      validate: (v: unknown, opts: { siblingData: Record<string, unknown> }) =>
        ["photo", "musique"].includes(String(opts.siblingData?.kind)) ? required("Origine et droits d'usage publicitaire obligatoires.")(v, opts) : true,
      admin: {
        description: "Origine, auteur, date, licence ; pour une photo, l'accord des personnes visibles.",
        condition: (d) => d?.kind === "photo" || d?.kind === "musique",
      },
    },
    {
      name: "license",
      type: "textarea",
      label: "Licence de la police",
      validate: (v: unknown, opts: { siblingData: Record<string, unknown> }) =>
        opts.siblingData?.kind === "police" ? required("La licence doit autoriser l'usage publicitaire.")(v, opts) : true,
      admin: { condition: (d) => d?.kind === "police" },
    },
  ],
};
