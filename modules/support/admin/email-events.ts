/**
 * Libellés, couleurs et hiérarchie des événements e-mail Brevo — partagés par
 * l'onglet « E-mails » et les pastilles du fil de conversation, pour qu'un même
 * état ne s'affiche jamais de deux façons différentes.
 */

// Forme définie une seule fois, côté lib serveur (`import type` : effacé à la
// compilation, donc rien du module serveur dans le bundle client).
export type { BrevoEvent } from "../lib/brevo";
import type { BrevoEvent } from "../lib/brevo";

export const EVENT_META: Record<string, { label: string; color: string; bg: string }> = {
  requests: { label: "Envoyé", color: "var(--tim-slate)", bg: "var(--tim-slate-bg)" },
  delivered: { label: "Remis", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)" },
  opened: { label: "Ouvert", color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
  loadedByProxy: { label: "Ouvert (proxy)", color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
  clicks: { label: "Lien cliqué", color: "var(--tim-purple)", bg: "var(--tim-purple-bg)" },
  softBounces: { label: "Rejet temporaire", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)" },
  deferred: { label: "Différé", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)" },
  hardBounces: { label: "Rejet définitif", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
  blocked: { label: "Bloqué", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
  invalid: { label: "Adresse invalide", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
  spam: { label: "Signalé comme spam", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
  error: { label: "Erreur", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
  unsubscribed: { label: "Désinscrit", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
};

export const eventMeta = (event: string) =>
  EVENT_META[event] ?? { label: event, color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" };

/**
 * Rang d'avancement d'un événement. Les ÉCHECS priment sur tout le reste : savoir
 * qu'un message a été bloqué compte davantage que de savoir qu'il est parti.
 */
const RANK: Record<string, number> = {
  requests: 1,
  deferred: 2,
  delivered: 3,
  loadedByProxy: 4,
  opened: 5,
  clicks: 6,
  softBounces: 10,
  unsubscribed: 11,
  spam: 20,
  invalid: 20,
  blocked: 20,
  hardBounces: 20,
  error: 20,
};

export interface MailState {
  /** Événement le plus significatif du message. */
  event: string;
  /** Date d'envoi (premier événement du message). */
  sentAt: number;
}

/**
 * Regroupe les événements par e-mail envoyé (`messageId`) et retient, pour
 * chacun, son état le plus significatif.
 *
 * Filtré sur le DESTINATAIRE du ticket : un même envoi tague aussi la
 * notification interne, qui ne dit rien de ce que le client a reçu.
 */
export function groupByMessage(events: BrevoEvent[], recipient?: string | null): MailState[] {
  const wanted = recipient?.toLowerCase();
  const groups = new Map<string, MailState>();

  for (const e of events) {
    if (wanted && e.email?.toLowerCase() !== wanted) continue;
    const key = e.messageId ?? e.date;
    const at = Date.parse(e.date);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { event: e.event, sentAt: at });
      continue;
    }
    if ((RANK[e.event] ?? 0) > (RANK[current.event] ?? 0)) current.event = e.event;
    // La date d'envoi est celle du PREMIER événement du message.
    if (at < current.sentAt) current.sentAt = at;
  }
  return [...groups.values()];
}

/** Tolérance de rapprochement entre un message du fil et un envoi Brevo. */
const MATCH_WINDOW_MS = 10 * 60 * 1000;

/**
 * État de l'e-mail correspondant à un message du fil. Le rapprochement se fait
 * sur l'HORODATAGE : tous les e-mails d'un ticket partagent le même tag, seul le
 * moment d'envoi les distingue. Au-delà de 10 minutes d'écart, on n'affiche rien
 * plutôt que d'attribuer un état au mauvais message.
 */
export function stateForMessage(states: MailState[], sentAt?: string): MailState | null {
  if (!sentAt) return null;
  const target = Date.parse(sentAt);
  if (Number.isNaN(target)) return null;

  let best: MailState | null = null;
  let bestGap = Infinity;
  for (const s of states) {
    const gap = Math.abs(s.sentAt - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = s;
    }
  }
  return best && bestGap <= MATCH_WINDOW_MS ? best : null;
}
