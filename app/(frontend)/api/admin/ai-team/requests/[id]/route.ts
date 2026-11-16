import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { checkRequestStep, closeRequest } from "@/modules/ai-team/lib/requests";

/**
 * Une demande d'un chef de l'équipe IA, depuis « Mes tâches ».
 *
 * POST { action: "fait" | "repondre" | "retirer" | "rouvrir", texte } — la clore (ou rouvrir un « C'est fait »
 * cliqué trop vite) ; POST { action: "etape", step, done } — cocher une étape (toutes cochées : faite).
 * Réservé à la direction. La réponse ou le mot reviennent au chef (outil « lire_reponses_direction », et sa
 * conversation).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; texte?: unknown; step?: unknown; done?: unknown };
  const doc = (await payload.findByID({ collection: "ai-team-requests", id, depth: 0, overrideAccess: true }).catch(() => null)) as { kind: string; status: string; steps?: unknown; closedAt?: string | null } | null;
  if (!doc) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  if (body.action === "etape") {
    const s = checkRequestStep(doc, Number(body.step), body.done === true);
    if (!s.ok) return NextResponse.json({ error: s.reason }, { status: 400 });
    const closedAt = s.status === "faite" ? (doc.status === "faite" ? (doc.closedAt ?? new Date().toISOString()) : new Date().toISOString()) : null;
    await payload.update({ collection: "ai-team-requests", id, data: { steps: s.steps, status: s.status, closedAt } as never, overrideAccess: true });
    return NextResponse.json({ ok: true, status: s.status });
  }
  const r = closeRequest(doc, String(body.action ?? ""), String(body.texte ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 400 });
  await payload.update({ collection: "ai-team-requests", id, data: { status: r.status, answer: r.answer, closedAt: r.status === "ouverte" ? null : new Date().toISOString() } as never, overrideAccess: true });
  return NextResponse.json({ ok: true, status: r.status });
}
