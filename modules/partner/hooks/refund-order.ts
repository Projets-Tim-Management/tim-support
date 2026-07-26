import type { CollectionAfterChangeHook } from "payload";

import { relId } from "@/core/lib/relations";

/**
 * Commande de récompense passée à « cancelled » → recrédite les points et
 * restocke (une seule fois, garde-fou `refunded`).
 * Équivalent du save_post_reward_order côté WordPress.
 */
export const refundCancelledOrder: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (doc.status !== "cancelled" || doc.refunded) return;
  if (previousDoc?.status === "cancelled") return;

  const partnerId = relId(doc.partner);
  if (!partnerId) return;

  await req.payload.create({
    collection: "point-transactions",
    req,
    data: {
      partner: partnerId,
      delta: doc.cost ?? 0,
      motif: "Remboursement — commande annulée",
      source: "ajustement",
      ref: `order:${doc.id}`,
    },
  });

  // Restock +1 si stock fini (≥ 0 ; -1 = illimité, on ne touche pas).
  const rewardId = relId(doc.reward);
  if (rewardId) {
    const reward = await req.payload
      .findByID({ collection: "rewards", id: rewardId, depth: 0 })
      .catch(() => null);
    const stock = (reward as { stock?: number } | null)?.stock;
    if (typeof stock === "number" && stock >= 0) {
      await req.payload.update({
        collection: "rewards",
        id: rewardId,
        data: { stock: stock + 1 },
        req,
      });
    }
  }

  await req.payload.update({
    collection: "reward-orders",
    id: doc.id,
    data: { refunded: true },
    req,
  });
};
