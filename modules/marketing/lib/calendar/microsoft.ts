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
 * Microsoft 365 / Outlook (Microsoft Graph).
 *
 * Deux limites du fournisseur, à connaître avant de promettre quoi que ce soit :
 *  - les comptes Outlook.com PERSONNELS ne savent pas créer de réunion Teams via
 *    l'API ; il faut un Microsoft 365 professionnel ;
 *  - un jeton « application » crée bien l'événement mais SANS lien Teams. D'où
 *    le flux délégué (au nom du partenaire) retenu ici.
 *
 * `offline_access` est indispensable pour obtenir un refresh token.
 */

const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const API = "https://graph.microsoft.com/v1.0";

const SCOPES = ["offline_access", "openid", "email", "Calendars.ReadWrite"];

/**
 * Délai maximal d'un appel à l'agenda.
 *
 * `fetch` n'expire pas tout seul : une requête qui reste sans réponse suspend
 * l'enregistrement qui l'a déclenchée, sans jamais échouer. Douze secondes,
 * c'est très au-delà d'un appel normal (quelques centaines de millisecondes) et
 * très en deçà du seuil où l'utilisateur croit l'application bloquée.
 */
const CALL_TIMEOUT_MS = 12_000;

async function api<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    // Après `...init` : le délai ne doit pas pouvoir être écrasé par l'appelant.
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new Error(`Microsoft Graph (${res.status}) : ${message}`);
  }
  return body as T;
}

const emailFromIdToken = (idToken?: unknown): string | undefined => {
  if (typeof idToken !== "string") return undefined;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return payload?.email ?? payload?.preferred_username ?? undefined;
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

export const microsoftProvider: CalendarProvider = {
  id: "microsoft",
  label: "Microsoft 365",

  authUrl(state, redirect) {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      redirect_uri: redirect,
      response_type: "code",
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
    });
    return `${AUTH}?${params.toString()}`;
  },

  async exchangeCode(code, redirect) {
    return toTokens(
      await postForm(TOKEN, {
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
        redirect_uri: redirect,
        grant_type: "authorization_code",
        scope: SCOPES.join(" "),
      }),
    );
  },

  async refresh(refreshToken) {
    return toTokens(
      await postForm(TOKEN, {
        refresh_token: refreshToken,
        client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        scope: SCOPES.join(" "),
      }),
    );
  },

  async listCalendars(accessToken) {
    const data = await api<{ value?: { id: string; name?: string; isDefaultCalendar?: boolean }[] }>(
      accessToken,
      "/me/calendars?$select=id,name,isDefaultCalendar&$top=100",
    );
    return (data.value ?? []).map<RemoteCalendar>((c) => ({
      id: c.id,
      name: c.name ?? c.id,
      primary: Boolean(c.isDefaultCalendar),
    }));
  },

  async freeBusy(accessToken, calendarIds, from, to) {
    if (calendarIds.length === 0) return [];
    // Graph interroge les périodes occupées par ADRESSE de boîte, pas par
    // identifiant d'agenda : on lit donc l'agenda du compte connecté.
    const me = await api<{ mail?: string; userPrincipalName?: string }>(
      accessToken,
      "/me?$select=mail,userPrincipalName",
    );
    const address = me.mail ?? me.userPrincipalName;
    if (!address) return [];

    const data = await api<{
      value?: { scheduleItems?: { start?: { dateTime?: string }; end?: { dateTime?: string } }[] }[];
    }>(accessToken, "/me/calendar/getSchedule", {
      method: "POST",
      body: JSON.stringify({
        schedules: [address],
        startTime: { dateTime: from, timeZone: "UTC" },
        endTime: { dateTime: to, timeZone: "UTC" },
        availabilityViewInterval: 15,
      }),
    });

    return (data.value ?? []).flatMap((s) =>
      (s.scheduleItems ?? [])
        .filter((i) => i.start?.dateTime && i.end?.dateTime)
        .map<BusyPeriod>((i) => ({
          // Graph renvoie des dates sans suffixe de fuseau alors qu'elles sont
          // en UTC : on le rétablit, sinon elles seraient lues en heure locale.
          start: `${i.start!.dateTime!.replace(/Z?$/, "")}Z`,
          end: `${i.end!.dateTime!.replace(/Z?$/, "")}Z`,
        })),
    );
  },

  async createEvent(accessToken, input: EventInput): Promise<CreatedEvent> {
    const body: Record<string, unknown> = {
      subject: input.summary,
      body: { contentType: "text", content: input.description ?? "" },
      start: { dateTime: input.start, timeZone: "UTC" },
      end: { dateTime: input.end, timeZone: "UTC" },
      attendees: input.attendees.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      })),
    };

    if (input.online) {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = "teamsForBusiness";
    } else if (input.location) {
      body.location = { displayName: input.location };
    }

    const created = await api<{
      id: string;
      webLink?: string;
      onlineMeeting?: { joinUrl?: string };
    }>(accessToken, `/me/calendars/${encodeURIComponent(input.calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      eventId: created.id,
      meetingUrl: created.onlineMeeting?.joinUrl,
      htmlLink: created.webLink,
    };
  },

  async updateEvent(accessToken, eventId, input: EventInput): Promise<CreatedEvent> {
    const body: Record<string, unknown> = {
      subject: input.summary,
      body: { contentType: "text", content: input.description ?? "" },
      start: { dateTime: input.start, timeZone: "UTC" },
      end: { dateTime: input.end, timeZone: "UTC" },
      attendees: input.attendees.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      })),
    };

    // `isOnlineMeeting: true` sur un événement qui l'est déjà ne recrée PAS la
    // réunion : Graph conserve le joinUrl existant. C'est ce qu'on veut — un
    // report d'horaire ne doit pas casser le lien déjà envoyé au client.
    if (input.online) {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = "teamsForBusiness";
    } else {
      body.isOnlineMeeting = false;
      if (input.location) body.location = { displayName: input.location };
    }

    // `/me/events/{id}` : l'identifiant est unique dans la boîte, inutile de
    // repasser par l'agenda — et ça marche même si l'événement a été déplacé.
    const updated = await api<{
      id: string;
      webLink?: string;
      onlineMeeting?: { joinUrl?: string };
    }>(accessToken, `/me/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return {
      eventId: updated.id,
      meetingUrl: updated.onlineMeeting?.joinUrl,
      htmlLink: updated.webLink,
    };
  },

  async deleteEvent(accessToken, _calendarId, eventId): Promise<void> {
    const res = await fetch(`${API}/me/events/${encodeURIComponent(eventId)}`, {
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 204 attendu ; 404/410 = déjà supprimé, ce qui est le résultat visé.
    if (res.ok || res.status === 404 || res.status === 410) return;
    throw new Error(`Microsoft Graph (${res.status}) : suppression refusée.`);
  },
};
