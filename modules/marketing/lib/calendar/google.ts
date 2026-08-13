import type {
  BusyPeriod,
  CalendarProvider,
  CreatedEvent,
  EventInput,
  OAuthTokens,
  RemoteCalendar,
} from "./types";
import { postForm } from "./types";

/**
 * Google Calendar.
 *
 * Points qui ne s'improvisent pas :
 *  - `access_type=offline` + `prompt=consent` : sans eux, Google ne renvoie PAS
 *    de refresh token, et la connexion meurt au bout d'une heure ;
 *  - `conferenceDataVersion=1` à la création : sans ce paramètre, la demande de
 *    conférence est ignorée EN SILENCE et aucun lien Meet n'est créé ;
 *  - la conférence est générée de façon asynchrone : le lien peut manquer dans
 *    la réponse immédiate, d'où une relecture de l'événement.
 */

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
];

async function api<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new Error(`Google Calendar (${res.status}) : ${message}`);
  }
  return body as T;
}

/** Statuts signifiant « cet événement n'est plus là » — ce qu'on voulait obtenir. */
const GONE = new Set([404, 410]);

/** L'adresse du compte connecté, lue dans l'id_token (déjà signé par Google). */
const emailFromIdToken = (idToken?: unknown): string | undefined => {
  if (typeof idToken !== "string") return undefined;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return typeof payload?.email === "string" ? payload.email : undefined;
  } catch {
    return undefined;
  }
};

const toTokens = (body: Record<string, unknown>): OAuthTokens => ({
  accessToken: String(body.access_token ?? ""),
  refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
  expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
  accountEmail: emailFromIdToken(body.id_token),
});

export const googleProvider: CalendarProvider = {
  id: "google",
  label: "Google Calendar",

  authUrl(state, redirect) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirect,
      response_type: "code",
      scope: SCOPES.join(" "),
      // Indispensables pour obtenir un refresh token exploitable dans la durée.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH}?${params.toString()}`;
  },

  async exchangeCode(code, redirect) {
    return toTokens(
      await postForm(TOKEN, {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }),
    );
  },

  async refresh(refreshToken) {
    return toTokens(
      await postForm(TOKEN, {
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
      }),
    );
  },

  async listCalendars(accessToken) {
    const data = await api<{ items?: { id: string; summary?: string; primary?: boolean }[] }>(
      accessToken,
      "/users/me/calendarList?minAccessRole=writer&maxResults=100",
    );
    return (data.items ?? []).map<RemoteCalendar>((c) => ({
      id: c.id,
      name: c.summary ?? c.id,
      primary: Boolean(c.primary),
    }));
  },

  async freeBusy(accessToken, calendarIds, from, to) {
    if (calendarIds.length === 0) return [];
    const data = await api<{ calendars?: Record<string, { busy?: BusyPeriod[] }> }>(
      accessToken,
      "/freeBusy",
      {
        method: "POST",
        body: JSON.stringify({
          timeMin: from,
          timeMax: to,
          items: calendarIds.map((id) => ({ id })),
        }),
      },
    );
    return Object.values(data.calendars ?? {}).flatMap((c) => c.busy ?? []);
  },

  async createEvent(accessToken, input: EventInput): Promise<CreatedEvent> {
    const body: Record<string, unknown> = {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      attendees: input.attendees.map((email) => ({ email })),
    };

    if (input.online) {
      // `requestId` unique par événement : réutiliser une conférence existante
      // provoque des problèmes d'accès chez les participants.
      body.conferenceData = {
        createRequest: {
          requestId: input.requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    } else if (input.location) {
      body.location = input.location;
    }

    const path = `/calendars/${encodeURIComponent(input.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
    const created = await api<{
      id: string;
      hangoutLink?: string;
      htmlLink?: string;
      conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
    }>(accessToken, path, { method: "POST", body: JSON.stringify(body) });

    let meetingUrl =
      created.hangoutLink ??
      created.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;

    // La conférence est créée de façon asynchrone : une relecture suffit
    // généralement à récupérer le lien absent de la première réponse.
    if (input.online && !meetingUrl) {
      const reread = await api<{ hangoutLink?: string }>(
        accessToken,
        `/calendars/${encodeURIComponent(input.calendarId)}/events/${created.id}`,
      ).catch(() => null);
      meetingUrl = reread?.hangoutLink;
    }

    return { eventId: created.id, meetingUrl, htmlLink: created.htmlLink };
  },

  async updateEvent(accessToken, eventId, input: EventInput): Promise<CreatedEvent> {
    // PATCH et non PUT : on ne renvoie PAS `conferenceData`, et Google conserve
    // alors la conférence existante. Un PUT l'effacerait, et le lien Meet déjà
    // envoyé au client cesserait de fonctionner — le pire résultat possible pour
    // un simple report d'horaire.
    const body: Record<string, unknown> = {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      attendees: input.attendees.map((email) => ({ email })),
    };

    // Passage visio → sur place : la conférence n'a plus lieu d'être, et la
    // laisser inviterait le client à s'y connecter au lieu de se déplacer.
    if (!input.online) {
      body.conferenceData = null;
      if (input.location) body.location = input.location;
    }

    const base = `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(eventId)}`;
    const updated = await api<{
      id: string;
      hangoutLink?: string;
      htmlLink?: string;
      conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
    }>(accessToken, `${base}?conferenceDataVersion=1&sendUpdates=all`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    let meetingUrl =
      updated.hangoutLink ??
      updated.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;

    // L'événement existait sans conférence (créé sur place, ou agenda connecté
    // après coup) et devient une visio : il faut la demander explicitement.
    if (input.online && !meetingUrl) {
      const withMeet = await api<{ hangoutLink?: string; htmlLink?: string }>(
        accessToken,
        `${base}?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: "PATCH",
          body: JSON.stringify({
            conferenceData: {
              createRequest: {
                requestId: input.requestId,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
        },
      ).catch(() => null);
      meetingUrl = withMeet?.hangoutLink;
    }

    return { eventId: updated.id, meetingUrl, htmlLink: updated.htmlLink };
  },

  async deleteEvent(accessToken, calendarId, eventId): Promise<void> {
    const res = await fetch(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    // 204 attendu ; 404/410 = déjà supprimé, ce qui est le résultat visé.
    if (res.ok || GONE.has(res.status)) return;
    throw new Error(`Google Calendar (${res.status}) : suppression refusée.`);
  },
};
