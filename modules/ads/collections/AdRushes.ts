import type { CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { isAppSource, isRushBlobUrl, mediaTypeOf, RUSH_FEATURES, RUSH_SOURCES } from "@/modules/ads/lib/rushes";

/**
 * Rushes (plan Publicité) : les enregistrements d'écran de l'app mobile ou
 * web, et les images de chantier ou de bureau, que Charlie importe. L'agent
 * les désigne dans ses briefs (« joindre le rush Pointage du matin ») ; Charlie
 * télécharge l'original et le joint dans Claude Design (décision du 19/10/2026).
 *
 * Le fichier d'origine va DIRECT au stockage depuis le navigateur (jusqu'à
 * 500 Mo) ; la fiche n'en garde que l'adresse. Une collection d'upload Payload
 * relirait tout le fichier en mémoire, et une fonction Vercel plafonne à
 * 4,5 Mo à l'aller.
 */

/** Ce qu'on sait du fichier déposé. */
export const prepare: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (!data) return data;
  const original = { ...(originalDoc?.original ?? {}), ...(data.original ?? {}) } as { url?: string; contentType?: string };
  if (!isRushBlobUrl(original.url)) throw new Error("Déposez d'abord le fichier : il n'a pas été envoyé au stockage.");
  return { ...data, mediaType: mediaTypeOf(original.contentType) };
};

/** Supprimer une fiche supprime son fichier : un rush abandonné ne reste pas en ligne. */
export const deleteFiles: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const url = doc?.original?.url;
  if (typeof url !== "string" || !url || !process.env.BLOB_READ_WRITE_TOKEN) return doc;
  try {
    const { del } = await import("@vercel/blob");
    await del([url], { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (e) {
    req.payload.logger.warn(`[publicité] fichier du rush ${doc?.id} non supprimé : ${(e as Error).message}`);
  }
  return doc;
};

export const AdRushes: CollectionConfig = {
  slug: "ad-rushes",
  labels: { singular: "Rush", plural: "Rushes" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "source", "features", "mediaType", "updatedAt"],
    group: "Publicité",
    description:
      "Les enregistrements de l'app et les images de chantier ou de bureau. L'agent les désigne dans ses briefs ; vous les téléchargez pour les joindre dans Claude Design.",
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
        description: "Quelques phrases : c'est ce qui permet à l'agent de choisir ce rush pour un brief.",
      },
    },
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
          admin: { width: "40%", condition: (_d, s) => isAppSource(s?.source) },
        },
      ],
    },
    { name: "mediaType", type: "select", label: "Type", options: [{ label: "Vidéo", value: "video" }, { label: "Image", value: "image" }], index: true, admin: { readOnly: true, position: "sidebar" } },
  ],
};
