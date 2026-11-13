import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { runSeoWeekly } from "@/modules/ai-team/lib/seo-weekly";

/**
 * Lancer la revue de Serge tout de suite, sans attendre lundi : les objectifs
 * de la semaine, leurs créneaux dans l'agenda, la synthèse dans sa
 * conversation. POST — réservé à la direction.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const r = await runSeoWeekly(auth.payload, { force: true });
  if (r.status === "pause") return NextResponse.json({ error: r.message }, { status: 409 });
  if (r.status === "echec") return NextResponse.json({ error: `La revue n'a pas abouti : ${r.message ?? "incident technique"}.` }, { status: 502 });
  return NextResponse.json(r);
}
