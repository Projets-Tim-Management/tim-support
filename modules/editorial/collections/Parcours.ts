import type { CollectionConfig } from "payload";

import { editorialAccess } from "@/core/access";
import { slugField } from "@/core/fields/slug";
import { PARCOURS_PROFILS, PARCOURS_PROFIL_VALUES } from "@/modules/editorial/lib/parcours-profils";

/**
 * Parcours d'apprentissage — CPT `parcours` + ACF (défini en code côté WP).
 *
 * Un parcours = une liste ORDONNÉE de features. La relation `hasMany` de
 * Payload préserve l'ordre saisi (comme le repeater ACF `features`).
 */
export const Parcours: CollectionConfig = {
  slug: "parcours",
  labels: { singular: "Parcours", plural: "Parcours" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "profil", "order", "_status"],
    group: "Parcours",
    components: {
      views: {
        // Remplace le tableau par une carte par parcours (liste des étapes).
        list: {
          Component: "/modules/editorial/admin/ParcoursListView#default",
        },
      },
    },
  },
  access: editorialAccess,
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", label: "Titre", required: true },
    slugField("title"),
    {
      name: "order",
      type: "number",
      label: "Ordre",
      defaultValue: 0,
      index: true, // tri croissant systématique sur les listes
      admin: {
        position: "sidebar",
        description: "Tri croissant (équivalent menu_order WP).",
      },
    },
    {
      name: "profil",
      type: "select",
      label: "Profil cible",
      options: PARCOURS_PROFILS.map((p) => ({ label: p.label, value: p.value })),
      // Pré-rempli quand on crée depuis un groupe de la vue liste
      // (bouton « + Ajouter » → /admin/collections/parcours/create?profil=…).
      defaultValue: ({ req }) => {
        const p = req?.searchParams?.get?.("profil");
        return p && PARCOURS_PROFIL_VALUES.includes(p) ? p : undefined;
      },
      admin: { position: "sidebar" },
    },
    { name: "intro", type: "textarea", label: "Introduction" },
    {
      name: "steps",
      type: "relationship",
      relationTo: "features",
      hasMany: true,
      required: true,
      label: "Étapes (features ordonnées)",
      admin: {
        description: "L'ordre des features définit l'ordre des étapes.",
      },
    },
  ],
};
