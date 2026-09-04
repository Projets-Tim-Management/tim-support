import type { Payload } from "payload";

import { suppress, type SuppressionReason } from "@/core/lib/email-suppression";
import { fetchSuppressionEvents } from "@/modules/support/lib/brevo";

/**
 * Verse dans la liste de suppression ce que Brevo a constaté.
 *
 * Une désinscription peut arriver par un chemin que nous ne voyons pas : le
 * bouton natif du client de messagerie qui passe par Brevo, une plainte pour
 * spam, une adresse qui n'existe plus. Sans cette reprise, on continuerait
 * d'écrire à quelqu'un qui a explicitement demandé qu'on cesse — et la liste
 * ne refléterait que les clics sur NOTRE lien.
 */

const REASON: Record<string, SuppressionReason> = {
  unsubscribed: "desinscription",
  hardBounces: "rejet-definitif",
  spam: "spam",
};

export interface SuppressionSyncSummary {
  ok: boolean;
  /** Événements Brevo examinés. */
  events: number;
  /** Adresses effectivement ajoutées (les autres y étaient déjà). */
  added: number;
  byReason: Record<string, number>;
  reason?: string;
}

export async function syncSuppressionsFromBrevo(
  payload: Payload,
  { days = 7 }: { days?: number } = {},
): Promise<SuppressionSyncSummary> {
  const empty: SuppressionSyncSummary = { ok: false, events: 0, added: 0, byReason: {} };
  if (!process.env.BREVO_API_KEY) return { ...empty, reason: "brevo_non_configure" };

  let events;
  try {
    events = await fetchSuppressionEvents(days);
  } catch (e) {
    // Une panne doit se VOIR : un « 0 désinscription » indiscernable d'une
    // journée calme laisserait partir des messages à des gens qui ont refusé.
    return { ...empty, reason: `brevo_injoignable: ${(e as Error).message}` };
  }

  const byReason: Record<string, number> = {};
  let added = 0;

  // Une même adresse peut porter plusieurs événements : on ne la traite qu'une
  // fois, avec le motif du plus grave (une plainte prime sur un rejet).
  const seen = new Set<string>();
  const ordered = [...events].sort(
    (a, b) => weight(b.event) - weight(a.event),
  );

  for (const e of ordered) {
    const email = e.email?.trim().toLowerCase();
    const motif = REASON[e.event];
    if (!email || !motif || seen.has(email)) continue;
    seen.add(email);
    try {
      if (await suppress(payload, email, motif, `Événement Brevo « ${e.event} »`)) {
        added += 1;
        byReason[motif] = (byReason[motif] ?? 0) + 1;
      }
    } catch (err) {
      payload.logger.error(`[désinscription] ${email} non enregistrée : ${err}`);
    }
  }

  return { ok: true, events: events.length, added, byReason };
}

/** Gravité relative, pour choisir le motif quand une adresse en cumule plusieurs. */
const weight = (event: string): number =>
  event === "spam" ? 3 : event === "hardBounces" ? 2 : event === "unsubscribed" ? 1 : 0;
