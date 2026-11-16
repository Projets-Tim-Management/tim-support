import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { closeRequest } from "@/modules/ai-team/lib/inbox";

/**
 * Clore une demande d'un chef de l'équipe IA, depuis « Vos demandes ».
 *
 * POST { action: "fait" | "repondre" | "retirer", texte } — réservé à la
 * direction. La réponse ou le mot reviennent au chef (outil
 * « lire_reponses_direction », et sa conversation).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; texte?: unknown };
  const doc = (await payload.findByID({ collection: "ai-team-requests", id, depth: 0, overrideAccess: true }).catch(() => null)) as { kind: string; status: string } | null;
  if (!doc) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  const r = closeRequest(doc, String(body.action ?? ""), String(body.texte ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 400 });
  await payload.update({ collection: "ai-team-requests", id, data: { status: r.status, answer: r.answer, closedAt: new Date().toISOString() } as never, overrideAccess: true });
  return NextResponse.json({ ok: true, status: r.status });
}
