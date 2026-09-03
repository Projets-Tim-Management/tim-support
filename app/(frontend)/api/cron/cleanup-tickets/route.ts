import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { relId } from "@/core/lib/relations";
import {
  TICKET_RETENTION_DAYS,
  ticketMediaIds,
  type PurgeableTicket,
} from "@/modules/support/lib/retention";

/**
 * Purge planifiée : supprime les fichiers (Vercel Blob) des tickets RÉSOLUS
 * depuis plus de 30 jours, pour libérer de l'espace au fil de l'eau. Le ticket
 * et sa conversation sont conservés — seuls les fichiers sont supprimés
 * (références vidées).
 *
 * Trois sources, et la règle qui les énumère vit dans `retention.ts` : les
 * pièces jointes de la demande, celles du fil, et les documents internes
 * déposés par le support. Un onglet ajouté sans y penser laisserait grossir
 * indéfiniment ce que ce cron est censé contenir.
 *
 * Déclenchée quotidiennement par Vercel Cron (voir vercel.json). Vercel ajoute
 * automatiquement l'en-tête « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 50; // nb de tickets purgés par exécution (les suivants au prochain run)

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await payloadClient();
  const cutoff = new Date(Date.now() - TICKET_RETENTION_DAYS * 86_400_000).toISOString();

  const res = await payload.find({
    collection: "tickets",
    where: {
      and: [{ status: { equals: "resolved" } }, { resolvedAt: { less_than_equal: cutoff } }],
    },
    depth: 0,
    limit: BATCH,
    sort: "resolvedAt",
  });

  let ticketsPurged = 0;
  let filesDeleted = 0;

  for (const doc of res.docs) {
    const ticket = doc as PurgeableTicket & {
      id: number;
      messages?: Array<{ attachments?: unknown[] } & Record<string, unknown>>;
    };

    const mediaIds = ticketMediaIds(ticket, relId);
    if (mediaIds.length === 0) continue; // rien à purger sur ce ticket

    // Suppressions en parallèle (I/O Blob + DB indépendantes).
    const deleted = await Promise.all(
      mediaIds.map((id) =>
        payload
          // Supprime le média → l'adaptateur Vercel Blob supprime le fichier.
          .delete({ collection: "media", id })
          .then(() => 1)
          .catch((e) => {
            console.warn("[cleanup-tickets] média non supprimé", id, e);
            return 0;
          }),
      ),
    );
    filesDeleted += deleted.reduce((a, b) => a + b, 0);

    // Vide les références (évite les liens cassés). Les documents internes
    // partent en entier : leur fichier est obligatoire, une ligne sans pièce ne
    // se réenregistrerait pas.
    const cleanedMessages = (ticket.messages ?? []).map((m) => ({ ...m, attachments: [] }));
    await payload
      .update({
        collection: "tickets",
        id: ticket.id,
        data: { attachments: [], messages: cleanedMessages, documents: [] },
      })
      .catch((e) => console.warn("[cleanup-tickets] MAJ ticket échouée", ticket.id, e));

    ticketsPurged++;
  }

  return NextResponse.json({ ok: true, ticketsPurged, filesDeleted, batch: BATCH });
}
