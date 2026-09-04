import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { recordSync, syncMailbox } from "@/modules/partner/lib/mailbox/sync";

/**
 * Lecture périodique des boîtes connectées.
 *
 * Toutes les heures et non chaque jour : ce qu'on veut, c'est qu'une commerciale
 * qui ouvre une fiche à 15 h y voie l'échange de 14 h. Un passage est court —
 * quelques dizaines de messages nouveaux — sauf tant que la reprise du passé
 * n'est pas terminée, et c'est justement pour ça qu'elle avance par tranches.
 *
 * Les boîtes sont traitées L'UNE APRÈS L'AUTRE : Gmail compte son quota par
 * utilisateur, mais le délai d'une fonction, lui, est global. Deux boîtes en
 * parallèle doubleraient le risque de finir à mi-chemin sans rien enregistrer.
 *
 * Déclenché par Vercel Cron, qui ajoute « Authorization: Bearer <CRON_SECRET> ».
 * `dry=1` dit ce qui serait rattaché, sans rien écrire.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const payload = await payloadClient();

  const conns = await payload.find({
    collection: "mailbox-connections",
    where: { status: { not_equals: "suspendue" } },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  });

  const results = [];
  for (const doc of conns.docs) {
    const summary = await syncMailbox(payload, doc as never, { dry });
    if (!dry) await recordSync(payload, doc as never, summary);

    results.push(summary);
    payload.logger.info(
      `[boîte mail] ${summary.mailbox} : ${summary.scanned} examiné(s), ${summary.matched} rattachable(s), ` +
        `${summary.written} écrit(s), ${summary.known} déjà connu(s)` +
        `${summary.backfillDone ? ", historique complet" : ""}` +
        `${summary.error ? ` — ⚠️ ${summary.error}` : ""}.`,
    );
  }

  // Un échec doit SE VOIR dans le tableau des tâches planifiées : une boîte qui
  // cesse de remonter des échanges ne se remarque pas autrement.
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, dry, mailboxes: results }, { status: ok ? 200 : 503 });
}
