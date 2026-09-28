import { NextResponse } from "next/server";

import { afterResponse } from "@/core/lib/after-response";
import { payloadClient } from "@/core/payload-client";
import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import {
  EXTENSION_REQUESTS,
  LOST_REASONS,
  extensionRequestLabel,
  lostReasonLabel,
} from "@/modules/marketing/lib/journey";
import { resolveJourney } from "@/modules/marketing/lib/journey-ticket";
import { readRunToken } from "@/modules/marketing/lib/run-token";
import { SUPPORT_NOTIFY_EMAIL, ticketReplyNoticeEmail } from "@/modules/support/lib/email";

/**
 * La seconde étape de « Votre décision » : combien de temps, ou ce qui a manqué.
 *
 * POST { token, days?, reasons?, note? } — la décision elle-même est déjà
 * enregistrée (voir ../route.ts). On lit celle du PARCOURS, jamais une valeur
 * reçue : un détail de prolongation n'a de sens que si le client a demandé une
 * prolongation.
 *
 * Le détail rejoint le ticket du parcours (onglet « Réponses du client ») :
 * c'est là que le partenaire répond déjà aux e-mails du test, et une demande de
 * prolongation appelle justement une réponse. En cas d'abandon, les motifs vont
 * AUSSI dans « Motif de perte », qui alimente l'analyse des tests perdus.
 */
export const dynamic = "force-dynamic";

const MAX_NOTE = 2000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { token?: string; days?: unknown; reasons?: unknown; note?: unknown }
    | null;

  const runId = readRunToken("decision", body?.token);
  if (!runId) return NextResponse.json({ error: "invalid_token" }, { status: 403 });

  const payload = await payloadClient();
  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: number; status?: string; decision?: string | null } | null;
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.status && CLOSED_STATUSES.includes(run.status)) {
    return NextResponse.json({ error: "closed" }, { status: 409 });
  }

  const note = typeof body?.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";
  let subject: string;
  let lines: string[];
  let lostReason: string | null = null;

  if (run.decision === "prolongation") {
    const days = Number(body?.days);
    if (!EXTENSION_REQUESTS.some((e) => e.value === days)) {
      return NextResponse.json({ error: "invalid_days" }, { status: 400 });
    }
    subject = `Demande de prolongation — ${extensionRequestLabel(days)}`;
    lines = [
      `Le client demande à prolonger son test de ${extensionRequestLabel(days)}.`,
      "À inscrire dans l'onglet « Prolongations » du parcours si vous l'accordez.",
    ];
  } else if (run.decision === "abandon") {
    const reasons = (Array.isArray(body?.reasons) ? body.reasons : [])
      .filter((r): r is string => typeof r === "string" && LOST_REASONS.some((l) => l.value === r));
    if (!reasons.length && !note) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }
    const labels = reasons.map((r) => lostReasonLabel(r)!);
    subject = "Fin de test — ce qui a manqué";
    lines = labels.length ? ["Motifs cochés :", ...labels.map((l) => `• ${l}`)] : [];
    lostReason = [labels.join(" · "), note].filter(Boolean).join("\n\n");
  } else {
    return NextResponse.json({ error: "no_details_expected" }, { status: 409 });
  }

  const text = [...lines, ...(note ? ["", "Précisions du client :", note] : [])].join("\n");

  try {
    if (lostReason) {
      await payload.update({
        collection: "journey-runs",
        id: runId,
        data: { lostReason } as never,
        overrideAccess: true,
      });
    }

    const journey = await resolveJourney(payload, Number(runId), { text, subject });
    if (!journey) throw new Error("ticket introuvable et non créable (aucune adresse client)");
    const { ticket } = journey;

    // Le ticket qu'on vient d'ouvrir porte déjà le message.
    if (!journey.created) {
      await payload.update({
        collection: "tickets",
        id: ticket.id,
        data: {
          messages: [
            ...(ticket.messages ?? []),
            { author: "client", body: `${subject}\n\n${text}`, sentAt: new Date().toISOString() },
          ],
          needsAttention: true,
          unreadClientReply: true,
        } as never,
        overrideAccess: true,
      });
    }

    // Celui qui a cliqué attend son écran, pas l'envoi d'un e-mail interne.
    afterResponse(
      () =>
        payload.sendEmail({
          to: SUPPORT_NOTIFY_EMAIL,
          ...ticketReplyNoticeEmail({
            id: ticket.id,
            number: ticket.number ?? 0,
            subject: ticket.subject ?? subject,
            name: ticket.name,
            email: ticket.email ?? "",
            body: `${subject}\n\n${text}`,
            journey: { runId, clientName: journey.clientName },
          }),
        }),
      (e) => payload.logger.error(`[décision] notification du détail échouée : ${e}`),
    );
  } catch (err) {
    payload.logger.error(`[décision] détail du parcours ${runId} non enregistré : ${err}`);
    return NextResponse.json({ error: "save_failed" }, { status: 502 });
  }

  payload.logger.info(`[décision] parcours ${runId} : détail « ${run.decision} » reçu.`);
  return NextResponse.json({ ok: true });
}
