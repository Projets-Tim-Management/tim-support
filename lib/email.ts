/**
 * Templates d'e-mails transactionnels — HTML « email-safe » (styles inline,
 * tables), aux couleurs de la marque TIM. Sert les confirmations de tickets et
 * les notifications internes.
 */

const BRAND = "#fe5464";
const INK = "#2b2b2b";
const BODY = "#505050";
const MUTED = "#8a8f98";
const BORDER = "#e6e8ec";
const SURFACE = "#f6f7f9";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://support.tim-management.co";
// Logo hébergé sur le CDN Blob (URL publique, PNG email-safe).
const LOGO_URL =
  process.env.EMAIL_LOGO_URL ||
  "https://ytlg8jezeqmgptjq.public.blob.vercel-storage.com/email/logo-tim-support.png";

/** Enveloppe HTML commune (en-tête marque + corps + pied de page). */
function shell(opts: { heading: string; preheader?: string; bodyHtml: string }): string {
  const { heading, preheader = "", bodyHtml } = opts;
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${SURFACE};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
      <tr><td style="padding:22px 28px;border-bottom:1px solid ${BORDER};">
        <img src="${LOGO_URL}" alt="TIM Support" width="96" height="48" style="display:block;border:0;outline:none;text-decoration:none;height:48px;width:auto;">
      </td></tr>
      <tr><td style="padding:28px;font-family:${FONT};">
        <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:${INK};font-weight:700;">${heading}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid ${BORDER};background:${SURFACE};">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">Cet e-mail est automatique, merci de <strong>ne pas y répondre</strong>. Pour toute question, contactez-nous via le <a href="${SITE_URL}/contact" style="color:${BRAND};text-decoration:none;">centre d'aide</a> en indiquant votre numéro de suivi.</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;color:${MUTED};">TIM Management — Centre d'aide</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};">${text}</p>`;
}

/** Encadré mettant en valeur un numéro de suivi. */
function refBox(label: string, value: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
    <tr><td style="padding:14px 20px;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;">
      <span style="font-family:${FONT};font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${label}</span><br>
      <span style="font-family:${FONT};font-size:24px;font-weight:800;color:${BRAND};">${value}</span>
    </td></tr></table>`;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ─── Templates ───────────────────────────────────────────────────────────────

export function ticketConfirmationEmail(args: { name?: string; subject: string; number: number }) {
  const { name, subject, number } = args;
  const hello = name ? `Bonjour ${escape(name)},` : "Bonjour,";
  return {
    subject: `Votre demande #${number} a bien été reçue`,
    html: shell({
      heading: "Votre demande a bien été reçue",
      preheader: `Demande #${number} — nous la prenons en charge.`,
      bodyHtml:
        paragraph(hello) +
        paragraph(`Nous avons bien reçu votre demande <strong>« ${escape(subject)} »</strong>. Notre équipe la prend en charge dans les meilleurs délais.`) +
        refBox("Numéro de suivi", `#${number}`) +
        paragraph(`Vous pouvez conserver ce numéro pour tout échange à ce sujet.`),
    }),
    text: `${hello}\n\nNous avons bien reçu votre demande « ${subject} » (n° ${number}). Notre équipe la prend en charge dans les meilleurs délais.\n\n— L'équipe TIM Support`,
  };
}

export function ticketAdminNotificationEmail(args: {
  number: number;
  subject: string;
  type: string;
  name?: string;
  email: string;
  service?: string;
  url?: string;
  description: string;
}) {
  const { number, subject, type, name, email, service, url, description } = args;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 0;font-family:${FONT};font-size:13px;color:${MUTED};width:110px;">${k}</td><td style="padding:4px 0;font-family:${FONT};font-size:13px;color:${BODY};">${v}</td></tr>`;
  return {
    subject: `Nouveau ticket #${number} — ${subject}`,
    html: shell({
      heading: `Nouveau ticket #${number}`,
      preheader: escape(subject),
      bodyHtml:
        paragraph(`<strong>${escape(subject)}</strong>`) +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${
          row("Type", escape(type)) +
          row("De", `${escape(name || "—")} &lt;${escape(email)}&gt;`) +
          row("Service", escape(service || "—")) +
          row("Page", escape(url || "—"))
        }</table>` +
        paragraph(escape(description).replace(/\n/g, "<br>")),
    }),
    text: `Nouveau ticket #${number}\n${subject}\n\nType : ${type}\nDe : ${name || "—"} <${email}>\nService : ${service ?? "—"}\nPage : ${url || "—"}\n\n${description}`,
  };
}
