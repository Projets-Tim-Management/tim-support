import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { TRAINING_EMAILS } from "@/modules/training/lib/email-schedule";
import { loadDay, sendDayEmail, type SendResult } from "@/modules/training/lib/send";

/**
 * Envois de la formation — passage horaire (vercel.json), comme ceux de la
 * phase de test : chaque heure, les messages dus partent, à l'heure de Paris
 * prévue ou dès le passage suivant.
 *
 * Ne regarde que les journées des formations OUVERTES, de J−8 (convocation la
 * plus en amont + marge) à J+3 (après-formation + rattrapage).
 *
 * `?dry=1` : liste ce qui partirait, sans rien envoyer.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const payload = await payloadClient();
  const now = Date.now();

  const open = await payload.find({
    collection: "trainings",
    where: { status: { equals: "ouvert" } },
    depth: 0,
    limit: 500,
    pagination: false,
    overrideAccess: true,
  });
  if (!open.docs.length) return NextResponse.json({ ok: true, days: 0, results: [] });

  const days = await payload.find({
    collection: "training-days",
    where: {
      and: [
        { training: { in: open.docs.map((t) => t.id) } },
        { date: { greater_than_equal: new Date(now - 3 * 86_400_000).toISOString() } },
        { date: { less_than_equal: new Date(now + 9 * 86_400_000).toISOString() } },
      ],
    },
    depth: 0,
    limit: 500,
    pagination: false,
    overrideAccess: true,
  });

  const results: (SendResult & { dayId: number | string })[] = [];
  for (const day of days.docs) {
    // Chargée une fois pour ses cinq envois ; rechargée après un envoi (la
    // trace a changé, et un envoi suivant de la journée en dépend).
    let bundle = await loadDay(payload, day.id);
    if (!bundle) continue;
    for (const def of TRAINING_EMAILS) {
      try {
        const r = await sendDayEmail(payload, day.id, def.key, { dry, nowMs: now, bundle });
        if (r.reason === "envoye") bundle = (await loadDay(payload, day.id)) ?? bundle;
        if (r.reason === "envoye" || r.reason === "envoyer" || r.reason === "echec") results.push({ ...r, dayId: day.id });
      } catch (err) {
        payload.logger.error(`[formation] passage des envois, journée ${day.id}, « ${def.key} » : ${err}`);
      }
    }
  }
  return NextResponse.json({ ok: true, dry, days: days.docs.length, results });
}
