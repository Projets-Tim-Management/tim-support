import type { Field } from "payload";

/**
 * Champ `number` : référence humaine unique (n° de soumission, de commande,
 * de ticket). Équivalent des `_sub_number` / `_order_number` / `_ticket_number`
 * de WordPress.
 *
 * Optionnel + unique : Postgres autorise plusieurs NULL sous un index unique.
 * L'attribution automatique (à la création via l'API) est branchée en Phase 5
 * avec la logique métier ; la migration (Phase 3) reprend les numéros existants.
 */
export const referenceNumber: Field = {
  name: "number",
  type: "number",
  unique: true,
  index: true,
  label: "Numéro",
  admin: {
    position: "sidebar",
    readOnly: true,
    description: "Référence attribuée automatiquement ou reprise à la migration.",
  },
};
