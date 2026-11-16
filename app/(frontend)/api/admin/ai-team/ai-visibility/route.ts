import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { runVisibilityReport, runVisibilityTick } from "@/modules/ai-team/lib/ai-visibility";

/**
 * « Mesurer maintenant » : Georges pose aux IA autant de questions du mois que
 * le temps le permet (environ une minute et demie, pour laisser au rapport le temps de s'écrire), puis écrit son rapport si la
 * mesure est complète ; sinon le cron la finit, une minute après l'autre.
 * POST — réservé à la direction.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const tick = await runVisibilityTick(auth.payload, { force: true, budgetMs: 100_000 });
  if (tick.status === "pause" || tick.status === "budget") return NextResponse.json({ error: tick.message }, { status: 409 });
  if (tick.status !== "complet") return NextResponse.json({ ...tick, report: null });
  const report = await runVisibilityReport(auth.payload, { complete: true });
  if (report.status === "echec") return NextResponse.json({ error: `La mesure est complète, mais le rapport n'a pas abouti : ${report.message ?? "incident technique"}.` }, { status: 502 });
  return NextResponse.json({ ...tick, report });
}
