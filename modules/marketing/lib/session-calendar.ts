import type { Payload } from "payload";

import { accessTokenFor, getProvider, targetConnection } from "@/modules/marketing/lib/calendar";
import { resolveRules } from "@/modules/marketing/lib/scheduling";

/**
 * L'événement d'agenda de la session de prise en main, tenu à jour.
 *
 * UN SEUL endroit décide de créer, déplacer ou annuler cet événement — que le
 * créneau vienne de l'espace client ou d'une saisie à la main dans le
 * back-office. Deux chemins qui écriraient chacun de leur côté finiraient par
 * diverger, et un agenda qui ment est pire qu'un agenda vide.
 *
 * Trois transitions, déduites de l'état précédent :
 *
 *   pas d'événement + créneau      → création  (et récupération du lien visio)
 *   événement + créneau différent  → déplacement, conférence CONSERVÉE
 *   événement + plus de créneau    → annulation
 *
 * Aucune de ces opérations n'est bloquante : si l'agenda refuse, le créneau
 * reste enregistré côté TIM et le partenaire cale l'événement lui-même. Faire
 * échouer une réservation client parce qu'un jeton OAuth a expiré serait punir
 * le client pour un incident qui ne le concerne pas.
 */

export type SessionSyncResult = {
  /** Lien de visio à écrire sur le parcours (undefined = ne pas toucher). */
  sessionLink?: string | null;
  /** Identifiant de l'événement (null = il n'y en a plus). */
  sessionEventId?: string | null;
  /** Ce qui a été fait — pour le journal. */
  action: "created" | "updated" | "deleted" | "none";
};

const NOTHING: SessionSyncResult = { action: "none" };

type Run = {
  id: number | string;
  partner?: unknown;
  client?: unknown;
  sessionAt?: string | null;
  sessionMode?: string | null;
  sessionLocation?: string | null;
  sessionEventId?: string | null;
};

const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

/** Adresse de l'espace client : celle qui reçoit déjà tout le parcours. */
async function attendeeEmail(payload: Payload, clientId: number | string): Promise<string | undefined> {
  const res = await payload
    .find({
      collection: "client-portal-accounts",
      where: { client: { equals: clientId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null);
  return (res?.docs?.[0] as { email?: string } | undefined)?.email;
}

async function companyName(payload: Payload, clientId: number | string): Promise<string | undefined> {
  const doc = await payload
    .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })
    .catch(() => null);
  return (doc as { companyName?: string } | null)?.companyName;
}

export async function syncSessionEvent(
  payload: Payload,
  run: Run,
  previousSessionAt?: string | null,
): Promise<SessionSyncResult> {
  const partnerId = idOf(run.partner);
  const eventId = run.sessionEventId ?? null;
  const at = run.sessionAt ?? null;

  // Rien à faire si le créneau n'a pas bougé et qu'aucun événement n'attend
  // d'être créé.
  const changed = (previousSessionAt ?? null) !== at;
  if (!changed && (!at || eventId)) return NOTHING;
  if (!partnerId) return NOTHING;

  const target = await targetConnection(payload, partnerId);
  if (!target) return NOTHING; // aucun agenda désigné : le champ reste manuel

  const provider = getProvider(target.connection.provider);
  const token = provider ? await accessTokenFor(payload, target.connection) : null;
  if (!provider || !token) return NOTHING;

  // ── Annulation ────────────────────────────────────────────────────────────
  if (!at) {
    if (!eventId) return NOTHING;
    try {
      await provider.deleteEvent(token, target.calendarId, eventId);
      payload.logger.info(`[agenda] événement du parcours ${run.id} supprimé.`);
      return { sessionEventId: null, sessionLink: null, action: "deleted" };
    } catch (err) {
      payload.logger.error(`[agenda] suppression de l'événement échouée : ${err}`);
      return NOTHING;
    }
  }

  // ── Création / déplacement ────────────────────────────────────────────────
  const partner = await payload
    .findByID({ collection: "partners", id: partnerId, depth: 0, overrideAccess: true })
    .catch(() => null);
  const rules = resolveRules((partner as { scheduling?: Record<string, unknown> } | null)?.scheduling as never);

  const clientId = idOf(run.client);
  const [attendee, company] = await Promise.all([
    clientId != null ? attendeeEmail(payload, clientId) : Promise.resolve(undefined),
    clientId != null ? companyName(payload, clientId) : Promise.resolve(undefined),
  ]);

  const online = run.sessionMode !== "sur-place";
  const input = {
    calendarId: target.calendarId,
    summary: `Prise en main TIM — ${company ?? "client"}`,
    description: "Session de prise en main de 45 minutes, avant le démarrage de la phase de test.",
    start: at,
    end: new Date(Date.parse(at) + rules.durationMin * 60_000).toISOString(),
    attendees: attendee ? [attendee] : [],
    online,
    location: run.sessionLocation ?? undefined,
    // Unique par parcours ET par créneau : réutiliser l'identifiant d'une
    // demande de conférence existante casse les accès des participants.
    requestId: `run-${run.id}-${Date.parse(at)}`,
  };

  try {
    const result = eventId
      ? await provider.updateEvent(token, eventId, input)
      : await provider.createEvent(token, input);
    payload.logger.info(
      `[agenda] événement du parcours ${run.id} ${eventId ? "déplacé" : "créé"}${
        result.meetingUrl ? " (lien de visio obtenu)" : ""
      }.`,
    );
    return {
      sessionEventId: result.eventId,
      // Sur place : pas de lien à afficher, et un lien résiduel enverrait le
      // client en visio alors qu'on l'attend sur le chantier.
      sessionLink: online ? (result.meetingUrl ?? null) : null,
      action: eventId ? "updated" : "created",
    };
  } catch (err) {
    payload.logger.error(`[agenda] mise à jour de l'événement échouée : ${err}`);
    // L'événement a disparu de l'agenda côté fournisseur : on oublie son
    // identifiant, sinon toutes les tentatives suivantes échoueraient dessus.
    if (eventId && /\(40[34]\)|\(410\)/.test(String(err))) {
      return { sessionEventId: null, action: "none" };
    }
    return NOTHING;
  }
}
