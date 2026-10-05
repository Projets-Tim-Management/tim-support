import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type PayloadRequest } from "payload";

import { sessionSummary } from "@/modules/marketing/lib/journey";

/**
 * Les rendez-vous de la phase de test, dans l'historique de l'opportunité.
 *
 * Quand le client réserve sa prise en main (ou son bilan) — depuis son espace,
 * ou quand on saisit le créneau à la main —, une TÂCHE « Réunion » apparaît
 * dans l'historique, à la date et à l'heure du rendez-vous. Jusque-là, il
 * fallait ouvrir la phase de test pour apprendre qu'un rendez-vous existait, et
 * l'historique — là où l'on suit ses tâches — n'en disait rien.
 *
 * La tâche et l'étape du parcours sont UN SEUL fait vu de deux endroits :
 * cocher la tâche valide l'étape « … réalisée », valider l'étape coche la
 * tâche. La coche se rattache à la TENUE du rendez-vous, pas à sa réservation :
 * celle-ci est déjà constatée au moment où la tâche apparaît, il n'y aurait rien
 * à cocher.
 *
 * Les règles de l'étape s'appliquent à la tâche : une session ne se coche pas
 * avant son jour (voir guardDatedSteps) — l'erreur remonte telle quelle.
 *
 * Pas d'événement d'agenda pour la tâche : le rendez-vous a déjà le sien,
 * créé par la phase de test, avec ses invités et son lien de visio.
 */

type RunLike = {
  id: number | string;
  client?: number | string | { id: number | string } | null;
  sessionAt?: string | null;
  reviewAt?: string | null;
  sessionMode?: string | null;
  sessionLocation?: string | null;
  sessionLink?: string | null;
  reviewLink?: string | null;
  steps?: { key?: string | null; state?: string | null; doneAt?: string | null; doneBy?: unknown }[] | null;
};

type TaskDoc = {
  id: number | string;
  done?: boolean | null;
  dueDate?: string | null;
  content?: string | null;
  journeyRun?: number | string | { id: number | string } | null;
  journeyStep?: string | null;
};

/** Le rendez-vous de chaque étape : où lire sa date, comment le nommer. */
export const JOURNEY_MEETINGS = [
  {
    step: "prise-en-main",
    title: "Session de prise en main",
    at: (r: RunLike) => r.sessionAt ?? null,
    where: (r: RunLike) => sessionSummary(r),
  },
  {
    step: "bilan",
    title: "Bilan de fin de test",
    at: (r: RunLike) => r.reviewAt ?? null,
    // Même lieu que la session, son propre lien de visio.
    where: (r: RunLike) => sessionSummary({ ...r, sessionLink: r.reviewLink ?? null }),
  },
] as const;

/** Écriture faite par cette synchronisation : l'autre côté ne doit pas la renvoyer. */
export const JOURNEY_TASK_SYNC = "journeyTaskSync";

const refId = (v: unknown): number | string | null =>
  v && typeof v === "object" ? ((v as { id?: number | string }).id ?? null) : ((v as number | string | null) ?? null);

const sameInstant = (a?: string | null, b?: string | null) =>
  (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null);

/** Ce que la tâche doit être, d'après le parcours — ou null s'il n'y a pas de rendez-vous. */
export function meetingTask(run: RunLike, m: (typeof JOURNEY_MEETINGS)[number]) {
  const at = m.at(run);
  if (!at) return null;
  const step = (run.steps ?? []).find((s) => s.key === m.step);
  return {
    dueDate: at,
    content: `Rendez-vous ${m.where(run)}. Cocher la tâche valide l'étape de la phase de test.`,
    done: step?.state === "fait",
  };
}

const withFlag = async <T>(req: PayloadRequest, fn: () => Promise<T>): Promise<T> => {
  const ctx = (req.context ??= {}) as Record<string, unknown>;
  ctx[JOURNEY_TASK_SYNC] = true;
  try {
    return await fn();
  } finally {
    delete ctx[JOURNEY_TASK_SYNC];
  }
};

