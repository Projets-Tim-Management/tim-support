import type { Block, CollectionConfig, Field, Where } from "payload";

import { editorialAccess } from "@/core/access";
import { slugField } from "@/core/fields/slug";
import { exportFeatureHandler } from "@/modules/editorial/import/exportFeatureHandler";
import { importFeatureHandler } from "@/modules/editorial/import/importFeatureHandler";
import { mergeFeatureHandler } from "@/modules/editorial/import/mergeFeatureHandler";
import { purgeReplacedMedia } from "@/modules/editorial/hooks/purgeReplacedMedia";
import { AVAILABILITY_OPTIONS } from "@/modules/editorial/lib/availability";
import { FEATURE_PROFILES } from "@/modules/editorial/lib/feature-profiles";

/**
 * Blocs média d'une section de doc — équivalent du "flexible content" ACF
 * `media_doc` (layouts : img / galerie / editeur / fichier).
 */
const mediaBlocks: Block[] = [
  {
    slug: "img",
    labels: { singular: "Image / GIF / vidéo", plural: "Images / GIF / vidéos" },
    fields: [
      {
        name: "image",
        type: "upload",
        relationTo: "media",
        required: true,
        admin: {
          description:
            "PNG, JPG, GIF — ou directement la capture vidéo (.mov, .mp4) : elle est convertie dans le navigateur en courte vidéo en boucle, légère et nette, à 1200 px de large (ordinateur ou mobile).",
          // Conversion des captures vidéo, et nom tiré de la feature (voir DirectUpload).
          custom: { accept: "image/*,video/*,.mov", noun: "une image, un GIF ou une capture vidéo", convertVideo: true, nameFrom: "feature", pickExisting: true },
          components: { Field: "/admin/fields/DirectUpload#default" },
        },
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
        admin: { custom: { nameFrom: "feature" }, components: { Field: "/admin/fields/DirectUpload#default" } },
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
      {
        name: "file",
        type: "upload",
        relationTo: "media",
        required: true,
        admin: {
          custom: { accept: "*", noun: "un fichier" },
          components: { Field: "/admin/fields/DirectUpload#default" },
        },
      },
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
    // Les catégories en colonne : la section (« Web › Chantier ») se lit sur
    // chaque ligne. Recherche étendue au titre affiché, au slug et au résumé.
    defaultColumns: ["title", "categories", "availability", "_status"],
    listSearchableFields: ["title", "titleFeature", "slug", "shortDescription"],
    group: "Éditorial",
    components: {
      // Panneau « Importer une feature depuis Claude » au-dessus de la liste.
      beforeListTable: [
        // Rédiger une fiche avec Claude : indications + vidéos → fiche en brouillon.
        "/modules/editorial/admin/FeatureWriter#FeatureWriterLauncher",
        "/modules/editorial/admin/FeatureImport#FeatureImport",
        // Filtres Web / Mobile puis par section (Chantier, Chiffres…).
        "/modules/editorial/admin/FeatureListFilters#FeatureListFilters",
      ],
      edit: {
        // Mettre à jour la fiche ouverte avec Claude (même parcours en 4 étapes).
        beforeDocumentControls: ["/modules/editorial/admin/FeatureWriter#FeatureWriterEditButton"],
        // Dans le menu ⋮ plutôt qu'en boutons : gestes occasionnels, qui ne
        // doivent pas disputer l'attention à « Publier ».
        editMenuItems: ["/modules/editorial/admin/FeatureJsonMenu#FeatureJsonMenu"],
      },
    },
  },
  access: editorialAccess,
  versions: { drafts: true },
  // À la publication, les visuels remplacés qui ne servent plus nulle part sont
  // supprimés (CDN + médiathèque) — voir purgeReplacedMedia.
  hooks: { afterChange: [purgeReplacedMedia] },
  endpoints: [
    // Import d'une feature pré-rédigée (JSON généré par Claude) → brouillon.
    { path: "/import", method: "post", handler: importFeatureHandler },
    // Le miroir : rend une feature dans le format que l'import relit, pour
    // reprendre une fiche existante au lieu de la réécrire.
    { path: "/:id/export", method: "get", handler: exportFeatureHandler },
    // Remet un JSON dans une fiche existante SANS toucher à ce qu'il ne
    // contient pas — les visuels notamment.
    { path: "/:id/merge", method: "post", handler: mergeFeatureHandler },
  ],
  fields: [
    /**
     * ─── Colonne principale : dans l'ordre où l'on écrit une fiche ───────────
     *
     * Titre → résumé → introduction → PARTIES. Les parties, qui portent
     * l'essentiel (texte + capture), étaient cachées dans un second onglet ; le
     * slug et les mots-clés, qu'on ne touche presque jamais, occupaient le haut.
     * Tout reste présentationnel (rangées et blocs SANS `name`) : les champs
     * gardent leur chemin de données, aucune migration.
     */
    {
      type: "row",
      fields: [
        {
          name: "title",
          type: "text",
          label: "Titre",
          required: true,
          admin: { width: "50%", description: "Nom interne (liste, recherche dans l'admin)." },
        },
        {
          name: "titleFeature",
          type: "text",
          label: "Titre affiché sur le site",
          admin: {
            width: "50%",
            placeholder: "Identique au titre",
            description: "À remplir seulement s'il diffère du titre.",
          },
        },
      ],
    },
    {
      name: "shortDescription",
      type: "textarea",
      label: "Résumé",
      admin: {
        rows: 2,
        description: "Une ou deux phrases : affiché dans les listes et les résultats de recherche.",
      },
    },
    {
      type: "collapsible",
      label: "Introduction",
      admin: {
        initCollapsed: false,
        description: "Texte affiché en tête de la fiche, avant les parties. Facultatif.",
      },
      fields: [{ name: "content", type: "richText", label: false }],
    },
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
              "Ajoutez une capture vidéo ou un GIF (bloc « Image / GIF / vidéo »), une image, une galerie ou un fichier. Laissez vide si la partie n'a pas de visuel.",
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

    {
      type: "collapsible",
      label: "Adresse et recherche",
      admin: {
        // Rarement modifiés : repliés, ils ne disputent plus l'attention au contenu.
        initCollapsed: true,
        description: "L'adresse de la fiche et les mots qui doivent la faire trouver.",
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              // Même champ que slugField, rendu dans la colonne principale.
              ...(slugField("title") as Extract<Field, { name: string }>),
              label: "Adresse (slug)",
              admin: { width: "50%", description: "Générée depuis le titre si vide." },
            } as Field,
            {
              name: "keywords",
              type: "text",
              hasMany: true,
              label: "Mots-clés / synonymes",
              admin: {
                width: "50%",
                placeholder: "Tapez un mot, puis Entrée",
                description: "Termes qu'un utilisateur pourrait chercher (ex : masquer panneau).",
              },
            },
          ],
        },
      ],
    },

    /**
     * ─── Barre latérale : le CLASSEMENT, dans l'ordre où on le décide ────────
     * Statut, plateforme, section — puis la vignette, et le retour des lecteurs
     * en une ligne. La grande zone de dépôt de la vignette, en tête, attirait
     * l'œil sur le champ le moins utilisé de la fiche.
     */
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
        description: "Web, Mobile, ou les deux.",
      },
    },
    {
      name: "categories",
      type: "relationship",
      relationTo: "feature-categories",
      hasMany: true,
      label: "Sections",
      /**
       * Les racines (« Web », « Mobile ») ne sont plus PROPOSÉES : elles
       * doublaient le champ Plateformes juste au-dessus.
       *
       * ⚠️ Payload VALIDE aussi l'enregistrement avec ce filtre : une fiche qui
       * portait déjà « Mobile » ne pouvait plus être enregistrée du tout
       * (« Ce champ contient des sélections invalides »), même pour y ajouter une
       * vidéo. Les valeurs déjà posées sont donc acceptées ; seules les
       * nouvelles se limitent aux vraies sections.
       */
      filterOptions: ({ siblingData }): Where => {
        const current = (Array.isArray((siblingData as { categories?: unknown })?.categories)
          ? ((siblingData as { categories: unknown[] }).categories)
          : []
        )
          .map((v) => (v && typeof v === "object" ? (v as { id?: unknown }).id : v))
          .filter((v): v is number | string => typeof v === "number" || typeof v === "string");
        const section: Where = { parent: { exists: true } };
        return current.length ? { or: [section, { id: { in: current } }] } : section;
      },
      admin: {
        position: "sidebar",
        description: "Où ranger la fiche, ex. « Mobile › Authentification ».",
      },
    },
    {
      // Qui est concerné : sert au filtre « Je suis… » du site et à la
      // recherche. Aucun profil coché = la fiche concerne tout le monde.
      name: "profiles",
      type: "select",
      hasMany: true,
      label: "Pour qui ?",
      options: FEATURE_PROFILES.map(({ label, value }) => ({ label, value })),
      admin: {
        position: "sidebar",
        // Cases à cocher avec « Tous les profils » (voir ProfilesField).
        components: { Field: "/modules/editorial/admin/ProfilesField#ProfilesField" },
      },
    },
    {
      name: "thumbnail",
      type: "upload",
      relationTo: "media",
      label: "Image à la une",
      admin: {
        position: "sidebar",
        className: "direct-upload--compact",
        description: "Facultative : visuel des cartes et des résultats de recherche.",
        custom: { nameFrom: "feature" },
        components: { Field: "/admin/fields/DirectUpload#default" },
      },
    },

    // ─── Feedback : les votes du site, résumés en une ligne ───────────────────
    // Les compteurs restent en base (écrits par le site) mais ne s'affichent
    // plus en deux grands champs grisés : un résumé lisible les remplace.
    {
      name: "feedbackSummary",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "/modules/editorial/admin/FeatureFeedback#FeatureFeedback" },
      },
    },
    {
      name: "feedback",
      type: "group",
      label: "Feedback",
      admin: { position: "sidebar", hidden: true },
      fields: [
        { name: "helpful", type: "number", label: "👍 Utile", defaultValue: 0, admin: { readOnly: true } },
        { name: "notHelpful", type: "number", label: "👎 Pas utile", defaultValue: 0, admin: { readOnly: true } },
      ],
    },
  ],
};
