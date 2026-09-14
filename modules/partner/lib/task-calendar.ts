import { randomUUID } from "node:crypto";
import type { Payload } from "payload";

import { adminUrl } from "@/core/lib/email-template";
import { accessTokenFor, getProvider, targetConnection } from "@/modules/marketing/lib/calendar";
import { taskKindLabel } from "@/modules/partner/lib/activity";

/**
 * L'événement d'agenda d'une TÂCHE, tenu à jour.
 *
 * Une tâche avec « Ajouter à l'agenda » a un événement dans l'agenda que le
 * partenaire a désigné (le même que celui qui reçoit les sessions de prise en
 * main). Même mécanique que `session-calendar` — un seul endroit décide de
 * créer, déplacer ou retirer —, en plus simple : pas d'invité, pas de visio,
 * quelques minutes au moment de l'échéance (durée au choix, 5 min par défaut).
 *
 *   pas d'événement + demandé      → création
 *   événement + échéance déplacée  → déplacement
 *   événement + plus demandé       → suppression (ou tâche supprimée)
 *
 * Jamais bloquant : si l'agenda refuse, la tâche reste enregistrée et son
 * rappel par e-mail part quand même. Le partenaire a toujours SA tâche, il n'a
 * simplement pas son double dans l'agenda — et le journal dit pourquoi.
 */

/**
 * Durées proposées pour l'événement : un rappel court par défaut — il ne doit
 * pas bloquer l'agenda —, jusqu'à une heure quand la tâche EST un rendez-vous.
 */
export const TASK_EVENT_DURATIONS = [5, 10, 15, 20, 30, 45, 60] as const;
export const DEFAULT_TASK_EVENT_MINUTES = 5;

/** Durée retenue : celle de la tâche si elle est dans la liste, sinon le défaut. */
export const eventMinutes = (t: { calendarMinutes?: number | null }): number =>
  (TASK_EVENT_DURATIONS as readonly number[]).includes(t.calendarMinutes ?? -1)
    ? (t.calendarMinutes as number)
    : DEFAULT_TASK_EVENT_MINUTES;

export type TaskSyncResult = {
  eventId?: string | null;
  link?: string | null;
  action: "created" | "updated" | "deleted" | "none";
};

const NOTHING: TaskSyncResult = { action: "none" };

export type TaskLike = {
  id: number | string;
  type?: string | null;
  partner?: unknown;
  client?: unknown;
  title?: string | null;
  content?: string | null;
  taskKind?: string | null;
  dueDate?: string | null;
  calendarSync?: boolean | null;
  calendarMinutes?: number | null;
  calendarEventId?: string | null;
};

const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

/** Ce que l'agenda doit montrer : une tâche à faire, sur telle échéance. */
export const wantsEvent = (t: TaskLike): boolean =>
  t.type === "tache" && Boolean(t.calendarSync) && Boolean(t.dueDate);

/** Titre de l'événement : la tâche, puis pour qui. Texte brut, l'agenda n'interprète rien. */
export const eventSummary = (t: TaskLike, company?: string | null): string => {
  const what = t.title?.trim() || taskKindLabel(t.taskKind) || "Tâche";
  return company ? `${what} — ${company}` : what;
};

/**
 * Faut-il resynchroniser après cette modification ? Ce qui change l'événement :
 * la demande, l'échéance, et tout ce qui entre dans son titre ou sa
 * description — titre, nature (le titre en découle quand il est vide), notes.
 * Le reste (priorité, rappel) non.
 */
export const eventNeedsSync = (before: TaskLike | null | undefined, after: TaskLike): boolean => {
  const b = before ?? ({} as TaskLike);
  if (wantsEvent(b) !== wantsEvent(after)) return true;
  if (!wantsEvent(after)) return false;
  if (!after.calendarEventId) return true; // demandé mais jamais créé : rattrapage
  const diff = (k: "dueDate" | "title" | "taskKind" | "content") => (b[k] ?? null) !== (after[k] ?? null);
  return diff("dueDate") || diff("title") || diff("taskKind") || diff("content") || eventMinutes(b) !== eventMinutes(after);
};

