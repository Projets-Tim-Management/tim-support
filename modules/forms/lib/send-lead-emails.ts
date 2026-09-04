import type { Payload } from "payload";

import { SUPPORT_NOTIFY_EMAIL } from "@/modules/support/lib/email";
import type { Attribution } from "@/modules/forms/lib/ingest";
import type { Channel } from "@/modules/forms/lib/form-schema";
import type { PublicForm } from "@/modules/forms/lib/public-schema";
import type { AnswerValue } from "@/modules/forms/lib/validate";
import { channelLabel } from "@/modules/forms/lib/form-schema";
import { leadConfirmationEmail, newLeadNoticeEmail } from "@/modules/forms/lib/lead-emails";

/**
 * Envoi des deux e-mails d'une soumission — accusé de réception au prospect,
 * alerte à l'équipe.
 *
 * Jamais bloquant : la soumission et l'opportunité existent déjà quand on arrive
 * ici. Un relais SMTP qui tousse ne doit pas faire échouer une demande de démo.
 * Les échecs sont journalisés, chacun de son côté : l'un ne doit pas empêcher
 * l'autre — perdre l'alerte interne ET l'accusé de réception parce qu'une seule
 * adresse est mauvaise serait le pire résultat.
 */

const str = (v: AnswerValue | undefined): string => (typeof v === "string" ? v.trim() : "");

function labelOf(form: PublicForm, field: string, value: string): string {
  if (!value) return "";
  const f = form.fields.find((x) => x.name === field);
  return f?.options?.find((o) => o.value === value)?.label ?? value;
}

export async function sendLeadEmails(
  payload: Payload,
  args: {
    form: PublicForm;
    answers: Record<string, AnswerValue>;
    attribution: Attribution;
    channel: Channel;
    clientId?: number | string;
    brouillon?: boolean;
  },
): Promise<void> {
  const { form, answers, attribution, channel, clientId, brouillon } = args;

  const besoinValues = Array.isArray(answers.besoins) ? answers.besoins : [];
  const ctx = {
    civilite: labelOf(form, "genre", str(answers.genre)),
    nom: str(answers.nom),
    companyName: str(answers.company_name),
    fonction: labelOf(form, "fonction", str(answers.fonction)),
    effectif: labelOf(form, "collaborateurs", str(answers.collaborateurs)),
    besoins: besoinValues.map((v) => labelOf(form, "besoins", v)).filter(Boolean),
    besoinValues,
    email: str(answers.email).toLowerCase() || undefined,
  };

  if (ctx.email) {
    const mail = leadConfirmationEmail(ctx);
    await payload
      .sendEmail({ to: ctx.email, subject: mail.subject, html: mail.html, text: mail.text })
      .then(() => payload.logger.info(`[formulaires] accusé de réception envoyé à ${ctx.email}.`))
      .catch((e) => payload.logger.error(`[formulaires] accusé de réception à ${ctx.email} échoué : ${e}`));
  }

  const notice = newLeadNoticeEmail({
    ...ctx,
    telephone: str(answers.telephone),
    pays: labelOf(form, "pays", str(answers.pays)),
    canal: channelLabel(channel),
    page: attribution.sourcePagePath,
    campagne: attribution.utmCampaign,
    variante: attribution.lpVariant,
    clientId,
    brouillon,
  });

  await payload
    .sendEmail({
      to: SUPPORT_NOTIFY_EMAIL,
      subject: notice.subject,
      html: notice.html,
      text: notice.text,
    })
    .catch((e) => payload.logger.error(`[formulaires] alerte interne échouée : ${e}`));
}
