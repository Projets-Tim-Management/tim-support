import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * GET /api/admin/ads/a-valider/compte → { count }
 *
 * La pastille de « À valider » dans le menu : tout ce qui attend un geste de
 * Charlie — les créas à valider, les actions de l'agent proposées, les consignes
 * et les apprentissages à confirmer. Les mêmes filtres que la page.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const counts = await Promise.all([
    payload.count({ collection: "ad-creatives", where: { status: { equals: "a-valider" } }, overrideAccess: true }),
    payload.count({ collection: "ad-decisions", where: { and: [{ kind: { in: ["budget", "pause", "activation"] } }, { status: { equals: "proposee" } }] }, overrideAccess: true }),
    payload.count({ collection: "ad-instructions", where: { status: { equals: "proposee" } }, overrideAccess: true }),
    payload.count({ collection: "ad-learnings", where: { status: { equals: "global-propose" } }, overrideAccess: true }),
  ]);
  return NextResponse.json({ count: counts.reduce((s, c) => s + c.totalDocs, 0) }, { headers: { "Cache-Control": "no-store" } });
}
