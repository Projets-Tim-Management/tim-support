import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { logActivity } from "@/modules/partner/lib/journal";
import { attemptLabel, nextAttemptDate, type Attempt } from "@/modules/partner/lib/task-attempts";

/**
 * « Pas de réponse » sur une tâche d'appel — un seul geste, trois effets :
 *
 *   1. l'essai est horodaté sur la tâche (`attempts`), avec son auteur ;
 *   2. la tâche est REPORTÉE au prochain jour ouvré, à la même heure — elle
 *      ne se coche pas, elle ne se recrée pas ;
 *   3. la fiche garde une ligne de journal : « Appel sans réponse — 17 sept.
 *      14:32 (2e essai), tâche reportée au jeu. 18 sept. 14:30 ».
 *
 * POST { taskId } → { ok, task }
 *
 * Admin, ou partenaire-métier sur SES tâches. L'écriture passe par la
 * collection avec l'utilisateur de la requête : ses règles d'accès font foi,
 * et l'agenda connecté suit le report comme n'importe quel changement de date.
 */
type Task = {
  id: number | string;
  type?: string | null;
  taskKind?: string | null;
  title?: string | null;
  done?: boolean | null;
  dueDate?: string | null;
  client?: number | string | { id?: number | string } | null;
  partner?: number | string | { id?: number | string } | null;
  attempts?: Attempt[] | null;
};

const idOf = (v: Task["client"]): number | string | null => (v && typeof v === "object" ? (v.id ?? null) : (v ?? null));

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { taskId?: number | string };
  if (body.taskId == null) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const task = (await payload
    .findByID({ collection: "client-activities", id: String(body.taskId), depth: 0, overrideAccess: true })
    .catch(() => null)) as Task | null;
  if (!task || task.type !== "tache") return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = hasAdminRole(user);
  const own = isPartnerMetier(user) && partnerIdOf(user) != null && String(partnerIdOf(user)) === String(idOf(task.partner));
  if (!admin && !own) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (task.done) return NextResponse.json({ error: "Cette tâche est déjà terminée." }, { status: 409 });

  const now = new Date();
  const attempts: Attempt[] = [...(task.attempts ?? []).map((a) => ({ at: a.at, by: idOf(a.by as never) })), { at: now.toISOString(), by: user.id }];
  const dueDate = nextAttemptDate(task.dueDate, now.getTime());

  let updated: Task;
  try {
    updated = (await payload.update({
      collection: "client-activities",
      id: task.id,
      data: { attempts: attempts as never, dueDate },
      user,
      overrideAccess: false,
      depth: 0,
    })) as Task;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const n = attempts.length;
  const clientId = idOf(task.client);
  if (clientId != null) {
    await logActivity(payload, {
      client: clientId,
      title: `Appel sans réponse — ${attemptLabel(now.toISOString())} (${n === 1 ? "1er" : `${n}e`} essai)`,
      content: `Tâche « ${task.title?.trim() || "Appel"} » reportée au ${new Date(dueDate).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`,
    }).catch((e) => payload.logger.error(`[tâches] journal de l'essai non écrit (${task.id}) : ${e}`));
  }

  // Seulement les dates : l'auteur de chaque essai n'a rien à faire dans le navigateur.
  return NextResponse.json({ ok: true, task: { id: updated.id, dueDate: updated.dueDate, attempts: (updated.attempts ?? attempts).map((a) => ({ at: a.at })) } });
}
