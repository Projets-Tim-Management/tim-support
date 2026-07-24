import type { Block, CollectionConfig } from "payload";

import { anyone, isAdmin } from "./access";
import { slugField } from "../fields/slug";

/**
 * Blocs média d'une section de doc — équivalent du "flexible content" ACF
 * `media_doc` (layouts : img / galerie / editeur / fichier).
 */
const mediaBlocks: Block[] = [
  {
    slug: "img",
    labels: { singular: "Image", plural: "Images" },
    fields: [
      { name: "image", type: "upload", relationTo: "media", required: true },
    ],
  },
  {
    slug: "galerie",
    labels: { singular: "Galerie", plural: "Galeries" },
    fields: [
      {
        name: "images",
        type: "upload",
        relationTo: "media",
        hasMany: true,
        required: true,
      },
    ],
  },
  {
    slug: "editeur",
    labels: { singular: "Éditeur (texte)", plural: "Éditeurs" },
    fields: [{ name: "content", type: "richText", label: "Contenu" }],
  },
  {
    slug: "fichier",
    labels: { singular: "Fichier", plural: "Fichiers" },
    fields: [
      { name: "file", type: "upload", relationTo: "media", required: true },
    ],
  },
];

/**
 * Features (fonctionnalités documentées).
 *
 * ⚠️ Dans WordPress, le CPT `feature` et son groupe ACF sont enregistrés HORS
 * du plugin (ACF Pro en base). On reproduit ici fidèlement la structure connue
 * via lib/types.ts (FeatureACF, DocSection, MediaDocItem).
 *
 * `search_h2` / `search_h3` (index de recherche pré-calculé côté WP) sont
 * volontairement omis : on les régénérera via un hook si besoin en Phase 4.
 */
export const Features: CollectionConfig = {
  slug: "features",
  labels: { singular: "Feature", plural: "Features" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "availability", "_status"],
    group: "Éditorial",
  },
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", label: "Titre", required: true },
    slugField("title"),
    {
      name: "titleFeature",
      type: "text",
      label: "Titre affiché (front)",
      admin: { description: "Peut différer du titre. (ACF title_feature)" },
    },
    {
      name: "shortDescription",
      type: "textarea",
      label: "Description courte",
    },
    {
      // Nommé `availability` et non `status` : Payload réserve `_status` pour
      // les brouillons (draft/published) et son enum enum_features_status
      // entrerait en collision. On remappera vers acf.status côté front.
      name: "availability",
      type: "select",
      label: "Statut",
      defaultValue: "Disponible",
      options: [
        { label: "Disponible", value: "Disponible" },
        { label: "Beta", value: "Beta" },
        { label: "Prochainement", value: "Prochainement" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "keywords",
      type: "text",
      hasMany: true,
      label: "Mots-clés / synonymes",
      admin: {
        description: "Termes de recherche alternatifs (ex : masquer panneau).",
      },
    },
    {
      name: "platforms",
      type: "relationship",
      relationTo: "platforms",
      hasMany: true,
      label: "Plateformes",
      admin: { position: "sidebar" },
    },
    {
      name: "categories",
      type: "relationship",
      relationTo: "feature-categories",
      hasMany: true,
      label: "Catégories",
      admin: { position: "sidebar" },
    },
    { name: "content", type: "richText", label: "Contenu (fiche complète)" },
    {
      name: "doc",
      type: "array",
      label: "Sections de documentation",
      labels: { singular: "Section", plural: "Sections" },
      fields: [
        { name: "title_doc", type: "text", label: "Titre de section" },
        { name: "description_doc", type: "richText", label: "Description" },
        {
          name: "media_position",
          type: "select",
          label: "Position du média",
          defaultValue: "Droite",
          options: [
            { label: "Droite", value: "Droite" },
            { label: "Gauche", value: "Gauche" },
          ],
        },
        {
          name: "media_doc",
          type: "blocks",
          label: "Média",
          blocks: mediaBlocks,
        },
      ],
    },
    {
      name: "feedback",
      type: "group",
      label: "Feedback",
      admin: { description: "Compteurs (lecture seule en pratique)." },
      fields: [
        { name: "helpful", type: "number", label: "Utile", defaultValue: 0 },
        {
          name: "notHelpful",
          type: "number",
          label: "Pas utile",
          defaultValue: 0,
        },
      ],
    },
  ],
};
