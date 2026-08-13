/**
 * Gabarits d'e-mails du module SUPPORT (tickets).
 *
 * La charte visuelle est commune à tous les modules : voir
 * `core/lib/email-template`. Ici ne vivent que les messages propres aux tickets.
 */
import {
  FONT,
  MUTED,
  SITE_URL,
  escape,
  internalNotice,
  paragraph,
  refBox,
  shell,
} from "@/core/lib/email-template";

/**
 * Destinataire des alertes internes (nouveau ticket / réponse client). Par
 * défaut on notifie l'adresse d'envoi (support@…) ; surchargeable via
 * TICKETS_NOTIFY_EMAIL si l'équipe veut router ailleurs.
 */
export const SUPPORT_NOTIFY_EMAIL =
  process.env.TICKETS_NOTIFY_EMAIL ||
  process.env.EMAIL_FROM ||
  "support@tim-management.co";

// ─── Templates ───────────────────────────────────────────────────────────────

export function ticketConfirmationEmail(args: {
  name?: string;
  email?: string;
  subject: string;
  number: number;
}) {
  const { name, email, subject, number } = args;
  const hello = name ? `Bonjour ${escape(name)},` : "Bonjour,";
  return {
    subject: `Votre demande #${number} a bien été reçue`,
    html: shell({
      heading: "Votre demande a bien été reçue",
      preheader: `Demande #${number} — nous la prenons en charge.`,
      recipientEmail: email,
      bodyHtml:
        paragraph(hello) +
        paragraph(
          `Nous avons bien reçu votre demande <strong>« ${escape(subject)} »</strong>. Notre équipe la prend en charge dans les meilleurs délais.`,
        ) +
        refBox("Numéro de suivi", `#${number}`) +
        paragraph(`Vous pouvez conserver ce numéro pour tout échange à ce sujet.`),
    }),
    text: `${hello}\n\nNous avons bien reçu votre demande « ${subject} » (n° ${number}). Notre équipe la prend en charge dans les meilleurs délais.\n\n— L'équipe TIM Support`,
  };
}

/**
 * Réponse du support au client (envoyée depuis la vue ticket de l'admin).
 * Le corps est le message rédigé par le support — il contient déjà sa formule
 * d'appel : on ne rajoute donc PAS de « Bonjour … » automatique.
 */
export function ticketReplyEmail(args: {
  name?: string;
  email?: string;
  subject: string;
  number: number;
  body: string;
}) {
  const { email, subject, number, body } = args;
  const paragraphs = escape(body)
    .split(/\n{2,}/)
    .map((block) => paragraph(block.replace(/\n/g, "<br>")))
    .join("");
  return {
    subject: `Re: ${subject} (demande #${number})`,
    html: shell({
      heading: "Réponse à votre demande",
      preheader: `À propos de votre demande #${number}`,
      recipientEmail: email,
      bodyHtml:
        paragraphs +
        `<p style="margin:18px 0 0;font-family:${FONT};font-size:12px;color:${MUTED};">En réponse à votre demande n° ${number}.</p>`,
    }),
    text: `${body}\n\n— L'équipe TIM Support (demande n° ${number})`,
  };
}

// ─── Alertes internes (équipe support) ──────────────────────────────────────
// E-mails volontairement simples (pas d'habillage marketing) : ils préviennent
// l'équipe qu'un ticket demande une action et offrent un lien direct vers la
// fiche dans le back-office. Envoyés à SUPPORT_NOTIFY_EMAIL.



/** Notification interne : un nouveau ticket vient d'être créé. */
export function newTicketNoticeEmail(args: {
  id: number | string;
  number: number;
  subject: string;
  type: string;
  name?: string;
  email: string;
  service?: string;
  url?: string;
  description: string;
}) {
  const { id, number, subject, type, name, email, service, url, description } = args;
  const excerpt = description.slice(0, 2000);
  return {
    subject: `🎫 Nouveau ticket #${number} — ${subject}`,
    html: internalNotice({
      heading: `Nouveau ticket #${number}`,
      rows: [
        ["Sujet", escape(subject)],
        ["De", `${escape(name || "—")} &lt;${escape(email)}&gt;`],
        ["Type", escape(type)],
        ["Service", escape(service || "—")],
        ["Page", escape(url || "—")],
      ],
      message: escape(excerpt),
      cta: { label: "Ouvrir le ticket", url: `${SITE_URL}/admin/collections/tickets/${id}` },
    }),
    text: `Nouveau ticket #${number}\n${subject}\n\nDe : ${name || "—"} <${email}>\nType : ${type}\nService : ${service ?? "—"}\nPage : ${url || "—"}\n\n${excerpt}\n\nOuvrir : ${SITE_URL}/admin/collections/tickets/${id}`,
  };
}

/**
 * Notification interne : le client a répondu à un ticket existant.
 *
 * `journey` est renseigné quand la réponse vient d'un e-mail de phase de test.
 * L'information est mise en tête de l'alerte, et pas seulement dans le ticket :
 * un prospect en essai qui répond est une opportunité qui se refroidit vite, et
 * celui qui lit l'alerte doit le savoir avant d'ouvrir quoi que ce soit.
 */
export function ticketReplyNoticeEmail(args: {
  id: number | string;
  number: number;
  subject: string;
  name?: string;
  email: string;
  body: string;
  journey?: { runId: number | string; clientName?: string | null };
}) {
  const { id, number, subject, name, email, body, journey } = args;
  const excerpt = body.slice(0, 2000);
  const ticketUrl = `${SITE_URL}/admin/collections/tickets/${id}`;
  const runUrl = journey ? `${SITE_URL}/admin/collections/journey-runs/${journey.runId}` : null;
  const tag = journey ? "🧪 Phase de test — " : "";
  return {
    subject: `💬 ${tag}Réponse au ticket #${number} — ${subject}`,
    html: internalNotice({
      heading: journey
        ? `Réponse pendant une phase de test — ticket #${number}`
        : `Nouvelle réponse — ticket #${number}`,
      rows: [
        ...(journey
          ? ([["Phase de test", escape(journey.clientName || "—")]] as Array<[string, string]>)
          : []),
        ["Sujet", escape(subject)],
        ["De", `${escape(name || "—")} &lt;${escape(email)}&gt;`],
      ],
      message: escape(excerpt),
      cta: { label: "Ouvrir le ticket", url: ticketUrl },
      ...(runUrl ? { links: [{ label: "Voir le parcours", url: runUrl }] } : {}),
    }),
    text:
      `${journey ? "[Phase de test] " : ""}Nouvelle réponse au ticket #${number} (${subject})\n` +
      `De : ${name || "—"} <${email}>\n` +
      `${journey ? `Phase de test : ${journey.clientName || "—"}\n` : ""}` +
      `\n${excerpt}\n\nOuvrir : ${ticketUrl}` +
      `${runUrl ? `\nParcours : ${runUrl}` : ""}`,
  };
}
