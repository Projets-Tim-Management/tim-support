import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import {
  extractJourneyRunId,
  extractSequenceRunId,
  extractTicketNumber,
} from "@/modules/marketing/lib/reply-routing";
import { captureAddresses, captureEmail } from "@/modules/partner/lib/email-capture";
import { SUPPORT_NOTIFY_EMAIL, ticketReplyNoticeEmail } from "@/modules/support/lib/email";

// Webhook d'e-mails entrants (Brevo Inbound Parsing).
//
// Deux adresses de réponse aboutissent ici :
//   - ticket-<n>@REPLY_DOMAIN → réponse à un ticket existant, ajoutée au fil ;
//   - run-<id>@REPLY_DOMAIN   → réponse à un e-mail de phase de test. Elle ouvre
//     un ticket rattaché au parcours (ou complète celui déjà ouvert), pour que
//     l'équipe puisse intervenir au lieu de laisser dormir le message dans la
//     boîte support ;
//   - seq-<id>@REPLY_DOMAIN   → réponse à une séquence de relance. Inscrite sur
//     la fiche de l'opportunité, et arrête la séquence si celle-ci le prévoit ;
//   - l'adresse de CAPTURE (EMAIL_CAPTURE_ADDRESS, mise en copie cachée par un
//     commercial) → l'échange remonte dans l'historique de l'opportunité.
//
// Protégé par une clé en query (?key=...) car Brevo ne signe pas les webhooks.
export const dynamic = "force-dynamic";

/** Comparaison à temps constant d'une clé fournie avec INBOUND_SECRET. */
function keyIsValid(provided: string | null): boolean {
  const secret = process.env.INBOUND_SECRET ?? "";
  if (!secret || !provided || provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

/** Aplati les diverses formes de destinataires Brevo en liste d'adresses. */
function collectAddresses(value: unknown, out: string[]): void {
  if (!value) return;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectAddresses(v, out));
  else if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.Address === "string") out.push(o.Address);
    else if (typeof o.address === "string") out.push(o.address);
  }
}

/** Nom affiché de l'expéditeur, quand Brevo le fournit. */
function senderName(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || typeof first !== "object") return undefined;
  const o = first as Record<string, unknown>;
  const name = o.Name ?? o.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

type TicketDoc = {
  id: number;
  number?: number;
  subject?: string;
  email?: string;
  name?: string;
  status?: string;
  messages?: { author: "client" | "support"; body: string; sentAt: string; attachments?: number[] }[];
};

/**
 * Ce qu'une réponse à une séquence de relance provoque.
 *
 * Deux effets, décidés séparément :
 *
 *  1. La réponse est TOUJOURS inscrite sur la fiche de l'opportunité. C'est le
 *     point le plus important : sans ça, un prospect qui écrit « finalement je
 *     suis intéressé » disparaît dans une boîte que personne n'ouvre. Elle
 *     devient une TÂCHE quand la séquence s'arrête (quelqu'un doit rappeler),
 *     une simple trace quand la séquence continue.
 *
 *  2. La séquence s'arrête, ou non, selon SON réglage — pas selon le code. Une
 *     relance qui demande « votre projet est-il toujours d'actualité ? » a
 *     obtenu ce qu'elle voulait dès la première réponse. Une campagne, elle,
 *     n'attend pas de réponse : « merci, pas pour l'instant » n'est pas une
 *     demande de désinscription, et la couper priverait le prospect des messages
 *     suivants sans qu'il l'ait demandé.
 *
 * Aucun ticket n'est créé : la personne répond à une sollicitation commerciale,
 * pas à une demande d'assistance. Un ticket encombrerait la file du support d'un
 * message qui appartient au commercial.
 *
 * Silencieux de bout en bout : une réponse tardive à une séquence supprimée ne
 * doit pas produire d'erreur dans un webhook que Brevo réessaierait en boucle.
 */
