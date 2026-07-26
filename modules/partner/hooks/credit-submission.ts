import type { CollectionAfterChangeHook } from "payload";

import { relId } from "@/core/lib/relations";

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
