import type { CollectionConfig } from "payload";

import { adminOnly } from "@/core/access";
import { referenceNumber } from "@/core/fields/referenceNumber";
import { partnerField } from "@/modules/partner/fields/partner";

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
    // Pas une page du menu : géré en drawer depuis la fiche du partenaire
    // utilisateur (onglet Points & activité → Transactions de points).
    hidden: true,
  },
  access: adminOnly,
  fields: [
    // Référence séquentielle unique, attribuée automatiquement (1, 2, 3…).
    { ...referenceNumber, label: "Référence" },
    partnerField,
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
    },
    {
      name: "ref",
      type: "text",
      label: "Traçabilité",
      admin: {
        position: "sidebar",
        description: "Lien technique interne (ex : order:123, submission:45). Optionnel.",
      },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      label: "Saisi par",
      // Pré-rempli avec l'utilisateur courant (affiché tout de suite), verrouillé.
      defaultValue: ({ user }) => user?.id ?? null,
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
