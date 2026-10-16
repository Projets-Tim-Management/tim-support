import { NextResponse } from "next/server";

/**
 * La porte des routes /api/cron/* : Vercel Cron envoie
 * « Authorization: Bearer <CRON_SECRET> ». Sans secret configuré, tout est
 * refusé (une route de cron ouverte à tous enverrait des e-mails ou des
 * dépenses à la demande de n'importe qui).
 *
 * Renvoie la réponse 401 à rendre telle quelle, ou null si l'appel est permis.
 */
export function cronGuard(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
