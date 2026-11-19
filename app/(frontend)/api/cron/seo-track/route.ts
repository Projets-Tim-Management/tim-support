import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";

/**
 * Chaque heure (19/11/2026) : le suivi des requêtes (Éditorial › Requêtes suivies).
 *  - 10 requêtes suivies relevées au plus (top 20 de google.fr, réponse IA) : chacune une fois
 *    par semaine ;
 *  - 2 pages clés au plus : leur couverture face au top 10 ;
 *  - le lundi, l'analyse du mois si elle a plus de 25 jours (concurrents, opportunités, volumes).
 * Rien si DataForSEO n'est pas branché. Budget « seo ».
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  const { isDataForSeoConfigured } = await import("@/modules/editorial/lib/competitors/dataforseo");
  if (!isDataForSeoConfigured()) return NextResponse.json({ skipped: "DataForSEO n'est pas branché." });
  const { keyPagesDue, runMonthlyLabs, trackDue } = await import("@/modules/editorial/lib/seo/tracking");
  const now = new Date();
  const monthly = now.getUTCDay() === 1 ? await runMonthlyLabs(payload, { now }).catch((e) => ({ error: String(e) })) : null;
  const track = await trackDue(payload, { now }).catch((e) => ({ tracked: 0, errors: [String(e)] }));
  const pages = await keyPagesDue(payload, { now }).catch((e) => ({ analyzed: 0, errors: [String(e)] }));
  const errors = [...track.errors, ...pages.errors];
  if (errors.length) payload.logger.warn(`[suivi SEO] ${errors.slice(0, 3).join(" ; ")}`);
  return NextResponse.json({ monthly, track, pages });
}
