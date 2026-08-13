import type { Payload } from "payload";

import { JOURNEY_EMAILS, type JourneyEmailContext } from "@/modules/marketing/lib/emails";
import { journeyReplyTo } from "@/modules/marketing/lib/reply-routing";

/**
 * Porte d'entrée unique des e-mails de parcours adressés au client ou au
 * partenaire.
 *
 * Tout passe par ici pour une raison : l'en-tête `Reply-To`. Trois de ces
 * messages demandent explicitement « répondez directement à cet e-mail » — si
 * un seul point d'envoi oublie l'en-tête, cette réponse-là se perd dans la
 * boîte support sans que personne ne sache qu'elle existe. Un helper partagé
 * rend l'oubli impossible.
 *
 * L'envoi marque aussi `sentAt` sur la ligne correspondante du parcours, pour
 * que la séquence programmée ne reparte pas deux fois.
 */

type SendResult = { sent: boolean; reason?: string };

type RunEmailRow = { key?: string; sentAt?: string | null };

export async function sendJourneyEmail(
  payload: Payload,
  args: {
    runId: number | string;
    key: string;
    to: string;
    ctx: JourneyEmailContext;
    /** Réenvoi volontaire : passe outre le garde-fou « déjà envoyé ». */
    force?: boolean;
  },
): Promise<SendResult> {
  const { runId, key, to, ctx, force } = args;

  const template = JOURNEY_EMAILS[key];
  if (!template) return { sent: false, reason: "no_template" };
  if (!to) return { sent: false, reason: "no_recipient" };

  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { emails?: RunEmailRow[] } | null;
  if (!run) return { sent: false, reason: "no_run" };

  const rows = run.emails ?? [];
  const row = rows.find((e) => e.key === key);
  if (row?.sentAt && !force) return { sent: false, reason: "already_sent" };

  const built = template(ctx);

  await payload.sendEmail({
    to,
    subject: built.subject,
    html: built.html,
    text: built.text,
    // Une réponse revient dans le logiciel, rattachée à CE parcours.
    ...(journeyReplyTo(runId) ? { replyTo: journeyReplyTo(runId) } : {}),
  });

  // Le marquage est secondaire : l'e-mail est parti, un échec ici ne doit pas
  // faire remonter une erreur qui laisserait croire le contraire.
  if (row) {
    await payload
      .update({
        collection: "journey-runs",
        id: runId,
        data: {
          emails: rows.map((e) =>
            e.key === key ? { ...e, sentAt: new Date().toISOString() } : e,
          ),
        } as never,
        overrideAccess: true,
      })
      .catch(() => undefined);
  }

  return { sent: true };
}
