import type { CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { isAppSource, isRushBlobUrl, mediaTypeOf, RUSH_FEATURES, RUSH_SOURCES, RUSH_STATUSES } from "@/modules/ads/lib/rushes";

/**
 * Rushes (plan Publicité, §9 sexies) : les vidéos et images que Charlie
 * importe comme matière première — écran de l'app mobile ou web, chantier,
 * bureau — et que les agents retravaillent en motion design.
 *
 * Le fichier d'origine va DIRECT au stockage depuis le navigateur (jusqu'à
 * 500 Mo) ; la fiche n'en garde que l'adresse. Une collection d'upload Payload
 * relirait tout le fichier en mémoire, et une fonction Vercel plafonne à
 * 4,5 Mo à l'aller.
 *
 * La conversion (Vercel Sandbox) remplit ensuite la version de travail, la
 * vignette, les images clés et la fiche technique ; l'IA propose une
 * description détaillée. Rien de tout cela ne touche au fichier d'origine.
 */

/** Ce qu'on sait du fichier déposé, et le remise en file quand il change. */
const prepare: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (!data) return data;
  const original = { ...(originalDoc?.original ?? {}), ...(data.original ?? {}) } as { url?: string; contentType?: string };
  if (!isRushBlobUrl(original.url)) throw new Error("Déposez d'abord le fichier : il n'a pas été envoyé au stockage.");
  const out: Record<string, unknown> = { ...data, mediaType: mediaTypeOf(original.contentType) };
  const replaced = operation === "update" && originalDoc?.original?.url && original.url !== originalDoc.original.url;
  if (operation === "create" || replaced) {
    // Un nouveau fichier : tout ce qui venait de l'ancien est caduc.
    out.processing = { status: "en-attente", error: null, attempts: 0, leaseUntil: null, processedAt: null };
    out.working = { url: null, posterUrl: null, keyframes: null, meta: null };
  }
  return out;
};

/** Supprimer une fiche supprime ses fichiers : un rush abandonné ne reste pas en ligne. */
const deleteFiles: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const urls = [
    doc?.original?.url,
    doc?.working?.url,
    doc?.working?.posterUrl,
    ...((Array.isArray(doc?.working?.keyframes) ? doc.working.keyframes : []) as { url?: string }[]).map((k) => k.url),
  ].filter((u): u is string => typeof u === "string" && u.length > 0);
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return doc;
  try {
    const { del } = await import("@vercel/blob");
    await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (e) {
    req.payload.logger.warn(`[publicité] fichiers du rush ${doc?.id} non supprimés : ${(e as Error).message}`);
  }
  return doc;
};

const readOnly = { readOnly: true } as const;

