import type { CollectionConfig, FieldHook } from "payload";

import { adminOnly } from "@/core/access";
import { refundCancelledOrder } from "@/modules/partner/hooks/refund-order";
import { referenceNumber } from "@/core/fields/referenceNumber";

/** Coût = coût de la récompense choisie (dérivé automatiquement). */
const costFromReward: FieldHook = async ({ value, data, req }) => {
  const r = data?.reward as unknown;
  const rewardId = r && typeof r === "object" ? (r as { id?: unknown }).id : r;
  const db = req?.payload?.db as { findOne?: (a: unknown) => Promise<Record<string, unknown> | null> } | undefined;
  if (rewardId != null && db?.findOne) {
    try {
      const reward = await db.findOne({ collection: "rewards", where: { id: { equals: rewardId } }, req });
      if (reward && typeof reward.cost === "number") return reward.cost;
    } catch {
      /* récompense indisponible → garde la valeur existante */
    }
  }
  return value;
};

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
  hooks: { afterChange: [refundCancelledOrder] },
  fields: [
    referenceNumber,
    // « + » (créer) retiré : on ne crée pas un partenaire/récompense ici.
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      label: "Partenaire",
      required: true,
      index: true,
      admin: { allowCreate: false },
    },
    {
      name: "reward",
      type: "relationship",
      relationTo: "rewards",
      label: "Récompense",
      required: true,
      admin: { allowCreate: false },
    },
    {
      name: "cost",
      type: "number",
      label: "Coût (points)",
      required: true,
      min: 0,
      admin: { readOnly: true, description: "Défini automatiquement par la récompense choisie." },
      hooks: { beforeValidate: [costFromReward] },
    },
    // Récap live : coût, solde du partenaire, solde après échange.
    {
      name: "balanceBox",
      type: "ui",
      admin: {
        components: { Field: "/modules/partner/admin/RewardOrderBalance#RewardOrderBalance" },
      },
    },
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
