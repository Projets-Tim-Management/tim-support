import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { syncBrevoLeads } from "@/modules/partner/lib/brevo-import";

/**
 * Entrée quotidienne des leads du site vitrine.
 *
 * Les formulaires du site créent une opportunité dans le CRM Brevo ; ce cron la
 * fait entrer dans les Opportunités TIM, dans la colonne de son étape. Sans lui,
 * les leads vivent dans un outil que le Kanban ignore.
 *
 * Déclenché par Vercel Cron (voir vercel.json), qui ajoute
 * « Authorization: Bearer <CRON_SECRET> ».
 *
 * Paramètres :
 *  - `dry=1`   : liste ce qui serait créé, sans rien écrire ;
 *  - `since=`  : date ISO de début (défaut : 7 jours) ;
 *  - `all=1`   : tout l'historique — la REPRISE INITIALE, à ne lancer qu'une fois.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fenêtre par défaut : 7 jours, pour un cron quotidien.
 *
 * Large exprès. Le recouvrement ne coûte rien (`brevoDealId` écarte ce qui est
 * déjà importé) et rattrape une exécution manquée — un lead perdu, lui, ne se
 * rattrape pas.
 */
const WINDOW_DAYS = 7;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const dry = params.get("dry") === "1";
  const all = params.get("all") === "1";
  const since = all
    ? undefined
    : (params.get("since") ??
      new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString());

  const payload = await payloadClient();
  const summary = await syncBrevoLeads(payload, { since, dry, max: all ? 5000 : 500 });

  payload.logger.info(
    `[cron] leads Brevo : ${summary.deals} opportunité(s) examinée(s), ${summary.created.length} créée(s), ` +
      `${summary.linked.length} rattachée(s)${dry ? " (à blanc)" : ""}` +
      `${summary.failed.length ? `, ${summary.failed.length} échec(s)` : ""}` +
      `${summary.reason ? ` — ${summary.reason}` : ""}.`,
  );

  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
