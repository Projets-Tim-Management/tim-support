import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { runSocial } from "@/modules/ai-team/lib/social";

/** Lancer le rapport réseaux & vidéo de Cléo tout de suite. POST — réservé à la direction. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const r = await runSocial(auth.payload, { force: true });
  if (r.status === "pause" || r.status === "deja-fait") return NextResponse.json({ error: r.message }, { status: 409 });
  if (r.status === "echec") return NextResponse.json({ error: `Le rapport n'a pas abouti : ${r.message ?? "incident technique"}.` }, { status: 502 });
  return NextResponse.json(r);
}
