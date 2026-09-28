import type { payloadClient } from "@/core/payload-client";

/**
 * Le ticket qui porte les échanges d'un parcours de test.
 *
 * Partagé par deux entrées : la réponse à un e-mail du parcours (webhook
 * d'e-mails entrants) et le détail laissé sur la page « Votre décision ». Les
 * deux aboutissent au même fil, dans l'onglet « Réponses du client ».
 */
export type TicketDoc = {
  id: number;
  number?: number;
  subject?: string;
  email?: string;
  name?: string;
  status?: string;
  messages?: { author: "client" | "support"; body: string; sentAt: string; attachments?: number[] }[];
};

/**
 * Ticket portant les échanges d'un parcours donné.
 *
 * On réutilise le ticket ouvert du parcours plutôt que d'en créer un par
 * réponse : pendant un test de 30 jours, un client répond plusieurs fois, et
 * autant de tickets séparés feraient perdre le fil de la conversation. Un
 * ticket résolu, lui, n'est pas rouvert de force — le nouvel échange repart
 * proprement d'un ticket neuf.
 */
export async function resolveJourney(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  runId: number,
  message: { text: string; subject?: string; fromEmail?: string; fromName?: string },
): Promise<{
  ticket: TicketDoc;
  created: boolean;
  runId: number;
  clientName?: string | null;
} | null> {
  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 1, overrideAccess: true })
    .catch(() => null)) as { id: number; client?: unknown } | null;
  if (!run) return null;

  const client = (run.client && typeof run.client === "object" ? run.client : null) as {
    companyName?: string;
    email?: string;
  } | null;
  const clientName = client?.companyName ?? null;

  const existing = (
    await payload.find({
      collection: "tickets",
      where: {
        and: [{ journeyRun: { equals: runId } }, { status: { not_equals: "resolved" } }],
      },
      sort: "-createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as TicketDoc | undefined;

  if (existing) return { ticket: existing, created: false, runId, clientName };

  // `email` est obligatoire sur un ticket, et à juste titre : sans adresse
  // d'expéditeur on ne pourrait pas répondre. On le dit dans les logs plutôt que
  // de créer un ticket auquel personne ne peut donner suite.
  const replyAddress = message.fromEmail || client?.email;
  if (!replyAddress) {
    console.warn(`[parcours] ticket du parcours ${runId} non créé : aucune adresse (expéditeur ni fiche client)`);
    return null;
  }

  const now = new Date().toISOString();
  const subject = message.subject?.trim()
    ? message.subject.trim().slice(0, 200)
    : `Phase de test — ${clientName ?? `parcours #${runId}`}`;

  const ticket = (await payload.create({
    collection: "tickets",
    data: {
      subject,
      description: message.text,
      messages: [{ author: "client", body: message.text, sentAt: now }],
      // L'adresse qui a écrit fait foi : c'est à elle qu'on répondra, même si
      // elle diffère du contact enregistré sur la fiche.
      email: replyAddress,
      name: message.fromName,
      company: clientName ?? undefined,
      journeyRun: runId,
      // Un essai en cours relève du commercial, pas de l'assistance technique.
      service: "commercial",
      type: "assistance",
      status: "new",
      needsAttention: true,
      unreadClientReply: true,
    } as never,
    overrideAccess: true,
  })) as TicketDoc;

  return { ticket, created: true, runId, clientName };
}
