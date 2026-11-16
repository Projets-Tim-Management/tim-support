import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { runCompetitionReport } from "@/modules/ai-team/lib/competition";

/**
 * Lancer la veille de Guy tout de suite : les plans de site de la semaine
 * (ceux qui manquent), puis son rapport. POST — réservé à la direction.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const r = await runCompetitionReport(auth.payload, { force: true });
  if (r.status === "pause" || r.status === "deja-fait") return NextResponse.json({ error: r.message }, { status: 409 });
  if (r.status === "echec") return NextResponse.json({ error: `La veille n'a pas abouti : ${r.message ?? "incident technique"}.` }, { status: 502 });
  return NextResponse.json(r);
}
