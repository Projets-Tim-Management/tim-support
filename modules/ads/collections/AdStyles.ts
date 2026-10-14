import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import {
  AD_FONTS,
  BACKGROUNDS,
  CORNERS,
  GRAPHICS,
  OPENINGS,
  PACES,
  PHONE_FRAMES,
  PROOF_STYLES,
  SUBTITLE_STYLES,
  TITLE_CASES,
  TRANSITIONS,
} from "@/modules/ads/lib/style";

/**
 * Les styles des pubs (plan Publicité, §9 sexies, D2b) : la bibliothèque dans
 * laquelle l'agent choisit, et qu'il fait tester l'un contre l'autre.
 *
 * Décision du 14/10/2026 (Charlie) : on ne fige pas UN style — les trois de la
 * planche (A, B, C) entrent ici, activables, modifiables, et d'autres pourront
 * s'ajouter. Chaque créa porte le style qui l'a rendue ; un même angle rendu
 * dans deux styles est un « test de style », comparé une fois les pubs
 * diffusées. Les couleurs et les logos restent ceux du Kit de marque : un
 * style dit COMMENT les employer.
 */
export const AdStyles: CollectionConfig = {
  slug: "ad-styles",
  labels: { singular: "Style", plural: "Styles" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "active", "opening", "pace", "updatedAt"],
    group: "Publicité",
    description: "Les styles visuels et vidéo que l'agent emploie et teste entre eux. Désactivez un style pour qu'il ne serve plus.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "name",
  fields: [
    {
      type: "row",
      fields: [
        { name: "name", type: "text", label: "Nom", required: true, unique: true, admin: { width: "70%", placeholder: "A · Le geste en gros plan" } },
        { name: "active", type: "checkbox", label: "Actif : l'agent peut l'employer", defaultValue: true, index: true, admin: { width: "30%" } },
      ],
    },
    {
      name: "intent",
      type: "textarea",
      label: "Quand l'employer",
      required: true,
      admin: { description: "Ce que l'agent lit pour choisir ce style : son idée, ses forces, ce qu'il lui faut (des images de chantier, un chiffre…)." },
    },
    {
      type: "collapsible",
      label: "Ouverture et couleurs",
      fields: [
        {
          type: "row",
          fields: [
            { name: "opening", type: "select", label: "Ouverture", options: [...OPENINGS], required: true, admin: { width: "40%" } },
            { name: "background", type: "select", label: "Fonds", options: [...BACKGROUNDS], required: true, admin: { width: "30%" } },
            { name: "proof", type: "select", label: "Preuve chiffrée", options: [...PROOF_STYLES], defaultValue: "ligne", admin: { width: "30%" } },
          ],
        },
      ],
    },
    {
      type: "collapsible",
      label: "Typographie",
      fields: [
        {
          type: "row",
          fields: [
            { name: "titleFont", type: "select", label: "Titres", options: AD_FONTS.map(({ label, value }) => ({ label, value })), required: true, admin: { width: "40%" } },
            { name: "bodyFont", type: "select", label: "Textes", options: AD_FONTS.map(({ label, value }) => ({ label, value })), required: true, admin: { width: "40%" } },
            { name: "titleCase", type: "select", label: "Casse", options: [...TITLE_CASES], defaultValue: "normale", admin: { width: "20%" } },
          ],
        },
      ],
    },
    {
      type: "collapsible",
      label: "Mise en scène",
      fields: [
        {
          type: "row",
          fields: [
            { name: "phoneFrame", type: "select", label: "L'écran de l'app", options: [...PHONE_FRAMES], required: true, admin: { width: "34%" } },
            { name: "zoomOnGesture", type: "checkbox", label: "Zoom sur le geste", defaultValue: false, admin: { width: "33%", description: "Dans la zone utile, sans jamais couper la zone protégée." } },
            { name: "corners", type: "select", label: "Coins", options: [...CORNERS], defaultValue: "arrondis", admin: { width: "33%" } },
          ],
        },
        { name: "graphics", type: "select", hasMany: true, label: "Éléments graphiques", options: [...GRAPHICS], admin: { description: "Aucun si vide." } },
      ],
    },
    {
      type: "collapsible",
      label: "Mouvement",
      fields: [
        {
          type: "row",
          fields: [
            { name: "pace", type: "select", label: "Rythme", options: [...PACES], required: true, admin: { width: "34%" } },
            { name: "transitions", type: "select", hasMany: true, label: "Transitions", options: [...TRANSITIONS], admin: { width: "33%", description: "Coupe sèche si vide." } },
            { name: "subtitles", type: "select", label: "Sous-titres", options: [...SUBTITLE_STYLES], required: true, admin: { width: "33%" } },
          ],
        },
      ],
    },
  ],
};

/**
 * Les trois styles de la planche du 14/10/2026, tels qu'ils entrent dans la
 * bibliothèque (versés par la migration qui crée la collection). Modifiables
 * ensuite dans Publicité › Paramètres › Styles.
 */
export const PLANCHE_STYLES = [
  {
    name: "A · Le geste en gros plan",
    active: true,
    intent:
      "Le produit en vedette : le téléphone en grand, l'écran de l'app qui s'anime, un zoom sur le geste clé. Pour montrer une fonctionnalité précise à quelqu'un qui connaît déjà le problème. Il lui faut un enregistrement d'écran de l'app.",
    opening: "titre-mot-a-mot",
    background: "sombre",
    proof: "ligne",
    titleFont: "archivo-black",
    bodyFont: "archivo",
    titleCase: "majuscules",
    phoneFrame: "maquette",
    zoomOnGesture: true,
    corners: "arrondis",
    graphics: [],
    pace: "dynamique",
    transitions: ["zoom"],
    subtitles: "mot-a-mot",
  },
  {
    name: "B · Le chantier d'abord",
    active: true,
    intent:
      "On part du problème, en très grand sur un aplat de couleur, puis coupe sèche sur la solution à l'écran et un chiffre géant. Le plus différenciant face aux concurrents ; parle comme le terrain. Prend toute sa force avec des images de chantier.",
    opening: "aplat-probleme",
    background: "aplats",
    proof: "chiffre-geant",
    titleFont: "bebas-neue",
    bodyFont: "archivo",
    titleCase: "majuscules",
    phoneFrame: "ecran-seul",
    zoomOnGesture: false,
    corners: "carres",
    graphics: ["bandeaux"],
    pace: "rapide",
    transitions: ["coupe"],
    subtitles: "bandeau",
  },
  {
    name: "C · Clair et posé",
    active: true,
    intent:
      "Rassurant et premium : fond clair, téléphone incliné qui flotte, une preuve chiffrée avec sa source, rythme lent. Pour des dirigeants qui comparent et veulent être rassurés ; moins d'impact dans un fil qui défile vite.",
    opening: "titre-pose",
    background: "clair",
    proof: "chiffre-source",
    titleFont: "manrope",
    bodyFont: "manrope",
    titleCase: "normale",
    phoneFrame: "incline",
    zoomOnGesture: false,
    corners: "arrondis",
    graphics: ["pastilles"],
    pace: "pose",
    transitions: ["glisse"],
    subtitles: "bandeau",
  },
] as const;