/** Ce qu'il faut écrire sur la tâche après une synchronisation. */
export const taskSyncPatch = (result: TaskSyncResult): Record<string, unknown> => ({
  ...(result.eventId !== undefined ? { calendarEventId: result.eventId } : {}),
  ...(result.link !== undefined ? { calendarLink: result.link } : {}),
});

async function companyName(payload: Payload, clientId: number | string): Promise<string | null> {
  const client = await payload
    .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })
    .catch(() => null);
  return ((client as { companyName?: string } | null)?.companyName ?? null) || null;
}

export async function syncTaskEvent(payload: Payload, task: TaskLike): Promise<TaskSyncResult> {
  const partnerId = idOf(task.partner);
  const eventId = task.calendarEventId ?? null;
  const wanted = wantsEvent(task);

  if (!wanted && !eventId) return NOTHING;
  if (!partnerId) return NOTHING;

  const target = await targetConnection(payload, partnerId);
  if (!target) {
    if (wanted) {
      payload.logger.warn(
        `[agenda] tâche ${task.id} : demandée à l'agenda, mais aucun agenda connecté ou désigné ` +
          `pour le partenaire ${partnerId}.`,
      );
    }
    return NOTHING;
  }
  const provider = getProvider(target.connection.provider);
  const token = provider ? await accessTokenFor(payload, target.connection) : null;
  if (!provider || !token) {
    payload.logger.warn(
      `[agenda] tâche ${task.id} : connexion ${target.connection.id} inutilisable, jeton non ` +
        `renouvelable. Le partenaire doit reconnecter son agenda.`,
    );
    return NOTHING;
  }

  // ── Retrait ───────────────────────────────────────────────────────────────
  if (!wanted) {
    try {
      await provider.deleteEvent(token, target.calendarId, eventId as string);
      payload.logger.info(`[agenda] événement de la tâche ${task.id} supprimé.`);
    } catch (err) {
      payload.logger.error(`[agenda] suppression de l'événement de la tâche ${task.id} échouée : ${err}`);
      // On oublie quand même l'identifiant : un événement qu'on ne peut plus
      // toucher n'a pas à retenir la tâche.
    }
    return { eventId: null, link: null, action: "deleted" };
  }

  // ── Création / déplacement ────────────────────────────────────────────────
  const clientId = idOf(task.client);
  const company = clientId != null ? await companyName(payload, clientId) : null;
  const at = task.dueDate as string;
  const input = {
    calendarId: target.calendarId,
    summary: eventSummary(task, company),
    description: [
      task.content?.trim() || null,
      clientId != null ? `Fiche : ${adminUrl(`/collections/partner-clients/${clientId}`)}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    start: at,
    end: new Date(Date.parse(at) + eventMinutes(task) * 60_000).toISOString(),
    // L'agenda est celui du partenaire : personne à inviter.
    attendees: [] as string[],
    online: false,
    requestId: `task-${task.id}-${randomUUID()}`,
    runKey: `task-${task.id}`,
  };

  // Créé sans avoir été enregistré (processus interrompu entre les deux) : on
  // adopte l'événement plutôt que d'en créer un jumeau. Voir session-calendar.
  let known = eventId;
  if (!known && provider.findEvent) {
    const orphan = await provider.findEvent(token, target.calendarId, input.runKey).catch(() => null);
    if (orphan) known = orphan.eventId;
  }

  try {
    const result = known
      ? await provider.updateEvent(token, known, input)
      : await provider.createEvent(token, input);
    payload.logger.info(`[agenda] événement de la tâche ${task.id} ${known ? "déplacé" : "créé"}.`);
    return { eventId: result.eventId, link: result.htmlLink ?? null, action: known ? "updated" : "created" };
  } catch (err) {
    payload.logger.error(`[agenda] événement de la tâche ${task.id} : ${err}`);
    // Effacé à la main dans l'agenda : on en refait un, sans attendre.
    if (known && /\(40[34]\)|\(410\)/.test(String(err))) {
      try {
        const fresh = await provider.createEvent(token, input);
        return { eventId: fresh.eventId, link: fresh.htmlLink ?? null, action: "created" };
      } catch (again) {
        payload.logger.error(`[agenda] recréation de l'événement de la tâche ${task.id} échouée : ${again}`);
      }
    }
    return NOTHING;
  }
}