/**
 * Phase de test → historique : crée, déplace, coche ou retire la tâche.
 *
 * Passe à chaque enregistrement d'un parcours qui a (ou avait) un rendez-vous,
 * et non seulement quand la date change : un rendez-vous réservé avant cette
 * synchronisation gagne ainsi sa tâche au prochain enregistrement de la phase.
 * Ne retire qu'une tâche encore À FAIRE : une réunion tenue reste dans
 * l'historique, même si on vide ensuite le créneau.
 */
export const syncJourneyTasks: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const ctx = (req.context ?? {}) as Record<string, unknown>;
  if (ctx[JOURNEY_TASK_SYNC]) return doc;
  const run = doc as RunLike;
  const clientId = refId(run.client);
  if (clientId == null) return doc;

  for (const m of JOURNEY_MEETINGS) {
    if (!m.at(run) && !m.at((previousDoc ?? {}) as RunLike)) continue;
    try {
      const want = meetingTask(run, m);
      const found = await req.payload.find({
        collection: "client-activities",
        where: { and: [{ journeyRun: { equals: run.id } }, { journeyStep: { equals: m.step } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      });
      const task = found.docs[0] as TaskDoc | undefined;

      await withFlag(req, async () => {
        if (want && !task) {
          await req.payload.create({
            collection: "client-activities",
            data: {
              client: clientId,
              type: "tache",
              taskKind: "reunion",
              title: m.title,
              ...want,
              journeyRun: run.id,
              journeyStep: m.step,
            } as never,
            overrideAccess: true,
            req,
          });
        } else if (want && task) {
          if (sameInstant(task.dueDate, want.dueDate) && Boolean(task.done) === want.done && task.content === want.content) return;
          await req.payload.update({
            collection: "client-activities",
            id: task.id,
            data: want as never,
            overrideAccess: true,
            req,
          });
        } else if (!want && task && !task.done) {
          await req.payload.delete({ collection: "client-activities", id: task.id, overrideAccess: true, req });
        }
      });
    } catch (err) {
      // Jamais bloquant : le rendez-vous est enregistré, la tâche n'en est que le reflet.
      req.payload.logger.error(`[parcours] tâche « ${m.title} » du parcours ${run.id} : ${err}`);
    }
  }
  return doc;
};

/**
 * Historique → phase de test : cocher (ou décocher) la tâche valide l'étape.
 *
 * AVANT l'enregistrement de la tâche, et avec la requête de la personne : les
 * règles de l'étape (pas avant le jour du rendez-vous, étapes réservées à TIM)
 * s'appliquent à elle, et leur refus empêche la coche — la tâche ne peut pas
 * dire « fait » quand le parcours dit « pas encore ».
 */
export const syncStepFromTask: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation !== "update") return data;
  const ctx = (req.context ?? {}) as Record<string, unknown>;
  if (ctx[JOURNEY_TASK_SYNC]) return data;

  const runId = refId(originalDoc?.journeyRun);
  const stepKey = originalDoc?.journeyStep as string | undefined;
  if (runId == null || !stepKey || data?.done === undefined) return data;
  const done = Boolean(data.done);
  if (done === Boolean(originalDoc?.done)) return data;

  const run = (await req.payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true, req })
    .catch(() => null)) as RunLike | null;
  // Parcours supprimé : la tâche redevient une tâche ordinaire.
  if (!run?.steps?.some((s) => s.key === stepKey)) return data;

  const steps = run.steps.map((s) => {
    if (s.key !== stepKey) return s;
    if (done === (s.state === "fait")) return s;
    return done
      ? { ...s, state: "fait", doneAt: new Date().toISOString(), doneBy: req.user?.id ?? null }
      : { ...s, state: "a-faire", doneAt: null, doneBy: null };
  });

  try {
    await withFlag(req, () =>
      req.payload.update({
        collection: "journey-runs",
        id: runId,
        data: { steps } as never,
        // Les règles de l'étape s'appliquent à la personne qui coche la tâche.
        user: req.user,
        overrideAccess: false,
        req,
      }),
    );
  } catch (err) {
    // Le refus de l'étape (« se fait le 19 octobre, pas avant ») est la
    // réponse à donner : rendu PUBLIC, sinon l'API le masquerait derrière un
    // « Something went wrong ».
    throw new APIError((err as Error)?.message || "L'étape du parcours n'a pas pu être mise à jour.", 400, undefined, true);
  }
  return data;
};
