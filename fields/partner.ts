import type { Field } from "payload";

/**
 * Relation vers un partenaire, requise et indexée (les tables métier sont
 * quasi toujours filtrées par partenaire). Réutilisée par le ledger, les
 * soumissions de missions et les commandes de récompenses.
 */
export const partnerField: Field = {
  name: "partner",
  type: "relationship",
  relationTo: "partners",
  label: "Partenaire",
  required: true,
  index: true,
};
