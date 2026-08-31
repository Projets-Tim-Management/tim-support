import type { Payload, PayloadRequest } from "payload";

import type { JourneyEmailContext } from "@/modules/marketing/lib/emails";
import { sessionSummary, stepDueDate } from "@/modules/marketing/lib/journey";

/**
 * Contexte d'un message de parcours : les données réelles qui remplissent le
 * gabarit.
 *
 * UN SEUL endroit le construit, et l'aperçu comme l'envoi passent par lui. Deux
 * constructions séparées finiraient par diverger, et l'aperçu deviendrait un
 * mensonge — on montrerait une chose et on enverrait l'autre.
 */

export type JourneyRunLike = {
  id: number | string;
  client?: unknown;
  partner?: unknown;
  startDate?: string | null;
  endDate?: string | null;
  sessionAt?: string | null;
  sessionMode?: string | null;
  sessionLink?: string | null;
  sessionLocation?: string | null;
  attendeeFirstName?: string | null;
  attendeeLastName?: string | null;
  attendeeRole?: string | null;
  attendeeEmail?: string | null;
  sessionGuests?: { email?: string | null; name?: string | null }[] | null;
  steps?: { key?: string; anchor?: string; offsetDays?: number }[];
};

/**
 * D'où vient l'adresse du client.
 *
 * `fiche` est un RATTRAPAGE, pas le fonctionnement normal : il signale qu'aucun
 * compte espace client n'existe pour ce parcours. L'appelant le journalise, et
 * c'est ce qui permet de s'en apercevoir avant que quelqu'un ne s'étonne.
 */
export type ClientEmailSource = "compte" | "fiche" | null;

export type JourneyContext = {
  ctx: JourneyEmailContext;
  /** Adresse de l'espace client — destinataire des messages « client ». */
  clientEmail: string | null;
  /** Compte espace client, ou fiche client à défaut. */
  clientEmailSource: ClientEmailSource;
  /** Adresse du partenaire — destinataire des messages « partenaire ». */
  partnerEmail: string | null;
};

const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

/**
 * @param req Requête en cours, quand l'appel vient d'un hook.
 *
 * ⚠️ Sans elle, ces quatre lectures sortent de la transaction et ne voient pas
 * ce que la requête courante vient d'écrire. La plus sensible est le COMPTE
 * D'ACCÈS : c'est lui qui porte l'adresse du client, donc lui qui décide s'il y
 * a quelqu'un à qui écrire. Le Go de TIM crée ce compte puis, dans le même
 * geste, demande l'envoi de l'invitation — lue hors transaction, la ligne
 * n'existe pas encore, `clientEmail` vaut `null`, et l'envoi s'arrête sur
 * « aucun destinataire » sans que personne ne s'en aperçoive.
 *
 * SOCOM FRANCE, 28/08/2026 : espace ouvert, entreprise jamais prévenue. Passer
 * `req` au seul chargement du parcours ne suffisait pas — l'échec se déplaçait
 * simplement d'un cran.
 */
export async function buildJourneyContext(
  payload: Payload,
  run: JourneyRunLike,
  req?: PayloadRequest,
): Promise<JourneyContext> {
  const clientId = idOf(run.client);
  const partnerId = idOf(run.partner);
  const tx = req ? { req } : {};

  const [client, partner, account, credentials] = await Promise.all([
    clientId != null
      ? payload
          .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true, ...tx })
          .catch(() => null)
      : null,
    partnerId != null
      ? payload
          .findByID({ collection: "partners", id: partnerId, depth: 0, overrideAccess: true, ...tx })
          .catch(() => null)
      : null,
    clientId != null
      ? payload
          .find({
            collection: "client-portal-accounts",
            where: { client: { equals: clientId } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            ...tx,
          })
          .then((r) => r.docs[0] ?? null)
          .catch(() => null)
      : null,
    clientId != null
      ? payload
          .count({
            collection: "client-contacts",
            where: { client: { equals: clientId }, timPassword: { exists: true } },
            overrideAccess: true,
            ...tx,
          })
          .then((r) => r.totalDocs)
          .catch(() => 0)
      : 0,
  ]);

  const c = client as { companyName?: string; email?: string } | null;
  const p = partner as { displayName?: string; email?: string } | null;
  const a = account as { email?: string; firstName?: string } | null;

  // L'échéance annoncée au client EST celle de l'étape « Dossier de démarrage » :
  // le texte ne réinvente pas un délai de son côté.
  const dossierStep = (run.steps ?? []).find((s) => s.key === "dossier-demarrage");
  const dossierDeadline = dossierStep
    ? stepDueDate(dossierStep, run.startDate ?? null, run.endDate ?? null)
    : null;

  return {
    ctx: {
      clientName: c?.companyName ?? null,
      contactFirstName: a?.firstName ?? null,
      partnerName: p?.displayName ?? null,
      startDate: run.startDate ?? null,
      endDate: run.endDate ?? null,
      sessionAt: run.sessionAt ?? null,
      sessionModality: sessionSummary(run as never),
      sessionLink: run.sessionLink ?? null,
      sessionAttendee: run.attendeeFirstName || run.attendeeEmail
        ? {
            firstName: run.attendeeFirstName ?? null,
            lastName: run.attendeeLastName ?? null,
            role: run.attendeeRole ?? null,
            email: run.attendeeEmail ?? null,
          }
        : null,
      sessionGuests: run.sessionGuests ?? null,
      credentialCount: credentials as number,
      dossierDeadline,
    },
    ...clientAddress(a?.email, c?.email),
    partnerEmail: p?.email ?? null,
  };
}

/**
 * L'adresse à laquelle on écrit au client, et d'où elle vient.
 *
 * D'ABORD le compte espace client : c'est l'adresse choisie POUR CE PARCOURS,
 * celle qui reçoit les codes de connexion, celle qu'un admin corrige quand le
 * contact change en cours de route. Elle prime, toujours.
 *
 * À DÉFAUT, celle de la fiche client — « Contact, puis envoi des factures »,
 * requise à la création, et déjà la source dont `openPortalOnGo` se sert pour
 * ouvrir un accès. Sans ce repli, un parcours créé hors du modal de démarrage
 * n'avait aucun destinataire : toute la séquence datée s'arrêtait sur « aucun
 * destinataire », en silence, et rien à l'écran n'en donnait la raison.
 *
 * Et RIEN d'autre. L'adresse du partenaire n'est pas un troisième recours : il
 * recevrait un message qui s'adresse à son client à la deuxième personne.
 */
function clientAddress(
  compte?: string | null,
  fiche?: string | null,
): { clientEmail: string | null; clientEmailSource: ClientEmailSource } {
  const duCompte = compte?.trim();
  if (duCompte) return { clientEmail: duCompte, clientEmailSource: "compte" };

  const deLaFiche = fiche?.trim();
  if (deLaFiche) return { clientEmail: deLaFiche, clientEmailSource: "fiche" };

  return { clientEmail: null, clientEmailSource: null };
}
