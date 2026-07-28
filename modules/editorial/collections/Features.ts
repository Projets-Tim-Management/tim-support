import type { Block, CollectionConfig } from "payload";

import { editorialAccess } from "@/core/access";
import { slugField } from "@/core/fields/slug";
import { importFeatureHandler } from "@/modules/editorial/import/importFeatureHandler";
import { AVAILABILITY_OPTIONS } from "@/modules/editorial/lib/availability";

/**
 * Blocs média d'une section de doc — équivalent du "flexible content" ACF
 * `media_doc` (layouts : img / galerie / editeur / fichier).
 */
const mediaBlocks: Block[] = [
  {
    slug: "img",
    labels: { singular: "Image / GIF", plural: "Images / GIF" },
    fields: [
      {
        name: "image",
        type: "upload",
        relationTo: "media",
        required: true,
        admin: { description: "PNG, JPG ou GIF animé (démonstration de la partie)." },
      },
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
    group: "Features",
    components: {
      // Panneau « Importer une feature depuis Claude » au-dessus de la liste.
      beforeListTable: ["/modules/editorial/admin/FeatureImport#FeatureImport"],
    },
  },
  access: editorialAccess,
  versions: { drafts: true },
  // Import d'une feature pré-rédigée (JSON généré par Claude) → brouillon.
  // Reçu sur POST /payload-api/features/import (voir importFeatureHandler).
  endpoints: [
    { path: "/import", method: "post", handler: importFeatureHandler },
  ],
  fields: [
    // ─── Titre (colonne principale, toujours visible) ────────────────────────
    {
      name: "title",
      type: "text",
      label: "Titre",
      required: true,
      admin: { description: "Nom interne de la feature (sert de titre à la fiche)." },
    },

    // ─── Contenu principal réparti en onglets (aération du formulaire) ────────
    // Onglets SANS `name` → purement présentationnels, les champs gardent leur
    // chemin de données d'origine (aucune migration).
    {
      type: "tabs",
      tabs: [
        {
          label: "Contenu",
          description: "Informations générales affichées sur la fiche.",
          fields: [
            slugField("title"),
            {
              name: "titleFeature",
              type: "text",
              label: "Titre affiché (front)",
              admin: { description: "Peut différer du titre interne. Laissez vide pour réutiliser le titre." },
            },
            {
              name: "shortDescription",
              type: "textarea",
              label: "Description courte",
              admin: { description: "Résumé d'une phrase (listes, résultats de recherche)." },
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
              name: "content",
              type: "richText",
              label: "Introduction",
              admin: { description: "Texte d'intro de la fiche, avant les parties détaillées ci-dessous." },
            },
          ],
        },
        {
          label: "Parties & documentation",
          description:
            "Découpez la feature en parties. Chaque partie = un titre, une description et un média optionnel (GIF, image, galerie ou fichier).",
          fields: [
            {
              name: "doc",
              type: "array",
              label: "Parties de la feature",
              labels: { singular: "Partie", plural: "Parties" },
              admin: {
                // Repliées par défaut → on voit la liste des parties d'un coup
                // d'œil (libellé custom ci-dessous), on déplie pour éditer.
                initCollapsed: true,
                // Classe dédiée → style « carte contrastée » scopé (voir SCSS).
                className: "doc-array",
                components: {
                  RowLabel: "/modules/editorial/admin/DocSectionRowLabel#DocSectionRowLabel",
                },
              },
              fields: [
                {
                  name: "titleDoc",
                  type: "text",
                  label: "Titre de la partie",
                  admin: { placeholder: "Ex. Activer la fonctionnalité" },
                },
                { name: "descriptionDoc", type: "richText", label: "Description" },
                {
                  name: "mediaDoc",
                  type: "blocks",
                  label: "Média de la partie (optionnel)",
                  labels: { singular: "Média", plural: "Médias" },
                  admin: {
                    description:
                      "Ajoutez un GIF animé (bloc « Image / GIF »), une image, une galerie ou un fichier. Laissez vide si la partie n'a pas de visuel.",
                  },
                  blocks: mediaBlocks,
                },
                {
                  name: "mediaPosition",
                  type: "select",
                  label: "Position du média",
                  defaultValue: "droite",
                  options: [
                    { label: "À droite du texte", value: "droite" },
                    { label: "À gauche du texte", value: "gauche" },
                  ],
                  admin: {
                    description: "Placement du média par rapport à la description (sur le front).",
                    // N'apparaît que si la partie a effectivement un média :
                    // sinon ce réglage est du bruit visuel inutile.
                    condition: (_data, siblingData) =>
                      Array.isArray(siblingData?.mediaDoc) && siblingData.mediaDoc.length > 0,
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // ─── Barre latérale : contexte / classement ──────────────────────────────
    {
      name: "thumbnail",
      type: "upload",
      relationTo: "media",
      label: "Image à la une",
      admin: {
        position: "sidebar",
        // Classe dédiée → présentation « vignette encadrée » (voir SCSS).
        className: "feature-thumb",
        description: "Visuel de couverture (listes, cartes, résultats de recherche).",
      },
    },
    {
      // Nommé `availability` et non `status` : Payload réserve `_status` pour
      // les brouillons (draft/published) et son enum enum_features_status
      // entrerait en collision. On remappera vers acf.status côté front.
      name: "availability",
      type: "select",
      label: "Statut",
      defaultValue: "disponible",
      options: AVAILABILITY_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      admin: { position: "sidebar" },
    },
    {
      name: "platforms",
      type: "relationship",
      relationTo: "platforms",
      hasMany: true,
      label: "Plateformes",
      admin: {
        position: "sidebar",
        // Classe dédiée → badges bleus identiques au front (voir SCSS).
        className: "feature-platforms",
      },
    },
    {
      name: "categories",
      type: "relationship",
      relationTo: "feature-categories",
      hasMany: true,
      label: "Catégories",
      admin: { position: "sidebar" },
    },

    // ─── Feedback (compteurs de votes) : contexte, pas édition ────────────────
    // Déplacé de l'ancien onglet « Feedback » vers la barre latérale en lecture
    // seule → le flux d'édition ne garde que « Contenu » + « Parties ».
    {
      name: "feedback",
      type: "group",
      label: "Feedback",
      admin: {
        position: "sidebar",
        description: "Votes « utile / pas utile » recueillis sur le front (lecture seule).",
      },
      fields: [
        { name: "helpful", type: "number", label: "👍 Utile", defaultValue: 0, admin: { readOnly: true } },
        { name: "notHelpful", type: "number", label: "👎 Pas utile", defaultValue: 0, admin: { readOnly: true } },
      ],
    },
  ],
};
