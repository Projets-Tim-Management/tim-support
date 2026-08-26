import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { buildTaskReminderEmail } from "@/modules/partner/lib/task-reminder";

/**
 * Rappels des tâches de l'historique client.
 *
 * Toutes les heures : les tâches dont l'heure de rappel est passée, pas encore
 * rappelées ni terminées, déclenchent un e-mail à leur auteur. Un rappel qui
 * arrive après coup ne sert à rien, d'où la fréquence horaire — l'utilisateur
 * choisit son heure au moment où il crée la tâche.
 *
 * `reminderSentAt` est posé APRÈS l'envoi : c'est ce qui empêche le même rappel
 * de repartir à chaque passage. Une tâche terminée entre-temps n'est plus
 * rappelée, même si son heure est passée.
 *
 * Déclenché par Vercel Cron (voir vercel.json) : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 100;

type Task = {
  id: number | string;
  title?: string | null;
  content?: string | null;
  dueDate?: string | null;
  highPriority?: boolean;
  client?: { id?: number | string; companyName?: string } | number | string | null;
  author?: { email?: string; name?: string } | number | string | null;
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const payload = await payloadClient();
  const now = new Date().toISOString();

  const due = await payload.find({
    collection: "client-activities",
    where: {
      and: [
        { type: { equals: "tache" } },
        { done: { not_equals: true } },
        { reminderAt: { less_than_equal: now } },
        { reminderSentAt: { exists: false } },
      ],
    },
    // depth 1 : l'auteur (son adresse) et l'opportunité (son nom) tiennent dans
    // le même aller-retour.
    depth: 1,
    limit: BATCH,
    sort: "reminderAt",
    overrideAccess: true,
  });

  const sent: string[] = [];
  const skipped: Record<string, number> = {};
  const note = (r: string) => {
    skipped[r] = (skipped[r] ?? 0) + 1;
  };

  for (const doc of due.docs as Task[]) {
    const author = typeof doc.author === "object" ? doc.author : null;
    if (!author?.email) {
      // Sans auteur joignable, le rappel n'a personne à réveiller. On le marque
      // quand même comme traité : le relire chaque heure ne le fera pas exister.
      note("sans_auteur");
      if (!dry) {
        await payload.update({
          collection: "client-activities",
          id: doc.id,
          data: { reminderSentAt: now },
          overrideAccess: true,
        });
      }
      continue;
    }

    if (dry) {
      sent.push(`${doc.id} → ${author.email}`);
      continue;
    }

    try {
      await payload.sendEmail({ to: author.email, ...buildTaskReminderEmail(doc) });
      await payload.update({
        collection: "client-activities",
        id: doc.id,
        data: { reminderSentAt: new Date().toISOString() },
        overrideAccess: true,
      });
      sent.push(`${doc.id} → ${author.email}`);
    } catch (e) {
      // Pas de `reminderSentAt` en cas d'échec : le prochain passage réessaiera.
      note("envoi_echoue");
      payload.logger.error(`[cron] rappel de tâche ${doc.id} non parti : ${e}`);
    }
  }

  payload.logger.info(
    `[cron] rappels de tâches : ${due.docs.length} due(s), ${sent.length} envoyé(s)${dry ? " (à blanc)" : ""}.`,
  );
  return NextResponse.json({ ok: true, dry, due: due.docs.length, sent, skipped });
}
