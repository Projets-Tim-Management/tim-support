import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { runVeille } from "@/modules/ai-team/lib/veille";
import { VEILLE_DOMAINS } from "@/modules/ai-team/lib/veille-domains";

/**
 * Lancer la veille d'un agent tout de suite, sans attendre dimanche soir.
 * POST { member: "sea-google" } — réservé à la direction. La nouvelle méthode
 * s'affiche sur la fiche de l'agent.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { member?: unknown };
  const key = typeof body.member === "string" ? body.member : "";
  if (!VEILLE_DOMAINS[key]) return NextResponse.json({ error: "Cet agent ne fait pas de veille." }, { status: 400 });
  const r = await runVeille(auth.payload, key, { trigger: "direction" });
  if (r.status === "pause" || r.status === "deja-faite") return NextResponse.json({ error: r.message }, { status: 409 });
  if (r.status === "echec") return NextResponse.json({ error: `La veille n'a pas abouti : ${r.message ?? "incident technique"}.` }, { status: 502 });
  return NextResponse.json(r);
}
