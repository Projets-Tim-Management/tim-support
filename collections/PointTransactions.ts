import type { CollectionConfig } from "payload";

import { adminOnly } from "./access";

/**
 * Ledger de points — 1 ligne = 1 transaction (append-only, auditable).
 * Équivalent de la table WP `tim_points_ledger`.
 *
 * Le solde d'un partenaire = SOMME des `delta` de ses transactions. On ne
 * stocke jamais le solde (anti-désynchronisation).
 *
 * `createdAt` (ajouté d'office par Payload) correspond au `created_at` WP.
 * `createdBy` trace l'admin ayant saisi la transaction (audit).
 */
export const PointTransactions: CollectionConfig = {
  slug: "point-transactions",
  labels: { singular: "Transaction de points", plural: "Transactions de points" },
  admin: {
    useAsTitle: "motif",
    defaultColumns: ["partner", "delta", "source", "motif", "createdAt"],
    group: "Partenaires",
  },
  access: adminOnly,
  fields: [
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      label: "Partenaire",
      required: true,
      index: true,
    },
    {
      name: "delta",
      type: "number",
      label: "Delta",
      required: true,
      admin: { description: "> 0 crédit, < 0 débit." },
    },
    { name: "motif", type: "text", label: "Motif", required: true },
    {
      name: "source",
      type: "select",
      label: "Source",
      defaultValue: "ajustement",
      options: [
        { label: "Contrat / contact apporté", value: "contrat" },
        { label: "Avis partenaire", value: "avis" },
        { label: "Ajustement manuel", value: "ajustement" },
        { label: "Échange (débit récompense)", value: "echange" },
      ],
      index: true,
    },
    {
      name: "ref",
      type: "text",
      label: "Référence",
      admin: {
        position: "sidebar",
        description: "Traçabilité (ex : order:123, submission:45).",
      },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      label: "Saisi par",
      admin: { position: "sidebar", readOnly: true },
      hooks: {
        beforeChange: [
          ({ req, value, operation }) =>
            operation === "create" && req.user ? req.user.id : value,
        ],
      },
    },
  ],
};
