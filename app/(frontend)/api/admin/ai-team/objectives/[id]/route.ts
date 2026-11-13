import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { unbook, type BookedSlot } from "@/modules/ai-team/lib/agenda";
import { applyObjectiveAction, type ObjectiveStep } from "@/modules/ai-team/lib/seo-weekly";

/**
 * Un objectif de la semaine, depuis la fiche de Serge (Équipe IA).
 *
 * POST { step, done } — cocher ou décocher une étape (toutes cochées : l'objectif est fait) ;
 * POST { status: "fait" | "abandonne" | "a-faire" } — le clore ou le rouvrir. Abandonné : ses
 * créneaux sont retirés de l'agenda de la direction. Réservé à la direction.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { step?: unknown; done?: unknown; status?: unknown };
  const doc = (await payload.findByID({ collection: "ai-team-objectives", id, depth: 1, overrideAccess: true }).catch(() => null)) as {
    status: string;
    steps?: ObjectiveStep[] | null;
    slots?: BookedSlot[] | null;
    member?: { calendarConnection?: unknown } | number | null;
  } | null;
  if (!doc) return NextResponse.json({ error: "Objectif introuvable." }, { status: 404 });
  const action = typeof body.step === "number" ? { step: body.step, done: body.done === true } : { status: String(body.status ?? "") as "fait" | "abandonne" | "a-faire" };
  const r = applyObjectiveAction({ status: doc.status, steps: doc.steps ?? [] }, action, new Date());
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 400 });
  await payload.update({ collection: "ai-team-objectives", id, data: { status: r.status, steps: r.steps, closedAt: r.closedAt, ...(r.status === "abandonne" ? { slots: [] } : {}) } as never, overrideAccess: true });
  if (r.status === "abandonne" && doc.slots?.length) {
    const agenda = doc.member && typeof doc.member === "object" ? doc.member.calendarConnection : null;
    await unbook(payload, agenda ?? null, doc.slots);
  }
  return NextResponse.json({ ok: true, status: r.status });
}
