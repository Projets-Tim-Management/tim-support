import type { GlobalConfig } from "payload";

import { hideUnlessAdmin, isAdmin } from "@/core/access";

/**
 * Analyses → Paramètres → « Catégories de dépenses » : la catégorie parente de chaque
 * catégorie analytique Pennylane.
 *
 * L'API Pennylane donne les catégories à plat, sans leur parente : le
 * rattachement est tenu ici, par identifiant Pennylane (un libellé renommé
 * garde sa place). Une catégorie jamais réglée prend l'arbre par défaut
 * (modules/analytics/lib/expense-categories.ts) ; une nouvelle catégorie
 * inconnue est signalée « à rattacher » sur Analyses → Facturation.
 */
export const ExpenseCategories: GlobalConfig = {
  slug: "expense-categories",
  label: "Catégories de dépenses",
  admin: {
    group: "Analyses",
    hidden: hideUnlessAdmin,
    description:
      "Pennylane ne donne pas, par son API, la catégorie parente de chaque catégorie : on la règle ici, une fois. Les catégories sont lues en direct sur Pennylane ; une nouvelle apparaît en haut, « à rattacher ».",
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      name: "parents",
      type: "json",
      label: "Rattachement",
      admin: { components: { Field: "/modules/analytics/admin/CategoryParentsField#CategoryParentsField" } },
    },
  ],
};
