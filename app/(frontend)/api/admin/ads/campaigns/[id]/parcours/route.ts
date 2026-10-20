import { NextResponse } from "next/server";

import { draftFromDoc, isComplete } from "@/modules/ads/lib/campaign-wizard";
import { launchSteps } from "@/modules/ads/lib/launch-track";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * GET /api/admin/ads/campaigns/:id/parcours → { steps }
 *
 * Le suivi de lancement en tête de la fiche campagne : chaque étape constatée
 * d'après la base (lib/launch-track).
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const doc = await payload.findByID({ collection: "ad-campaigns", id, depth: 0, overrideAccess: true }).catch(() => null);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [runs, toValidate, validated] = await Promise.all([
    payload.find({ collection: "ad-agent-runs", where: { campaign: { equals: doc.id } }, sort: "-createdAt", limit: 1, depth: 0, overrideAccess: true }),
    payload.count({ collection: "ad-creatives", where: { and: [{ campaign: { equals: doc.id } }, { status: { equals: "a-valider" } }] }, overrideAccess: true }),
    payload.find({ collection: "ad-creatives", where: { and: [{ campaign: { equals: doc.id } }, { status: { in: ["validee", "en-ligne"] } }] }, pagination: false, depth: 0, overrideAccess: true, select: { files: true } as never }),
  ]);
  const c = doc as unknown as { publicationStatus?: string | null; publication?: { previewsSeenAt?: string | null } | null };
  const steps = launchSteps(
    {
      briefComplete: isComplete(draftFromDoc(doc as never)),
      runs: runs.totalDocs,
      lastRunStatus: (runs.docs[0] as { status?: string } | undefined)?.status ?? null,
      creasToValidate: toValidate.totalDocs,
      creasReady: (validated.docs as { files?: unknown[] | null }[]).filter((x) => (x.files ?? []).length > 0).length,
      publicationStatus: c.publicationStatus ?? null,
      previewsSeen: Boolean(c.publication?.previewsSeenAt),
    },
    doc.id,
  );
  return NextResponse.json({ steps }, { headers: { "Cache-Control": "no-store" } });
}
