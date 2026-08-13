import type { Payload } from "payload";

import { decryptSecret, encryptSecret } from "@/core/lib/secrets";
import { googleProvider } from "./google";
import { microsoftProvider } from "./microsoft";
import type { BusyPeriod, CalendarProvider, CalendarProviderId, OAuthTokens } from "./types";

export * from "./types";

const PROVIDERS: Record<CalendarProviderId, CalendarProvider> = {
  google: googleProvider,
  microsoft: microsoftProvider,
};

export const getProvider = (id?: string | null): CalendarProvider | null =>
  id === "google" || id === "microsoft" ? PROVIDERS[id] : null;

export type Connection = {
  id: number | string;
  provider?: string;
  accountEmail?: string;
  status?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  calendars?: { calendarId?: string; name?: string; busy?: boolean; target?: boolean }[];
};

/** Enregistre des jetons fraîchement obtenus, chiffrés. */
export const tokenFields = (tokens: OAuthTokens, previousRefresh?: string | null) => ({
  accessToken: encryptSecret(tokens.accessToken),
  // Google ne renvoie le refresh token qu'au PREMIER consentement : lors d'un
  // rafraîchissement, il faut conserver celui qu'on avait.
  refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : previousRefresh ?? null,
  expiresAt: new Date(tokens.expiresAt).toISOString(),
  status: "ok" as const,
  ...(tokens.accountEmail ? { accountEmail: tokens.accountEmail } : {}),
});

/**
 * Jeton d'accès utilisable, rafraîchi si nécessaire.
 *
 * Renvoie null plutôt que de lever : un agenda qui ne répond plus ne doit jamais
 * empêcher un client de réserver — on retombe simplement sur les règles seules.
 * La connexion est alors marquée « à reconnecter », ce que l'écran affiche.
 */
export async function accessTokenFor(
  payload: Payload,
  connection: Connection,
): Promise<string | null> {
  const provider = getProvider(connection.provider);
  if (!provider) return null;

  const expiresAt = connection.expiresAt ? Date.parse(connection.expiresAt) : 0;
  const access = decryptSecret(connection.accessToken);
  // Marge d'une minute : un jeton qui expire pendant l'appel serait refusé.
  if (access && expiresAt - 60_000 > Date.now()) return access;

  const refresh = decryptSecret(connection.refreshToken);
  if (!refresh) {
    await markExpired(payload, connection.id);
    return null;
  }

  try {
    const tokens = await provider.refresh(refresh);
    await payload.update({
      collection: "calendar-connections",
      id: connection.id,
      data: tokenFields(tokens, connection.refreshToken),
      overrideAccess: true,
    });
    return tokens.accessToken;
  } catch (err) {
    payload.logger.error(`[agenda] rafraîchissement du jeton ${connection.id} échoué : ${err}`);
    await markExpired(payload, connection.id);
    return null;
  }
}

async function markExpired(payload: Payload, id: number | string) {
  await payload
    .update({
      collection: "calendar-connections",
      id,
      data: { status: "expired" },
      overrideAccess: true,
    })
    .catch(() => undefined);
}

/**
 * Périodes occupées d'un partenaire, tous agendas connectés confondus.
 *
 * Volontairement TOLÉRANT aux pannes : si un fournisseur ne répond pas, on
 * ignore ses conflits au lieu de bloquer la réservation. Le risque assumé est
 * un doublon occasionnel, préférable à un espace client qui ne propose rien.
 */
export async function busyForPartner(
  payload: Payload,
  partnerId: number | string,
  from: string,
  to: string,
): Promise<BusyPeriod[]> {
  const res = await payload.find({
    collection: "calendar-connections",
    where: { partner: { equals: partnerId } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });

  const periods = await Promise.all(
    (res.docs as Connection[]).map(async (connection) => {
      const provider = getProvider(connection.provider);
      const ids = (connection.calendars ?? [])
        .filter((c) => c.busy !== false && c.calendarId)
        .map((c) => c.calendarId as string);
      if (!provider || ids.length === 0) return [];

      const token = await accessTokenFor(payload, connection);
      if (!token) return [];

      try {
        return await provider.freeBusy(token, ids, from, to);
      } catch (err) {
        payload.logger.error(`[agenda] lecture des indisponibilités échouée : ${err}`);
        return [];
      }
    }),
  );

  return periods.flat();
}

/** Connexion qui doit RECEVOIR les événements, si le partenaire en a désigné une. */
export async function targetConnection(
  payload: Payload,
  partnerId: number | string,
): Promise<{ connection: Connection; calendarId: string } | null> {
  const res = await payload.find({
    collection: "calendar-connections",
    where: { partner: { equals: partnerId }, status: { equals: "ok" } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });

  for (const connection of res.docs as Connection[]) {
    const target = (connection.calendars ?? []).find((c) => c.target && c.calendarId);
    if (target?.calendarId) return { connection, calendarId: target.calendarId };
  }
  return null;
}