export const AdRushes: CollectionConfig = {
  slug: "ad-rushes",
  labels: { singular: "Rush", plural: "Rushes" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "source", "mediaType", "processing.status", "updatedAt"],
    group: "Publicité",
    description:
      "La matière première des vidéos : écrans de l'app, chantier, bureau. Le fichier d'origine est conservé tel quel ; les agents en tirent leurs montages.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "-createdAt",
  hooks: { beforeChange: [prepare], afterDelete: [deleteFiles] },
  fields: [
    // Le dépôt du fichier : un composant qui envoie direct au stockage et remplit `original`.
    { name: "upload", type: "ui", admin: { components: { Field: "/modules/ads/admin/RushUploadField#RushUploadField" } } },
    {
      name: "original",
      type: "group",
      label: false,
      admin: { hidden: true },
      fields: [
        { name: "url", type: "text" },
        { name: "pathname", type: "text" },
        { name: "filename", type: "text" },
        { name: "contentType", type: "text" },
        { name: "size", type: "number" },
      ],
    },
    { name: "title", type: "text", label: "Nom", required: true, admin: { placeholder: "Pointage du matin, équipe gros œuvre" } },
    {
      type: "row",
      fields: [
        { name: "source", type: "select", label: "Source", options: [...RUSH_SOURCES], required: true, index: true, admin: { width: "50%" } },
        { name: "features", type: "select", hasMany: true, label: "Fonctionnalités montrées", options: [...RUSH_FEATURES], admin: { width: "50%" } },
      ],
    },
    {
      name: "description",
      type: "textarea",
      label: "Ce qu'on voit",
      required: true,
      maxLength: 600,
      admin: {
        placeholder: "Un chef d'équipe pointe l'arrivée de 3 compagnons, puis envoie la journée au bureau.",
        description: "Quelques phrases : c'est ce qui permet aux agents de choisir ce rush et d'en tirer le bon passage.",
      },
    },
    // Ce que l'IA voit du rush converti : images clés, plans, description à valider (D1c).
    { name: "insight", type: "ui", admin: { components: { Field: "/modules/ads/admin/RushInsightPanel#RushInsightPanel" } } },
    {
      type: "row",
      fields: [
        {
          name: "origin",
          type: "text",
          label: "Origine et droits",
          validate: (v: unknown, { siblingData }: { siblingData: { source?: string } }) =>
            isAppSource(siblingData?.source) || (typeof v === "string" && v.trim()) ? true : "Origine et droits d'usage publicitaire obligatoires (banque d'images, tournage TIM…).",
          admin: { width: "60%", placeholder: "Tournage TIM, Pexels (licence libre)…" },
        },
        {
          name: "noRealData",
          type: "checkbox",
          label: "Aucune donnée réelle visible",
          validate: (v: unknown, { siblingData }: { siblingData: { source?: string } }) =>
            !isAppSource(siblingData?.source) || v === true ? true : "À vérifier avant d'importer un écran de l'app : aucun nom, chiffre ou client réel.",
          admin: { width: "40%", condition: (_, s) => isAppSource(s?.source) },
        },
      ],
    },
    { name: "mediaType", type: "select", label: "Type", options: [{ label: "Vidéo", value: "video" }, { label: "Image", value: "image" }], index: true, admin: { ...readOnly, position: "sidebar" } },
    {
      name: "processing",
      type: "group",
      label: "Conversion",
      admin: { position: "sidebar" },
      fields: [
        { name: "status", type: "select", label: "État", options: [...RUSH_STATUSES], defaultValue: "en-attente", index: true, admin: readOnly },
        { name: "error", type: "text", label: "Motif de l'échec", admin: { ...readOnly, condition: (d) => d?.processing?.status === "echec" } },
        { name: "attempts", type: "number", label: "Essais", defaultValue: 0, admin: readOnly },
        { name: "processedAt", type: "date", label: "Converti le", admin: { ...readOnly, date: { pickerAppearance: "dayAndTime" } } },
        { name: "leaseUntil", type: "date", index: true, admin: { hidden: true } },
      ],
    },
    {
      name: "working",
      type: "group",
      label: "Version de travail",
      admin: { condition: (d) => d?.processing?.status === "pret", description: "Produite par la conversion : c'est elle que les montages utilisent." },
      fields: [
        { name: "url", type: "text", label: "Fichier de travail", admin: readOnly },
        { name: "posterUrl", type: "text", label: "Vignette", admin: readOnly },
        // Montrées par le panneau « Ce que voient les agents ».
        { name: "keyframes", type: "json", label: "Images clés", admin: { hidden: true } },
        { name: "meta", type: "json", label: "Fiche technique", admin: readOnly },
      ],
    },
    {
      name: "ai",
      type: "group",
      label: "Description détaillée (IA)",
      // Lu et modifié par le panneau « Ce que voient les agents » et sa route : jamais par le formulaire,
      // qui réécrirait l'ancienne valeur en enregistrant.
      admin: { hidden: true },
      fields: [
        { name: "proposal", type: "textarea", label: "Proposition" },
        { name: "timeline", type: "json", label: "Plans repérés", admin: readOnly },
        {
          name: "status",
          type: "select",
          label: "État",
          options: [
            { label: "Proposée", value: "proposee" },
            { label: "Validée", value: "validee" },
            { label: "Écartée", value: "ecartee" },
          ],
        },
      ],
    },
  ],
};
