import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import {
  AUDIENCE_LABEL,
  DUE_REASON_LABEL,
  TRAINING_EMAILS,
  computedSchedule,
  decideTrainingEmail,
  scheduleDayEmails,
  type DayEmailRow,
} from "@/modules/training/lib/email-schedule";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";
import { ensureScheduled, factsFor, loadDay, recipientsFor, sendDayEmail } from "@/modules/training/lib/send";

import { trainingAccess } from "./access";

/**
 * Les envois d'une formation, journée par journée — l'onglet « E-mails » du
 * plan, comme celui de la phase de test.
 *
 * GET  ?training=…  → pour chaque journée datée : chaque envoi, sa date (prévue,
 *                     calculée), son état, à qui il est parti, à qui il ira.
 * POST { dayId, key, action: "set", at, overridden }  → régler la date
 *      { dayId, key, action: "send" }                 → envoyer maintenant
 */

const idOf = trainingRefId;

export async function GET(req: Request) {
  const trainingId = new URL(req.url).searchParams.get("training");
  if (!trainingId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const payload = await payloadClient();
  const access = await trainingAccess(payload, req.headers, trainingId);
  if (!access.ok) return NextResponse.json({ error: "forbidden" }, { status: access.status });

  const days = await payload.find({
    collection: "training-days",
    where: { training: { equals: trainingId } },
    depth: 0,
    limit: 100,
    sort: "date",
    overrideAccess: true,
  });
  const now = Date.now();
  const out = [];
  for (const d of days.docs) {
    let b = await loadDay(payload, d.id);
    if (!b) continue;
    b = await ensureScheduled(payload, b);
    const rows = (b.day.emails as DayEmailRow[]) ?? [];
    const computed = b.day.date ? computedSchedule(b.day.date as string) : {};
    out.push({
      dayId: b.day.id,
      date: (b.day.date as string) ?? null,
      emails: TRAINING_EMAILS.map((def) => {
        const row = rows.find((r) => r.key === def.key) ?? { key: def.key };
        const decision = decideTrainingEmail(row, factsFor(def.key, b!), now);
        const sentTo = (row.recipients ?? []).map((r) => ({ email: r.email, name: r.name ?? r.email, sentAt: r.sentAt ?? null }));
        const already = new Set(sentTo.map((r) => r.email.toLowerCase()));
        return {
          key: def.key,
          label: def.label,
          audience: def.audience,
          audienceLabel: AUDIENCE_LABEL[def.audience],
          detail: def.detail,
          scheduledAt: row.scheduledAt ?? null,
          computedAt: computed[def.key] ?? null,
          overridden: Boolean(row.overridden),
          sentAt: row.sentAt ?? null,
          status: decision.reason,
          statusLabel: DUE_REASON_LABEL[decision.reason],
          sentTo,
          willGoTo: recipientsFor(def.key, b!)
            .filter((r) => !already.has(r.email.toLowerCase()))
            .map((r) => ({ email: r.email, name: r.name })),
        };
      }),
    });
  }
  return NextResponse.json({ admin: access.admin, days: out });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    dayId?: number | string;
    key?: string;
    action?: "set" | "send";
    at?: string | null;
    overridden?: boolean;
  } | null;
  if (!body?.dayId || !body.key || !TRAINING_EMAILS.some((e) => e.key === body.key)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const payload = await payloadClient();
  const day = (await payload
    .findByID({ collection: "training-days", id: body.dayId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: number | string; training?: unknown; emails?: DayEmailRow[]; date?: string } | null;
  if (!day) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await trainingAccess(payload, req.headers, idOf(day.training) as number | string);
  if (!access.ok) return NextResponse.json({ error: "forbidden" }, { status: access.status });
  if (!access.admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (body.action === "send") {
    const r = await sendDayEmail(payload, day.id, body.key, { force: true });
    if (r.reason !== "envoye") {
      return NextResponse.json({ error: r.reason === "echec" ? "L'envoi a échoué." : "Personne à qui envoyer ce message." }, { status: 422 });
    }
    return NextResponse.json({ ok: true, sentTo: r.sentTo });
  }

  // Régler la date : une date précise, « dès que possible » (maintenant),
  // « ne pas envoyer » (vide) ou « rétablir » (le calcul, overridden = false).
  // Journée datée avant l'arrivée des envois : on les date tous d'abord.
  const rows = (day.emails ?? []).length ? day.emails! : scheduleDayEmails(day.date ?? null, []);
  const computed = day.date ? computedSchedule(day.date) : {};
  const next = rows.map((r) =>
    r.key === body.key
      ? {
          ...r,
          scheduledAt: body.overridden === false ? (computed[r.key] ?? null) : (body.at ?? null),
          overridden: body.overridden !== false,
        }
      : r,
  );
  await payload.update({ collection: "training-days", id: day.id, data: { emails: next } as never, overrideAccess: true });
  return NextResponse.json({ ok: true });
}
