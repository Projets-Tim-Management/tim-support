import type { CollectionConfig } from "payload";

import { adminOnly } from "./access";
import { referenceNumber } from "../fields/referenceNumber";

/**
 * Commandes de récompenses (CPT `reward_order` côté WP).
 *
 * Un échange débite le ledger (`ledgerTransaction`), décrémente le stock et
 * crée cette commande à traiter. L'annulation recrédite les points
 * (`refunded` = garde-fou anti double-remboursement). Logique en Phase 5.
 */
export const RewardOrders: CollectionConfig = {
  slug: "reward-orders",
  labels: { singular: "Commande de récompense", plural: "Commandes de récompenses" },
  admin: {
    useAsTitle: "number",
    defaultColumns: ["number", "partner", "reward", "cost", "status"],
    group: "Partenaires",
  },
  access: adminOnly,
  fields: [
    referenceNumber,
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      label: "Partenaire",
      required: true,
      index: true,
    },
    {
      name: "reward",
      type: "relationship",
      relationTo: "rewards",
      label: "Récompense",
      required: true,
    },
    { name: "cost", type: "number", label: "Coût (points)", required: true },
    {
      name: "status",
      type: "select",
      label: "Statut",
      defaultValue: "pending",
      options: [
        { label: "À traiter", value: "pending" },
        { label: "Validée", value: "approved" },
        { label: "Expédiée", value: "shipped" },
        { label: "Remise", value: "delivered" },
        { label: "Annulée", value: "cancelled" },
      ],
      index: true,
    },
    {
      name: "ledgerTransaction",
      type: "relationship",
      relationTo: "point-transactions",
      label: "Transaction de débit",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Ligne du ledger correspondant au débit.",
      },
    },
    {
      name: "refunded",
      type: "checkbox",
      label: "Remboursée",
      defaultValue: false,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Garde-fou anti double-remboursement.",
      },
    },
  ],
};
