import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { sendDueSequenceMessages } from "@/modules/marketing/lib/sequence-send";

/**
 * Envoi quotidien des messages de séquence arrivés à échéance.
 *
 * Quotidien et non horaire : ces messages sont espacés de deux mois, une heure
 * de décalage n'a aucune importance — et un passage par jour limite les dégâts
 * si quelque chose tourne mal.
 *
 * Déclenché par Vercel Cron, qui ajoute « Authorization: Bearer <CRON_SECRET> ».
 * `dry=1` liste ce qui partirait, sans rien envoyer.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const payload = await payloadClient();
  const summary = await sendDueSequenceMessages(payload, { dry });

  payload.logger.info(
    `[séquence] ${summary.runs} séquence(s) examinée(s), ${summary.sent.length} message(s) envoyé(s)` +
      `${dry ? " (à blanc)" : ""}` +
      `${summary.unsubscribed.length ? `, ${summary.unsubscribed.length} arrêtée(s) pour désinscription` : ""}` +
      `${summary.failed.length ? `, ${summary.failed.length} échec(s)` : ""}.`,
  );

  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
