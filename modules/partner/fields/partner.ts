import type { Field } from "payload";

import { partnerIdOf } from "@/core/access";

/**
 * Relation vers un partenaire, requise et indexée (les tables métier sont
 * quasi toujours filtrées par partenaire). Réutilisée par le ledger, les
 * soumissions de missions et les commandes de récompenses.
 *
 * `defaultValue` : pré-rempli avec la fiche du compte connecté quand c'est un
 * partenaire (UX du formulaire de création). Le hook enforcePartnerField reste
 * la vraie garantie côté serveur (anti-usurpation).
 */
export const partnerField: Field = {
  name: "partner",
  type: "relationship",
  relationTo: "partners",
  label: "Partenaire",
  required: true,
  index: true,
  defaultValue: ({ req }) => partnerIdOf(req?.user) ?? undefined,
};
