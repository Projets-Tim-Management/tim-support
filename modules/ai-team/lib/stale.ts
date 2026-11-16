import type { Payload } from "payload";

/**
 * LES TRAVAUX COUPÉS (14/11/2026). Le réveil de chaque minute a 5 minutes au
 * plus ; si Vercel le coupe au milieu d'un rapport, la ligne réservée « en
 * cours » ne se ferme jamais, et le rapport de la période serait perdu.
 *
 * Règle commune : une réservation « en cours » depuis plus de 15 minutes est
 * close « interrompue », et le travail se relance au réveil suivant — deux fois
 * au plus par période, pour ne jamais payer en boucle un travail qui échoue.
 */
export const STALE_MS = 15 * 60_000;
export const INTERRUPTED = "Interrompu (temps dépassé) : relancé automatiquement.";
export const MAX_INTERRUPTIONS = 2;

/** Avant cette date, une réservation « en cours » est coupée. */
export const staleBefore = (now: Date) => new Date(now.getTime() - STALE_MS).toISOString();

/**
 * Ce qui compte comme « déjà fait » pour une période : tout, sauf les travaux interrompus — tant qu'ils restent
 * sous la limite de relances. Pure (testée).
 */
export function isPeriodDone(rows: { status?: unknown; error?: unknown }[]): boolean {
  const interrupted = rows.filter((r) => r.status === "echec" && r.error === INTERRUPTED).length;
  if (interrupted >= MAX_INTERRUPTIONS) return true;
  return rows.some((r) => !(r.status === "echec" && r.error === INTERRUPTED));
}

/**
 * Les réservations coupées d'un chef (« je prépare… » depuis plus de 15 minutes) : leur texte devient `mark`, qui ne
 * compte plus comme une revue faite. Rend le nombre de revues interrompues depuis `since`.
 */
export async function reopenStale(payload: Payload, memberId: number | string, placeholder: string, mark: string, now: Date, since: string): Promise<number> {
  try {
    return await reopen(payload, memberId, placeholder, mark, now, since);
  } catch {
    return 0;
  }
}

async function reopen(payload: Payload, memberId: number | string, placeholder: string, mark: string, now: Date, since: string): Promise<number> {
  const stale = await payload
    .find({ collection: "ai-team-messages", where: { and: [{ member: { equals: memberId } }, { from: { equals: "agent" } }, { text: { like: placeholder } }, { createdAt: { less_than: staleBefore(now) } }] }, limit: 5, depth: 0, overrideAccess: true })
    .catch(() => ({ docs: [] as { id: number | string }[] }));
  await Promise.all((stale.docs as { id: number | string }[]).map((d) => payload.update({ collection: "ai-team-messages", id: d.id, data: { text: mark } as never, overrideAccess: true }).catch(() => null)));
  const count = await payload.count({ collection: "ai-team-messages", where: { and: [{ member: { equals: memberId } }, { text: { equals: mark } }, { createdAt: { greater_than_equal: since } }] }, overrideAccess: true }).catch(() => ({ totalDocs: 0 }));
  return count.totalDocs;
}

export type ReviewSkip = { status: "pas-encore" | "deja-faite" | "pause" | "echec"; message?: string };
export type ReservedReview<C> = { chief: C; placeholderId: number | string; finish: (text: string, costEur?: number) => Promise<unknown> };

/**
 * LE DÉBUT COMMUN DES REVUES DU LUNDI (Margaux, Serge, Élise — relecture du 15/11/2026, il était recopié trois fois) :
 * le chef existe et est en service ; ses revues coupées en route sont marquées interrompues ; hors `force`, la revue
 * est due (`due`), pas déjà faite depuis `since` (un message qui porte `mark`), pas interrompue trop souvent, et ce
 * qu'elle attend est prêt (`ready`) ; puis elle se RÉSERVE par un message « `title` : `preparing`… » — de deux
 * réservations simultanées, la plus récente se retire. Rend la réservation et de quoi écrire le message final.
 */
export async function reserveChiefReview<C extends { id: number | string; name: string; active?: boolean | null }>(
  payload: Payload,
  o: { chiefKey: string; missing: string; mark: string; title: string; preparing: string; interrupted: string; since: string; now: Date; force?: boolean; due?: () => boolean; ready?: (chief: C) => Promise<boolean> },
): Promise<{ skip: ReviewSkip } | ReservedReview<C>> {
  const { memberByKey } = await import("@/modules/ai-team/lib/shared-data");
  const chief = await memberByKey<C>(payload, o.chiefKey);
  if (!chief) return { skip: { status: "echec", message: o.missing } };
  if (chief.active === false) return { skip: { status: "pause", message: `${chief.name} est en pause.` } };
  const recent = () => payload.find({ collection: "ai-team-messages", where: { and: [{ member: { equals: chief.id } }, { from: { equals: "agent" } }, { text: { like: o.mark } }, { createdAt: { greater_than_equal: o.since } }] }, sort: "createdAt", limit: 3, depth: 0, overrideAccess: true });
  const interrupted = await reopenStale(payload, chief.id, o.preparing, o.interrupted, o.now, o.since);
  if (!o.force) {
    if (o.due && !o.due()) return { skip: { status: "pas-encore" } };
    if (interrupted >= MAX_INTERRUPTIONS || (await recent()).docs.length) return { skip: { status: "deja-faite" } };
    if (o.ready && !(await o.ready(chief))) return { skip: { status: "pas-encore" } };
  }
  const placeholder = await payload.create({ collection: "ai-team-messages", data: { member: chief.id, from: "agent", text: `${o.title} : ${o.preparing}…` } as never, overrideAccess: true });
  if (!o.force) {
    const racing = await recent();
    if (racing.docs.length > 1 && racing.docs[0].id !== placeholder.id) {
      await payload.delete({ collection: "ai-team-messages", id: placeholder.id, overrideAccess: true });
      return { skip: { status: "deja-faite" } };
    }
  }
  return {
    chief,
    placeholderId: placeholder.id,
    finish: (text, costEur) => payload.update({ collection: "ai-team-messages", id: placeholder.id, data: { text, ...(costEur != null ? { costEur } : {}) } as never, overrideAccess: true }),
  };
}