async function handleSequenceReply(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  id: number,
  text: string,
): Promise<void> {
  try {
    const run = (await payload
      .findByID({ collection: "sequence-runs", id, depth: 0, overrideAccess: true })
      .catch(() => null)) as {
      status?: string;
      client?: unknown;
      email?: string;
      sequence?: string;
      sequenceLabel?: string;
    } | null;
    if (!run) return;

    const model = (
      await payload.find({
        collection: "sequences",
        where: { key: { equals: run.sequence } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
    ).docs[0] as { stopOnReply?: boolean } | undefined;

    // Modèle introuvable (séquence supprimée depuis) : on ARRÊTE. Continuer à
    // écrire à quelqu'un qui a répondu, faute de savoir, est la pire des deux
    // erreurs possibles.
    const stop = model?.stopOnReply !== false;
    const running = run.status === "en-cours";

    if (stop && running) {
      await payload.update({
        collection: "sequence-runs",
        id,
        data: { status: "arretee", stopReason: "reponse" } as never,
        overrideAccess: true,
      });
      payload.logger.info(`[séquence] ${id} arrêtée : le prospect a répondu.`);
    }

    const raw =
      run.client && typeof run.client === "object" ? (run.client as { id?: unknown }).id : run.client;
    const clientId = Number(raw);
    if (!Number.isFinite(clientId)) return;

    const label = run.sequenceLabel ?? "relance";
    await payload.create({
      collection: "client-activities",
      data:
        stop && running
          ? {
              // Une tâche, et non une note : la séquence vient de s'arrêter pour
              // que quelqu'un reprenne la main. Personne ne reprend une note.
              type: "tache",
              taskKind: "email",
              title: `Répondre à ${run.email ?? "ce prospect"} — a répondu à « ${label} »`,
              content: text,
              dueDate: new Date().toISOString(),
              client: clientId,
            }
          : {
              type: "email",
              title: `Réponse à « ${label} »`,
              content: text,
              client: clientId,
            },
      overrideAccess: true,
    });
  } catch (err) {
    payload.logger.error(`[séquence] réponse à ${id} non traitée : ${err}`);
  }
}

export async function POST(req: Request) {
  // Secret dédié obligatoire (jamais de repli sur PAYLOAD_SECRET, qui ne doit
  // pas transiter en clair dans une URL de webhook).
  if (!keyIsValid(new URL(req.url).searchParams.get("key"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const items = Array.isArray((body as { items?: unknown[] }).items)
    ? ((body as { items: unknown[] }).items as Record<string, unknown>[])
    : [body];

  const payload = await payloadClient();
  let handled = 0;

  for (const item of items) {
    const recips: string[] = [];
    collectAddresses(item.To, recips);
    collectAddresses(item.Recipients, recips);
    collectAddresses(item.Cc, recips);

    const number = extractTicketNumber(recips);
    const runId = number ? null : extractJourneyRunId(recips);

    /**
     * Réponse à une séquence de relance : on l'ARRÊTE, et on s'arrête là.
     *
     * Pas de ticket créé : la personne répond à une sollicitation commerciale,
     * pas à une demande d'assistance. En faire un ticket encombrerait la file
     * du support d'un message qui appartient au commercial — et la réponse
     * reste lisible dans la boîte d'où part la séquence.
     *
     * Ce qui compte, c'est qu'elle ne reçoive plus les six messages suivants.
     */
    const text = (
      (item.ExtractedMarkdownMessage as string) ||
      (item.RawTextBody as string) ||
      (item.Text as string) ||
      ""
    )
      .toString()
      .trim()
      .slice(0, 20000);

    const seqId = number || runId ? null : extractSequenceRunId(recips);
    if (seqId) {
      await handleSequenceReply(payload, seqId, text);
      continue;
    }

    /**
     * Copie cachée sur l'adresse de capture : l'échange remonte sur la fiche.
     *
     * Après les tickets et les parcours, jamais avant : si les deux adresses
     * sont présentes, c'est la conversation explicite qui l'emporte — le Cci
     * n'est qu'un archivage, il ne doit pas priver le support de sa réponse.
     */
    const capture = captureAddresses();
    if (capture.length && recips.some((r) => capture.includes(r.trim().toLowerCase()))) {
      const to: string[] = [];
      const cc: string[] = [];
      collectAddresses(item.To, to);
      collectAddresses(item.Cc, cc);
      const result = await captureEmail(
        payload,
        {
          from: item.From as never,
          // Les destinataires VISIBLES seulement : `Recipients` contient
          // l'adresse de capture, qui ne désigne personne.
          to,
          cc,
          subject: typeof item.Subject === "string" ? item.Subject : undefined,
          text,
          attachments: (item.Attachments ?? null) as never,
          messageId: typeof item.MessageId === "string" ? item.MessageId : undefined,
          date: typeof item.SentAtDate === "string" ? item.SentAtDate : undefined,
        },
        { captureAddress: capture[0] },
      ).catch((e) => {
        payload.logger.error(`[capture] échange non enregistré : ${e}`);
        return null;
      });

      if (result?.reason === "ecrit") {
        handled++;
        payload.logger.info(`[capture] échange rattaché à l'opportunité ${result.clientId}.`);
      } else if (result) {
        // Dit à voix haute : un commercial qui met l'adresse en copie et ne voit
        // rien arriver doit pouvoir apprendre pourquoi.
        payload.logger.info(`[capture] message ignoré (${result.reason}).`);
      }
      continue;
    }

    if (!number && !runId) continue;
    if (!text) continue;

    // Résolution du ticket destinataire : celui visé par l'adresse, ou celui du
    // parcours — quitte à le créer.
    const from: string[] = [];
    collectAddresses(item.From, from);
    const journey = runId
      ? await resolveJourney(payload, runId, {
          text,
          subject: typeof item.Subject === "string" ? item.Subject : undefined,
          fromEmail: from[0],
          fromName: senderName(item.From),
        })
      : null;

    // Un parcours introuvable (supprimé, id fantaisiste) : on ne fabrique pas un
    // ticket orphelin à partir d'une adresse qui ne correspond à rien.
    if (runId && !journey) continue;

    const ticket: TicketDoc | undefined = journey
      ? journey.ticket
      : ((
          await payload.find({
            collection: "tickets",
            where: { number: { equals: number } },
            limit: 1,
            depth: 0,
          })
        ).docs[0] as TicketDoc | undefined);
    if (!ticket) continue;

    // Le ticket qu'on vient d'ouvrir porte déjà le message : le réécrire le
    // dupliquerait dans le fil.
    if (!journey?.created) {
      const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
      messages.push({ author: "client", body: text, sentAt: new Date().toISOString() });

      await payload.update({
        collection: "tickets",
        id: ticket.id,
        data: {
          messages,
          // Réponse client → le ticket attend une action du support (badge dashboard).
          needsAttention: true,
          // Réponse client non traitée → puces « réponse client » (menu/tableau/notifs).
          unreadClientReply: true,
          // Une réponse client ré-ouvre un ticket résolu.
          ...(ticket.status === "resolved" ? { status: "new" } : {}),
        },
      });
    }
    handled++;

    // Notification interne à l'équipe support (best-effort — le message est déjà
    // enregistré dans le ticket ; un échec d'envoi ne doit pas casser le webhook).
    try {
      await payload.sendEmail({
        to: SUPPORT_NOTIFY_EMAIL,
        ...ticketReplyNoticeEmail({
          id: ticket.id,
          number: ticket.number ?? 0,
          subject: ticket.subject ?? `#${ticket.number ?? ""}`,
          name: ticket.name,
          email: ticket.email ?? "",
          body: text,
          ...(journey
            ? { journey: { runId: journey.runId, clientName: journey.clientName } }
            : {}),
        }),
      });
    } catch (e) {
      console.warn("[inbound-email] notification support échouée:", e);
    }
  }

  return NextResponse.json({ ok: true, handled });
}

/**
 * Ticket portant les échanges d'un parcours donné.
 *
 * On réutilise le ticket ouvert du parcours plutôt que d'en créer un par
 * réponse : pendant un test de 30 jours, un client répond plusieurs fois, et
 * autant de tickets séparés feraient perdre le fil de la conversation. Un
 * ticket résolu, lui, n'est pas rouvert de force — le nouvel échange repart
 * proprement d'un ticket neuf.
 */
async function resolveJourney(
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
    console.warn(`[inbound-email] réponse au parcours ${runId} sans adresse d'expéditeur, ignorée`);
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
