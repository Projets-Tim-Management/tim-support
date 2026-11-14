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
