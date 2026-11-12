import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { runWeeklyReview } from "@/modules/ai-team/lib/review";

/**
 * Lancer la revue de Margaux tout de suite, sans attendre lundi.
 * POST — réservé à la direction. La synthèse arrive dans la conversation,
 * les recommandations dans « Vos demandes ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const r = await runWeeklyReview(auth.payload, { force: true });
  if (r.status === "pause") return NextResponse.json({ error: r.message }, { status: 400 });
  if (r.status === "echec") return NextResponse.json({ error: "La revue n'a pas pu être faite. Le détail est dans la conversation." }, { status: 502 });
  return NextResponse.json(r);
}
