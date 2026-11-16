import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { initialMeasures, measureContext, type Measure } from "@/modules/ai-team/lib/indicators";
import { indicatorOf } from "@/modules/ai-team/lib/indicators-meta";
import { addMonths } from "@/modules/ai-team/lib/format";
import { dayToIso as asDate, HORIZON_MONTHS, isRoadmapTeam, type Horizon } from "@/modules/ai-team/lib/roadmap-constants";

/**
 * Les objectifs de la feuille de route, côté direction (14/11/2026) :
 *
 *  - POST { create: { team, horizon, kind, title, metric?, param?, target?, dueDate?, why? } } — un objectif fixé par
 *    la direction, validé d'emblée ; sa courbe part avec le passé de l'indicateur (12 mois, s'il en a un) et la valeur
 *    du jour, qui est son point de départ ;
 *  - POST { id, measure, at? } — une valeur saisie à la main (indicateur « Saisie manuelle », ou correction) ;
 *  - POST { id, action: "valider" | "refuser" | "abandonner" | "atteint", target?, dueDate? } — décider d'un objectif
 *    proposé par un chef (en corrigeant sa cible ou son échéance), l'abandonner, cocher un jalon atteint.
 *
 * Réservé à la direction.
 */
export const dynamic = "force-dynamic";


export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.create && typeof body.create === "object") {
    const c = body.create as Record<string, unknown>;
    const team = isRoadmapTeam(c.team) ? c.team : null;
    const horizon = String(c.horizon) as Horizon;
    const kind = c.kind === "jalon" ? "jalon" : "chiffre";
    const title = String(c.title ?? "").trim().slice(0, 160);
    if (!team || !(horizon in HORIZON_MONTHS) || !title) return NextResponse.json({ error: "Équipe, horizon et objectif sont à remplir." }, { status: 400 });
    const now = new Date();
    const fallbackDue = addMonths(now, HORIZON_MONTHS[horizon]);
    const data: Record<string, unknown> = { team, horizon, kind, title, status: "valide", validatedAt: now.toISOString(), startDate: now.toISOString(), dueDate: asDate(c.dueDate) ?? fallbackDue.toISOString(), why: String(c.why ?? "").trim().slice(0, 800) || null, author: user.id };
    if (kind === "chiffre") {
      const meta = indicatorOf(String(c.metric));
      const target = Number(c.target);
      if (!meta || !Number.isFinite(target)) return NextResponse.json({ error: "Un objectif chiffré a un indicateur et une cible." }, { status: 400 });
      const param = meta.param ? String(c.param ?? "").trim().slice(0, 300) : null;
      if (meta.param && !param?.startsWith("/")) return NextResponse.json({ error: "Indiquez la page à suivre, par exemple /contact." }, { status: 400 });
      // La courbe de départ : le passé de l'indicateur et la valeur du jour ; une saisie manuelle part de la valeur donnée.
      const start = Number(c.start);
      const measures: Measure[] = meta.key === "manuel" ? (Number.isFinite(start) && c.start !== "" ? [{ at: now.toISOString(), value: start, source: "manuel" }] : []) : await initialMeasures(measureContext(payload, now), meta.key, param, now).catch(() => []);
      Object.assign(data, { metric: meta.key, param, target, measures, baseline: measures.at(-1)?.value ?? null });
    }
    const doc = await payload.create({ collection: "ai-team-goals", data: data as never, overrideAccess: true }).catch(() => null);
    if (!doc) return NextResponse.json({ error: "L'objectif n'a pas pu être enregistré." }, { status: 400 });
    return NextResponse.json({ ok: true, id: doc.id });
  }

  // Une valeur saisie à la main.
  if (body.id != null && body.measure != null) {
    const value = Number(body.measure);
    if (!Number.isFinite(value)) return NextResponse.json({ error: "La valeur doit être un nombre." }, { status: 400 });
    const goal = await payload.findByID({ collection: "ai-team-goals", id: String(body.id), depth: 0, overrideAccess: true }).catch(() => null);
    if (!goal) return NextResponse.json({ error: "Objectif introuvable." }, { status: 404 });
    const at = asDate(body.at) ?? new Date().toISOString();
    const prev = (Array.isArray((goal as { measures?: unknown }).measures) ? (goal as { measures: Measure[] }).measures : []) as Measure[];
    const first = !prev.length;
    await payload.update({ collection: "ai-team-goals", id: String(body.id), data: { measures: [...prev, { at, value, source: "manuel" }].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), ...(first ? { baseline: value } : {}) } as never, overrideAccess: true });
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? "");
  const action = String(body.action ?? "");
  if (!id || !["valider", "refuser", "abandonner", "atteint"].includes(action)) return NextResponse.json({ error: "Demande incomplète." }, { status: 400 });
  const goal = await payload.findByID({ collection: "ai-team-goals", id, depth: 0, overrideAccess: true }).catch(() => null);
  if (!goal) return NextResponse.json({ error: "Objectif introuvable." }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (action === "valider") {
    const target = body.target == null || body.target === "" ? null : Number(body.target);
    if (target != null && !Number.isFinite(target)) return NextResponse.json({ error: "La cible doit être un nombre." }, { status: 400 });
    const due = asDate(body.dueDate);
    Object.assign(data, { status: "valide", validatedAt: new Date().toISOString(), ...(target != null ? { target } : {}), ...(due ? { dueDate: due } : {}) });
  } else if (action === "atteint") data.status = "atteint";
  else data.status = "abandonne";
  await payload.update({ collection: "ai-team-goals", id, data: data as never, overrideAccess: true });
  return NextResponse.json({ ok: true });
}
