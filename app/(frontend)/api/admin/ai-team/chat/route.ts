import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { askChief, ChatError } from "@/modules/ai-team/lib/chat";

/**
 * La conversation de la direction avec un chef de l'équipe IA.
 *
 * POST { member, text } → la réponse du chef (gardée avec le message).
 * Réservée à la direction (super-admin ET direction@).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const body = (await req.json().catch(() => ({}))) as { member?: unknown; text?: unknown };
  try {
    const r = await askChief(payload, { memberKey: String(body.member ?? ""), text: String(body.text ?? ""), userId: user.id });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ChatError) return NextResponse.json({ error: e.message }, { status: 400 });
    payload.logger.error(`[équipe IA] conversation : ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "La réponse n'a pas pu être obtenue. Réessayez dans un instant." }, { status: 502 });
  }
}
