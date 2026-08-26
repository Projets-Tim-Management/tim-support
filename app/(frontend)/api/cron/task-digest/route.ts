import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import {
  buildTaskDigestEmail,
  groupTasksForDigest,
  type DigestTask,
} from "@/modules/partner/lib/task-digest";

/**
 * Récapitulatif matinal des rappels, un e-mail par partenaire.
 *
 * Chaque matin : les tâches ouvertes de SES opportunités, rangées en « en
 * retard », « aujourd'hui » et les jours de la semaine à venir. Le partenaire
 * commence sa journée en sachant ce qui l'attend, sans ouvrir le back-office.
 *
 * Complément du rappel à l'heure dite (task-reminders) : celui-ci réveille sur
 * UNE tâche au moment choisi, celui-là donne la vue d'ensemble — et rattrape les
 * tâches créées sans rappel, qui autrement n'alerteraient jamais personne.
 *
 * Un seul envoi par partenaire, et AUCUN quand il n'a rien : un message
 * quotidien qui dit « rien à signaler » apprend à ne plus l'ouvrir.
 *
 * Déclenché par Vercel Cron (voir vercel.json) : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Horizon du récapitulatif : aujourd'hui + 7 jours. */
const HORIZON_DAYS = 7;

/** Garde-fou : au-delà, c'est que quelque chose ne va pas dans les données. */
const MAX_TASKS = 2000;

type Task = DigestTask & {
  partner?: { id?: number | string; email?: string | null; displayName?: string | null; societe?: string | null; name?: string | null } | number | string | null;
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const payload = await payloadClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + (HORIZON_DAYS + 1) * 86_400_000).toISOString();

  // Les tâches ouvertes jusqu'à l'horizon — les retards inclus (pas de borne
  // basse : une tâche oubliée depuis trois semaines est justement celle qu'il
  // faut remonter).
  const res = await payload.find({
    collection: "client-activities",
    where: {
      and: [
        { type: { equals: "tache" } },
        { done: { not_equals: true } },
        { dueDate: { exists: true } },
        { dueDate: { less_than_equal: horizon } },
      ],
    },
    // depth 1 : le partenaire (son adresse) et l'opportunité (son nom).
    depth: 1,
    limit: MAX_TASKS,
    sort: "dueDate",
    overrideAccess: true,
  });

  // Un e-mail par partenaire : regrouper AVANT d'envoyer, sinon un partenaire
  // qui a huit tâches reçoit huit messages.
  const byPartner = new Map<string, { partner: Exclude<Task["partner"], null | undefined>; tasks: Task[] }>();
  const skipped: Record<string, number> = {};
  const note = (r: string) => {
    skipped[r] = (skipped[r] ?? 0) + 1;
  };

  for (const doc of res.docs as Task[]) {
    const p = doc.partner;
    const id = p && typeof p === "object" ? p.id : p;
    if (id == null) {
      note("sans_partenaire");
      continue;
    }
    const key = String(id);
    const bucket = byPartner.get(key) ?? { partner: p!, tasks: [] };
    bucket.tasks.push(doc);
    byPartner.set(key, bucket);
  }

  const sent: string[] = [];
  const failed: string[] = [];

  for (const [id, { partner, tasks }] of byPartner) {
    const p = typeof partner === "object" ? partner : null;
    if (!p?.email) {
      note("partenaire_sans_email");
      continue;
    }

    const groups = groupTasksForDigest(tasks, now, HORIZON_DAYS);
    if (groups.total === 0) {
      note("rien_a_signaler");
      continue;
    }

    const name = p.displayName || p.societe || p.name || null;
    const mail = buildTaskDigestEmail(name, groups);

    if (dry) {
      sent.push(`${id} → ${p.email} (${mail.subject})`);
      continue;
    }

    try {
      await payload.sendEmail({ to: p.email, ...mail });
      sent.push(`${id} → ${p.email}`);
    } catch (e) {
      failed.push(`${id} (${(e as Error).message})`);
      payload.logger.error(`[cron] récapitulatif du partenaire ${id} non parti : ${e}`);
    }
  }

  payload.logger.info(
    `[cron] rappels du matin : ${res.docs.length} tâche(s) ouverte(s), ${byPartner.size} partenaire(s), ` +
      `${sent.length} envoi(s)${dry ? " (à blanc)" : ""}${failed.length ? `, ${failed.length} échec(s)` : ""}.`,
  );

  return NextResponse.json({
    ok: true,
    dry,
    tasks: res.docs.length,
    partners: byPartner.size,
    sent,
    failed,
    skipped,
  });
}
