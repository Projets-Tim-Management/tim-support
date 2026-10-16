import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { syncSuppressionsFromBrevo } from "@/modules/marketing/lib/suppression-sync";

/**
 * Reprise quotidienne des désinscriptions constatées par Brevo.
 *
 * Une personne peut demander qu'on cesse de lui écrire sans jamais passer par
 * notre lien : le bouton natif du client de messagerie, une plainte pour spam,
 * ou simplement une adresse qui n'existe plus. Sans ce passage, la liste ne
 * refléterait que nos propres clics, et on continuerait d'écrire à des gens qui
 * ont refusé — le plus sûr moyen de perdre la délivrabilité de TOUT le reste,
 * e-mails de tickets compris.
 *
 * Déclenché par Vercel Cron (voir vercel.json), qui ajoute
 * « Authorization: Bearer <CRON_SECRET> ».
 *
 * Paramètre `days` : fenêtre examinée (défaut 7, plafond 90 côté Brevo). Large
 * exprès — le recouvrement ne coûte rien, `suppress` étant idempotent, et il
 * rattrape une exécution manquée. Une désinscription ratée, elle, ne se rattrape
 * pas : on écrit à quelqu'un qui avait dit non.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;

  const days = Number(new URL(req.url).searchParams.get("days")) || 7;
  const payload = await payloadClient();
  const summary = await syncSuppressionsFromBrevo(payload, { days });

  payload.logger.info(
    `[désinscription] ${summary.events} événement(s) examiné(s), ${summary.added} adresse(s) ajoutée(s)` +
      `${summary.reason ? ` — ${summary.reason}` : ""}.`,
  );

  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
