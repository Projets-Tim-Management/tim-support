import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { ACTION_WHO, dayToIso as asDate, isRoadmapTeam } from "@/modules/ai-team/lib/roadmap-constants";

/**
 * Les actions des équipes humaines sur la feuille de route (14/11/2026) :
 *
 *  - POST { create: { title, who, team, status, plannedDate?, doneDate?, goal?, notes? } } — une action prévue ou
 *    faite par la direction, le développement, les commerciaux… ;
 *  - POST { id, status: "prevue" | "en-cours" | "faite" | "abandonnee" } — la cocher, la décocher, la faire avancer
 *    (« faite » date la fin à aujourd'hui ; décochée, elle redevient prévue).
 *
 * Réservé à la direction.
 */
export const dynamic = "force-dynamic";

const WHO = new Set<string>(ACTION_WHO.map((w) => w.value));

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.create && typeof body.create === "object") {
    const c = body.create as Record<string, unknown>;
    const title = String(c.title ?? "").trim().slice(0, 200);
    const status = c.status === "faite" ? "faite" : c.status === "en-cours" ? "en-cours" : "prevue";
    if (!title) return NextResponse.json({ error: "Écrivez l'action." }, { status: 400 });
    const planned = asDate(c.plannedDate);
    const done = asDate(c.doneDate) ?? (status === "faite" ? new Date().toISOString() : null);
    if (status !== "faite" && !planned) return NextResponse.json({ error: "Une action prévue a une date." }, { status: 400 });
    // L'objectif servi doit exister (sinon la création échouerait en 500).
    const goalId = /^\d+$/.test(String(c.goal ?? "")) ? String(c.goal) : null;
    const goal = goalId && (await payload.findByID({ collection: "ai-team-goals", id: goalId, depth: 0, overrideAccess: true, select: { id: true } as never }).catch(() => null)) ? Number(goalId) : null;
    const doc = await payload.create({
      collection: "ai-team-actions",
      data: { title, who: WHO.has(String(c.who)) ? String(c.who) : "autre", team: isRoadmapTeam(c.team) ? c.team : "tous", status, plannedDate: planned, doneDate: done, goal, notes: String(c.notes ?? "").trim().slice(0, 2000) || null, author: user.id } as never,
      overrideAccess: true,
    });
    return NextResponse.json({ ok: true, id: doc.id });
  }

  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  if (!id || !["prevue", "en-cours", "faite", "abandonnee"].includes(status)) return NextResponse.json({ error: "Demande incomplète." }, { status: 400 });
  const action = (await payload.findByID({ collection: "ai-team-actions", id, depth: 0, overrideAccess: true, select: { plannedDate: true, doneDate: true } as never }).catch(() => null)) as { plannedDate?: string | null; doneDate?: string | null } | null;
  if (!action) return NextResponse.json({ error: "Action introuvable." }, { status: 404 });
  const today = new Date().toISOString();
  // Cochée : la fin d'origine est gardée s'il y en a une. Décochée : elle redevient prévue, et garde une date.
  const dates = status === "faite" ? { doneDate: action.doneDate ?? today } : status === "prevue" ? { doneDate: null, plannedDate: action.plannedDate ?? action.doneDate ?? today } : {};
  await payload.update({ collection: "ai-team-actions", id, data: { status, ...dates } as never, overrideAccess: true });
  return NextResponse.json({ ok: true });
}
