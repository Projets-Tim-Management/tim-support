import type { Payload } from "payload";

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

export type JourneyContext = {
  ctx: JourneyEmailContext;
  /** Adresse de l'espace client — destinataire des messages « client ». */
  clientEmail: string | null;
  /** Adresse du partenaire — destinataire des messages « partenaire ». */
  partnerEmail: string | null;
};

const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

export async function buildJourneyContext(
  payload: Payload,
  run: JourneyRunLike,
): Promise<JourneyContext> {
  const clientId = idOf(run.client);
  const partnerId = idOf(run.partner);

  const [client, partner, account, credentials] = await Promise.all([
    clientId != null
      ? payload
          .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })
          .catch(() => null)
      : null,
    partnerId != null
      ? payload
          .findByID({ collection: "partners", id: partnerId, depth: 0, overrideAccess: true })
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
          })
          .then((r) => r.docs[0] ?? null)
          .catch(() => null)
      : null,
    clientId != null
      ? payload
          .count({
            collection: "client-credentials",
            where: { client: { equals: clientId } },
            overrideAccess: true,
          })
          .then((r) => r.totalDocs)
          .catch(() => 0)
      : 0,
  ]);

  const c = client as { companyName?: string } | null;
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
    clientEmail: a?.email ?? null,
    partnerEmail: p?.email ?? null,
  };
}
