import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { unbook, type BookedSlot } from "@/modules/ai-team/lib/agenda";
import { applyObjectiveAction, type ObjectiveStep } from "@/modules/ai-team/lib/seo-weekly";

/**
 * Un objectif de la semaine, depuis la fiche de Sergey (Équipe IA).
 *
 * POST { step, done } — cocher ou décocher une étape (toutes cochées : l'objectif est fait) ;
 * POST { status: "fait" | "abandonne" | "a-faire" } — le clore ou le rouvrir ; un objectif reporté remis « à faire »
 * repart pour la semaine en cours. Abandonné : ses
 * créneaux sont retirés de l'agenda de la direction. Réservé à la direction.
 */
export const dynamic = "force-dynamic";

/** Le vendredi de la semaine en cours (heure de Paris, à midi) ; le samedi et le dimanche, celui de la semaine suivante. */
const fridayOf = (now: Date) => {
  const day = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now)}T12:00:00Z`);
  const wd = day.getUTCDay();
  return new Date(day.getTime() + (((5 - wd + 7) % 7) || (wd === 5 ? 0 : 7)) * 86_400_000).toISOString();
};

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
  // Un objectif reporté que la direction remet « cette semaine » (16/11/2026) : il repart, échéance vendredi.
  const revived = doc.status === "reporte" && r.status === "a-faire" ? { dueDate: fridayOf(new Date()) } : {};
  await payload.update({ collection: "ai-team-objectives", id, data: { status: r.status, steps: r.steps, closedAt: r.closedAt, ...revived, ...(r.status === "abandonne" ? { slots: [] } : {}) } as never, overrideAccess: true });
  if (r.status === "abandonne" && doc.slots?.length) {
    const agenda = doc.member && typeof doc.member === "object" ? doc.member.calendarConnection : null;
    await unbook(payload, agenda ?? null, doc.slots);
  }
  return NextResponse.json({ ok: true, status: r.status });
}
