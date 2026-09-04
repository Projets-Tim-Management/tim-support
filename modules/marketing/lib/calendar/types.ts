import { postForm } from "@/core/lib/google-oauth";

/**
 * Abstraction des fournisseurs d'agenda.
 *
 * Google et Microsoft ne partagent ni leurs URLs, ni leurs scopes, ni la forme
 * de leurs réponses — mais le PARCOURS est le même : consentement, jetons,
 * lister les agendas, lire les périodes occupées, créer un événement avec un
 * lien de visio. Cette interface fixe ce parcours ; le reste du code ne sait pas
 * quel fournisseur est branché.
 *
 * Conséquence à connaître : le lien de visio suit l'agenda. Google Calendar
 * produit un lien Meet, Microsoft un lien Teams. On ne crée pas de Meet depuis
 * un agenda Microsoft.
 */

export type CalendarProviderId = "google" | "microsoft";

export type OAuthTokens = {
  accessToken: string;
  /** Absent lors d'un rafraîchissement : le fournisseur ne le renvoie qu'une fois. */
  refreshToken?: string;
  /** Expiration de l'access token, en ms epoch. */
  expiresAt: number;
  /** Compte connecté, pour l'afficher au partenaire. */
  accountEmail?: string;
};

export type RemoteCalendar = {
  id: string;
  name: string;
  primary?: boolean;
};

export type BusyPeriod = { start: string; end: string };

export type CreatedEvent = {
  eventId: string;
  /** Lien Meet ou Teams, si l'événement est une visio. */
  meetingUrl?: string;
  htmlLink?: string;
};

export type EventInput = {
  calendarId: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees: string[];
  /** Visio → conférence créée par le fournisseur ; sinon `location` est utilisé. */
  online: boolean;
  location?: string;
  /** Identifiant stable de la demande de conférence (exigé par Google). */
  requestId: string;
  /**
   * Clé de rattachement de l'événement au parcours, écrite DANS l'événement
   * chez le fournisseur. Elle permet de retrouver un événement dont on aurait
   * perdu l'identifiant — voir `findEvent`.
   */
  runKey?: string;
};

export interface CalendarProvider {
  readonly id: CalendarProviderId;
  readonly label: string;
  /** URL de consentement vers laquelle rediriger le partenaire. */
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  listCalendars(accessToken: string): Promise<RemoteCalendar[]>;
  freeBusy(accessToken: string, calendarIds: string[], from: string, to: string): Promise<BusyPeriod[]>;
  createEvent(accessToken: string, input: EventInput): Promise<CreatedEvent>;
  /**
   * Déplace ou modifie un événement existant, en CONSERVANT sa conférence : un
   * report de créneau ne doit pas invalider un lien déjà transmis au client.
   */
  updateEvent(accessToken: string, eventId: string, input: EventInput): Promise<CreatedEvent>;
  /**
   * Supprime l'événement. Idempotent : un événement déjà absent (effacé à la
   * main dans l'agenda) n'est pas une erreur — le but est qu'il ne soit plus là.
   */
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
  /**
   * Retrouve un événement par sa clé de parcours.
   *
   * POURQUOI. Créer l'événement et enregistrer son identifiant sont deux gestes
   * distincts : entre les deux, le processus peut mourir. L'événement existe
   * alors chez le fournisseur sans que TIM le sache, et la tentative suivante en
   * crée un SECOND — deux invitations pour le même rendez-vous, deux liens de
   * visio différents, chez le client. C'est arrivé le 27/08/2026.
   *
   * Facultatif : un fournisseur qui ne sait pas chercher ainsi reste utilisable,
   * il perd seulement ce garde-fou.
   */
  findEvent?(accessToken: string, calendarId: string, runKey: string): Promise<CreatedEvent | null>;
}

/** Le fournisseur est-il configuré côté environnement ? */
export const providerConfigured = (id: CalendarProviderId): boolean =>
  id === "google"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);

/** URL de retour OAuth — doit correspondre EXACTEMENT à celle déclarée chez le fournisseur. */
export const redirectUri = (): string => {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
  return `${base.replace(/\/$/, "")}/api/calendar/callback`;
};

/** Réexporté : les fournisseurs l'importent depuis ce module depuis toujours. */
export { postForm };
