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
 * Renvoie AUSSI si la lecture est fiable, et c'est le point important.
 *
 * Ce code a longtemps été « tolérant aux pannes » : un agenda muet faisait
 * retomber sur les règles seules, au motif qu'un espace client qui ne propose
 * rien est pire qu'un doublon occasionnel. C'est faux, et ça s'est vérifié le
 * 27/08/2026 : le jeton étant expiré, aucun conflit n'a été lu, et un client a
 * réservé sur une démonstration déjà calée. Deux visioconférences à la même
 * heure — découvertes par le partenaire, à froid, quelques jours avant.
 *
 * Un créneau proposé est une PROMESSE. On ne la fait pas sur une lecture qu'on
 * sait incomplète. « Je ne sais pas » vaut « occupé », et l'appelant décide
 * quoi en dire.
 *
 * Nuance qui compte : un partenaire SANS agenda connecté n'est pas un doute.
 * Il n'a jamais promis que TIM regarderait son agenda ; ses règles horaires
 * font foi, et la lecture est donc fiable — il n'y avait rien à lire.
 */
export type BusyReading = {
  periods: BusyPeriod[];
  /** Faux dès qu'un agenda connecté n'a PAS pu être lu. */
  reliable: boolean;
};

export async function busyForPartner(
  payload: Payload,
  partnerId: number | string,
  from: string,
  to: string,
): Promise<BusyReading> {
  const res = await payload.find({
    collection: "calendar-connections",
    where: { partner: { equals: partnerId } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });

  const readings = await Promise.all(
    (res.docs as Connection[]).map(async (connection): Promise<BusyReading> => {
      const provider = getProvider(connection.provider);
      const ids = (connection.calendars ?? [])
        .filter((c) => c.busy !== false && c.calendarId)
        .map((c) => c.calendarId as string);
      // Aucun agenda retenu pour les conflits : c'est un choix du partenaire,
      // pas une panne.
      if (!provider || ids.length === 0) return { periods: [], reliable: true };

      const token = await accessTokenFor(payload, connection);
      if (!token) {
        payload.logger.error(
          `[agenda] indisponibilités du partenaire ${partnerId} non lues : connexion ` +
            `${connection.id} sans jeton valide. Aucun créneau ne sera proposé tant ` +
            `que l'agenda n'est pas reconnecté.`,
        );
        return { periods: [], reliable: false };
      }

      try {
        return { periods: await provider.freeBusy(token, ids, from, to), reliable: true };
      } catch (err) {
        /**
         * Ce silence a un COÛT, et il faut pouvoir le retracer.
         *
         * Ne rien retourner ici veut dire « le partenaire est libre » : le
         * client se voit alors proposer des créneaux déjà pris, et découvre le
         * conflit le jour du rendez-vous. C'est arrivé le 27/08/2026 — un
         * créneau réservé sur une démonstration déjà calée.
         *
         * On conserve le choix de ne pas bloquer la réservation, mais l'incident
         * est nommé : partenaire, connexion, fenêtre.
         */
        payload.logger.error(
          `[agenda] indisponibilités du partenaire ${partnerId} illisibles (connexion ` +
            `${connection.id}, ${from} → ${to}) : ${err}. Aucun créneau ne sera proposé.`,
        );
        return { periods: [], reliable: false };
      }
    }),
  );

  return mergeBusyReadings(readings);
}

/**
 * Agrège les lectures de plusieurs agendas.
 *
 * Un seul agenda illisible suffit à rendre l'ensemble douteux : les conflits
 * qu'il contient sont précisément ceux qu'on ne verra pas. Deux agendas lus sur
 * trois ne valent pas mieux qu'aucun quand c'est le troisième qui porte le
 * rendez-vous.
 */
export const mergeBusyReadings = (readings: BusyReading[]): BusyReading => ({
  periods: readings.flatMap((r) => r.periods),
  reliable: readings.every((r) => r.reliable),
});

/**
 * Index de l'agenda qui reçoit les rendez-vous, à la première connexion.
 *
 * Un seul, jamais deux. La version précédente écrivait
 * `target: c.primary || i === 0`, ce qui en désignait DEUX dès que l'agenda
 * principal n'était pas en tête de liste : le premier de la liste, et le
 * principal. `targetConnection` retenant le premier trouvé, les invitations
 * partaient d'un agenda secondaire — chez TIM, un agenda nommé « Transférés
 * depuis adecoster@… », si bien que le client recevait ses convocations d'une
 * personne qui n'avait rien à voir avec son dossier (constaté le 27/08/2026).
 *
 * Règle : l'agenda principal, à défaut le premier de la liste, sinon aucun.
 */
export const targetCalendarIndex = (calendars: { primary?: boolean }[]): number => {
  if (calendars.length === 0) return -1;
  const primary = calendars.findIndex((c) => c.primary);
  return primary === -1 ? 0 : primary;
};

/** Connexion qui doit RECEVOIR les événements, si le partenaire en a désigné une. */
export async function targetConnection(
  payload: Payload,
  partnerId: number | string,
): Promise<{ connection: Connection; calendarId: string } | null> {
  /**
   * On ne filtre PLUS sur `status === "ok"`.
   *
   * Une connexion passe en « expiré » dès qu'un rafraîchissement échoue — un
   * incident réseau, une coupure de Google, un jeton arrivé à terme pendant une
   * période creuse. Avec l'ancien filtre, cette marque était DÉFINITIVE : la
   * connexion n'était plus jamais consultée, donc plus jamais rafraîchie, alors
   * que son jeton de rafraîchissement était toujours valide. Un agenda connecté,
   * un agenda désigné, et pourtant plus aucun événement créé — sans que rien ne
   * le dise.
   *
   * On retient donc aussi les connexions expirées QUI ONT un jeton de
   * rafraîchissement : `accessTokenFor` retentera, et remettra le statut à
   * « ok » si ça marche (voir `tokenFields`). Si le refus est définitif, elle
   * les remarquera expirées — sans rien casser de plus.
   */
  const res = await payload.find({
    collection: "calendar-connections",
    where: { partner: { equals: partnerId } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });

  const usable = (res.docs as Connection[]).filter(
    (c) => c.status === "ok" || Boolean(c.refreshToken),
  );
  // Les connexions saines d'abord : inutile de tenter un rafraîchissement quand
  // une autre connexion répond déjà.
  usable.sort((a, b) => (a.status === "ok" ? -1 : 0) - (b.status === "ok" ? -1 : 0));

  for (const connection of usable) {
    const target = (connection.calendars ?? []).find((c) => c.target && c.calendarId);
    if (target?.calendarId) return { connection, calendarId: target.calendarId };
  }
  return null;
}
