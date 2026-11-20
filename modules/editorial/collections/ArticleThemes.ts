import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Thématiques des articles (décision du 18/11/2026, docs/articles/THEMATIQUES.md).
 * Créées au premier import ; ensuite modifiables ici. Sergey et son équipe
 * proposent les articles DANS ces thématiques.
 */
export const ArticleThemes: CollectionConfig = {
  slug: "article-themes",
  labels: { singular: "Thématique", plural: "Thématiques" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["number", "name", "kind", "pillar", "priority"],
    group: "Éditorial",
    description: "Les grandes thématiques des articles, et leur page pilier. Les articles s'y rangent ; l'équipe SEO/GEO propose des sujets dans chacune.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "priority",
  fields: [
    { name: "name", type: "text", label: "Thématique", required: true },
    {
      name: "number",
      type: "number",
      label: "Numéro",
      required: true,
      unique: true,
      index: true,
      admin: { position: "sidebar", description: "Identifiant stable (le rangement automatique des articles importés s'appuie dessus)." },
    },
    { name: "priority", type: "number", label: "Priorité", admin: { position: "sidebar", description: "1 = d'abord." } },
    {
      name: "kind",
      type: "select",
      label: "Type",
      required: true,
      defaultValue: "trafic",
      options: [
        { label: "Trafic (information)", value: "trafic" },
        { label: "Vente (comparatifs, choix d'un logiciel)", value: "vente" },
      ],
      admin: { position: "sidebar", description: "Seuls les articles « vente » peuvent citer les prix de TIM Management." },
    },
    { name: "pillar", type: "text", label: "Page pilier", admin: { description: "Le sujet de la page qui chapeaute la thématique." } },
    { name: "pillarUrl", type: "text", label: "Adresse de la page pilier", admin: { description: "Vide tant que la page pilier n'existe pas." } },
    { name: "module", type: "text", label: "Module TIM Management relié" },
    {
      name: "subthemes",
      type: "array",
      label: "Sous-thématiques",
      labels: { singular: "Sous-thématique", plural: "Sous-thématiques" },
      fields: [{ name: "name", type: "text", label: "Sous-thématique", required: true }],
    },
  ],
};
