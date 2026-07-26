import type { Field, FieldHook } from "payload";

import { generateUniqueReferenceNumber } from "@/core/lib/reference-number";

/**
 * Champ `number` : référence humaine unique (n° de soumission, de commande,
 * de ticket). Équivalent des `_sub_number` / `_order_number` / `_ticket_number`
 * de WordPress.
 *
 * Attribution AUTOMATIQUE à la création (hook `beforeValidate`) : un numéro
 * unique est tiré et vérifié contre les collisions, quelle que soit la voie
 * de création (API front, admin, hooks). Optionnel + unique : Postgres
 * autorise plusieurs NULL sous un index unique ; la migration reprend les
 * numéros existants (valeur déjà fournie → non régénérée).
 *
 * Typé via `satisfies Field` (et non `: Field`) pour préserver le type précis
 * du champ : les collections peuvent le surcharger par spread (ex. le masquer)
 * sans casser le typage.
 */
const assignReferenceNumber: FieldHook = async ({ value, operation, req, collection }) => {
  if (operation === "create" && value == null && collection) {
    return generateUniqueReferenceNumber(req.payload, collection.slug);
  }
  return value;
};

export const referenceNumber = {
  name: "number",
  type: "number",
  unique: true, // crée déjà un index unique — pas de `index: true` en plus
  label: "Numéro",
  admin: {
    position: "sidebar",
    readOnly: true,
    description: "Référence attribuée automatiquement ou reprise à la migration.",
  },
  hooks: {
    beforeValidate: [assignReferenceNumber],
  },
} satisfies Field;
