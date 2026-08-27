import { randomUUID } from "node:crypto";
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

/**
 * Écrit le résultat d'une synchronisation sur le parcours.
 *
 * Deux appelants — le hook du parcours et le bouton « Mettre à l'agenda » —
 * écrivaient les mêmes deux champs, chacun avec sa règle. L'un ne touchait au
 * champ que s'il était renseigné, l'autre traduisait « inconnu » en « vide » :
 * la même réponse pouvait donc, selon le chemin, conserver ou EFFACER un
 * identifiant d'événement valide.
 *
 * `undefined` veut dire « je n'en sais rien, n'y touche pas » ; `null` veut dire
 * « il n'y en a plus ». La différence est écrite une fois, ici.
 */
export const sessionSyncPatch = (result: SessionSyncResult): Record<string, unknown> => ({
  ...(result.sessionEventId !== undefined ? { sessionEventId: result.sessionEventId } : {}),
  ...(result.sessionLink !== undefined ? { sessionLink: result.sessionLink } : {}),
});

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

  /**
   * Chaque abandon est DIT.
   *
   * Ces trois sorties étaient muettes : un créneau réservé sans lien de visio ne
   * laissait aucune trace, ni dans l'interface ni dans les journaux. Impossible
   * de savoir, après coup, s'il manquait un agenda, un agenda désigné ou un
   * jeton valide — donc impossible de le réparer.
   */
  const target = await targetConnection(payload, partnerId);
  if (!target) {
    payload.logger.warn(
      `[agenda] parcours ${run.id} : créneau enregistré sans événement — aucun agenda connecté ` +
        `ou aucun agenda désigné comme cible pour le partenaire ${partnerId}.`,
    );
    return NOTHING;
  }

  const provider = getProvider(target.connection.provider);
  const token = provider ? await accessTokenFor(payload, target.connection) : null;
  if (!provider || !token) {
    payload.logger.warn(
      `[agenda] parcours ${run.id} : créneau enregistré sans événement — connexion ` +
        `${target.connection.id} (${target.connection.provider}) inutilisable, jeton non renouvelable. ` +
        `Le partenaire doit reconnecter son agenda.`,
    );
    return NOTHING;
  }

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
    // La personne formée, puis les invités déclarés. L'adresse de l'espace
    // client ne sert que de repli : celle saisie au moment de réserver prime,
    // parce que l'administrateur formé n'est pas forcément le contact qui a reçu
    // l'invitation. Dédoublonnage en minuscules — le même invité saisi deux fois
    // fait échouer certains fournisseurs d'agenda.
    attendees: [
      ...new Set(
        [
          (run as { attendeeEmail?: string | null }).attendeeEmail?.trim() || attendee,
          ...(((run as { sessionGuests?: { email?: string | null }[] }).sessionGuests ?? [])
            .map((g) => g?.email?.trim())
            .filter(Boolean) as string[]),
        ]
          .filter(Boolean)
          .map((e) => (e as string).toLowerCase()),
      ),
    ],
    online,
    location: run.sessionLocation ?? undefined,
    /**
     * Identifiant de demande de conférence, NEUF à chaque création.
     *
     * Il était dérivé du parcours et du créneau, donc identique d'une fois sur
     * l'autre. Google traite deux demandes de même identifiant comme une seule :
     * recréer un événement sur le même créneau — après une suppression, ou après
     * un événement introuvable — pouvait rendre la conférence détruite, c'est-à-
     * dire un lien Meet mort transmis au client.
     *
     * Le déterminisme servait à ne pas créer deux conférences pour un même
     * rendez-vous. Ce rôle est désormais tenu par `findEvent`, qui retrouve
     * l'événement réel au lieu de parier sur un identifiant.
     */
    requestId: `run-${run.id}-${randomUUID()}`,
    // Stable sur toute la vie du parcours, à la différence de `requestId` :
    // c'est ce qui permet de retrouver l'événement même après un report.
    runKey: `run-${run.id}`,
  };

  /**
   * Avant de créer, on VÉRIFIE qu'on n'a pas déjà créé.
   *
   * Créer l'événement et enregistrer son identifiant sont deux gestes séparés :
   * entre les deux, le processus peut mourir (serveur redémarré, requête
   * interrompue). L'événement existe alors chez le fournisseur sans que TIM le
   * sache, et l'essai suivant en fabrique un second — deux invitations pour le
   * même rendez-vous, deux liens de visio, chez le client. Vu en vrai le
   * 27/08/2026 sur le parcours Frapose.
   *
   * On adopte l'orphelin plutôt que d'en créer un jumeau : la suite le met à
   * jour, donc l'horaire et les invités redeviennent justes.
   */
  let known = eventId;
  if (!known && provider.findEvent) {
    const orphan = await provider.findEvent(token, target.calendarId, input.runKey).catch(() => null);
    if (orphan) {
      known = orphan.eventId;
      payload.logger.warn(
        `[agenda] parcours ${run.id} : événement ${orphan.eventId} retrouvé dans l'agenda alors ` +
          `qu'il n'était pas enregistré. Adopté au lieu d'en créer un doublon.`,
      );
    }
  }

  try {
    const result = known
      ? await provider.updateEvent(token, known, input)
      : await provider.createEvent(token, input);
    payload.logger.info(
      `[agenda] événement du parcours ${run.id} ${known ? "déplacé" : "créé"}${
        result.meetingUrl ? " (lien de visio obtenu)" : ""
      }.`,
    );
    return {
      sessionEventId: result.eventId,
      // Sur place : pas de lien à afficher, et un lien résiduel enverrait le
      // client en visio alors qu'on l'attend sur le chantier.
      sessionLink: online ? (result.meetingUrl ?? null) : null,
      action: known ? "updated" : "created",
    };
  } catch (err) {
    payload.logger.error(`[agenda] mise à jour de l'événement échouée : ${err}`);
    /**
     * L'événement visé n'existe plus là où on le cherchait — effacé à la main,
     * ou déplacé sur un autre agenda. Oublier son identifiant ne suffit pas :
     * le créneau resterait sans événement jusqu'au prochain enregistrement, et
     * personne ne saurait qu'il faut en refaire un. On en recrée un tout de
     * suite, dans le même passage.
     */
    if (known && /\(40[34]\)|\(410\)/.test(String(err))) {
      try {
        const fresh = await provider.createEvent(token, input);
        payload.logger.warn(
          `[agenda] parcours ${run.id} : événement ${known} introuvable, remplacé par ${fresh.eventId}.`,
        );
        return {
          sessionEventId: fresh.eventId,
          sessionLink: online ? (fresh.meetingUrl ?? null) : null,
          action: "created",
        };
      } catch (again) {
        payload.logger.error(`[agenda] recréation de l'événement échouée : ${again}`);
        return { sessionEventId: null, action: "none" };
      }
    }
    return NOTHING;
  }
}
