import type { CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { validateFraming } from "@/modules/ads/lib/framing";
import { isAppSource, isInspiration, isRushBlobUrl, mediaTypeOf, RUSH_FEATURES, RUSH_SOURCES, RUSH_STATUSES, RUSH_USES } from "@/modules/ads/lib/rushes";
import { INSPIRATION_VERDICTS } from "@/modules/ads/lib/style";

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
  // Le recadrage tracé sur la fiche : vérifié ici, pas seulement à l'écran (une API pourrait l'écrire).
  if (data.framing !== undefined && data.framing !== null) {
    const v = validateFraming(data.framing);
    if (!v.ok) throw new Error(v.error);
    out.framing = v.framing;
  }
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
  labels: { singular: "Rush ou inspiration", plural: "Rushes et inspirations" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "use", "etat", "source", "mediaType", "updatedAt"],
    group: "Publicité",
    description:
      "La matière première des vidéos (écrans de l'app, chantier, bureau), et les inspirations : des pubs dont l'IA tire le style. Le fichier d'origine est conservé tel quel.",
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
    {
      name: "use",
      type: "radio",
      label: "Usage",
      options: [...RUSH_USES],
      defaultValue: "matiere",
      required: true,
      index: true,
      admin: {
        layout: "horizontal",
        description: "Matière : les agents la montent dans les vidéos. Inspiration : une pub, de TIM ou d'ailleurs, dont l'IA tire le style — jamais montrée.",
      },
    },
    { name: "title", type: "text", label: "Nom", required: true, admin: { placeholder: "Pointage du matin, équipe gros œuvre" } },
    // Une inspiration : le verdict, le lien d'où elle vient, et ce qui plaît ou pas — ce que l'IA lit avec les images.
    {
      type: "row",
      admin: { condition: (d) => isInspiration(d) },
      fields: [
        { name: "verdict", type: "select", label: "Verdict", options: [...INSPIRATION_VERDICTS], defaultValue: "aimer", required: true, admin: { width: "30%" } },
        { name: "link", type: "text", label: "Lien (facultatif)", admin: { width: "70%", placeholder: "Bibliothèque publicitaire Meta, Instagram…" } },
      ],
    },
    {
      name: "why",
      type: "textarea",
      label: "Ce qui plaît, ou pas",
      required: true,
      maxLength: 600,
      admin: {
        condition: (d) => isInspiration(d),
        placeholder: "Le téléphone en très gros plan, les mots qui apparaissent un à un, les couleurs franches…",
        description: "Ce qui vous fait l'aimer (ou la rejeter) : l'IA regarde les images avec cette phrase pour en tirer une fiche de style.",
      },
    },
    {
      type: "row",
      admin: { condition: (d) => !isInspiration(d) },
      fields: [
        // La condition est AUSSI sur le champ : posée sur la seule rangée, la colonne resterait obligatoire en base.
        { name: "source", type: "select", label: "Source", options: [...RUSH_SOURCES], required: true, index: true, admin: { width: "50%", condition: (d) => !isInspiration(d) } },
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
        condition: (d) => !isInspiration(d),
        placeholder: "Un chef d'équipe pointe l'arrivée de 3 compagnons, puis envoie la journée au bureau.",
        description: "Quelques phrases : c'est ce qui permet aux agents de choisir ce rush et d'en tirer le bon passage.",
      },
    },
    // Le recadrage : zone utile et zone à ne jamais couper, tracées sur l'image (D1d). Sans objet pour une inspiration.
    { name: "framingTool", type: "ui", admin: { condition: (d) => !isInspiration(d), components: { Field: "/modules/ads/admin/RushFramingField#RushFramingField" } } },
    { name: "framing", type: "json", label: "Recadrage", admin: { hidden: true } },
    // Ce que l'IA voit du rush converti : images clés, plans, description à valider (D1c).
    { name: "insight", type: "ui", admin: { components: { Field: "/modules/ads/admin/RushInsightPanel#RushInsightPanel" } } },
    {
      type: "row",
      fields: [
        {
          name: "origin",
          type: "text",
          label: "Origine et droits",
          // Une inspiration n'est jamais diffusée : ses droits ne sont pas en jeu.
          validate: (v: unknown, { data, siblingData }: { data: { use?: string }; siblingData: { source?: string } }) =>
            isInspiration(data) || isAppSource(siblingData?.source) || (typeof v === "string" && v.trim()) ? true : "Origine et droits d'usage publicitaire obligatoires (banque d'images, tournage TIM…).",
          admin: { width: "60%", placeholder: "Tournage TIM, Pexels (licence libre)…", condition: (d) => !isInspiration(d) },
        },
        {
          name: "noRealData",
          type: "checkbox",
          label: "Aucune donnée réelle visible",
          validate: (v: unknown, { data, siblingData }: { data: { use?: string }; siblingData: { source?: string } }) =>
            isInspiration(data) || !isAppSource(siblingData?.source) || v === true ? true : "À vérifier avant d'importer un écran de l'app : aucun nom, chiffre ou client réel.",
          admin: { width: "40%", condition: (d, s) => !isInspiration(d) && isAppSource(s?.source) },
        },
      ],
    },
    // L'étape, calculée (conversion + description IA) : une colonne de la liste, jamais stockée.
    { name: "etat", type: "ui", label: "État", admin: { components: { Cell: "/modules/ads/admin/RushStageCell#RushStageCell" } } },
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
