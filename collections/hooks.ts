import type { CollectionAfterChangeHook } from "payload";

/** id d'une relation, qu'elle soit peuplée ({id}) ou brute (number). */
const relId = (v: unknown): number | null =>
  (v && typeof v === "object" ? (v as { id: number }).id : (v as number)) ?? null;

/**
 * Soumission de mission passée à « approved » → crédite automatiquement les
 * points au partenaire (une seule fois, garde-fou `credited`).
 * Équivalent du save_post_mission_submission côté WordPress.
 */
export const creditApprovedSubmission: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (doc.status !== "approved" || doc.credited) return;
  if (previousDoc?.status === "approved") return; // déjà traité

  const missionId = relId(doc.mission);
  const partnerId = relId(doc.partner);
  if (!missionId || !partnerId) return;

  const mission = await req.payload
    .findByID({ collection: "missions", id: missionId, depth: 0 })
    .catch(() => null);
  const points = (mission as { points?: number } | null)?.points ?? 0;

  if (points > 0) {
    await req.payload.create({
      collection: "point-transactions",
      req,
      data: {
        partner: partnerId,
        delta: points,
        motif: `Mission validée : ${(mission as { title?: string } | null)?.title ?? ""}`,
        source: (mission as { type?: string } | null)?.type === "preuve" ? "avis" : "ajustement",
        ref: `submission:${doc.id}`,
      },
    });
  }

  // Pose le garde-fou (le second passage du hook sort au test `doc.credited`).
  await req.payload.update({
    collection: "mission-submissions",
    id: doc.id,
    data: { credited: true },
    req,
  });
};

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
