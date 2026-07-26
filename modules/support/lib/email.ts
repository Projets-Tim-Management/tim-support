/**
 * Templates d'e-mails transactionnels — HTML « email-safe » (styles inline,
 * tables), aux couleurs de la marque TIM. Sert les confirmations de tickets,
 * les réponses du support et les notifications internes.
 *
 * 👉 Design centralisé dans shell() : en-tête lavande + bandeau titré + corps +
 * encadré « Besoin d'aide ? » (coordonnées) + réseaux sociaux + pied de page
 * foncé (signature + adresse). Inspiré des campagnes TIM.
 */

const BRAND = "#fe5464"; // rouge TIM (liens/accents)
const INK = "#22242c";
const BODY = "#4a4d57";
const MUTED = "#8a8f98";
const BORDER = "#e6e8ef";
const OUTER = "#eef0f7"; // fond général
const HEADER_BG = "#f3f3fc"; // en-tête (lavande très clair)
const BANNER = "#ccd0f6"; // bandeau titre (périwinkle)
const HELP_BG = "#e9eafb"; // encadré « besoin d'aide »
const NAVY = "#2b3150"; // pied de page foncé
const NAVY_SOFT = "#b8bcd6"; // texte secondaire sur fond foncé
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://support.tim-management.co";
const REPLY_ENABLED = Boolean(process.env.REPLY_DOMAIN);
const LOGO_URL =
  process.env.EMAIL_LOGO_URL ||
  "https://ytlg8jezeqmgptjq.public.blob.vercel-storage.com/email/logo-tim-support.png";

// Société (surchargable par variables d'env).
const COMPANY_NAME = "TIM Management";
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "44 quai Jayr, 69009 Lyon";

// Réseaux sociaux (liens réels TIM ; surchargables par variables d'env).
const SOCIAL: Array<{ label: string; glyph: string; url: string }> = [
  {
    label: "Facebook",
    glyph: "f",
    url:
      process.env.SOCIAL_FACEBOOK ||
      "https://www.facebook.com/people/Tim-Management/100089093203235/",
  },
  {
    label: "LinkedIn",
    glyph: "in",
    url: process.env.SOCIAL_LINKEDIN || "https://www.linkedin.com/company/76087369/",
  },
  {
    label: "Instagram",
    glyph: "ig",
    url: process.env.SOCIAL_INSTAGRAM || "https://www.instagram.com/tim.management.co/",
  },
];

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function socialRow(): string {
  const items = SOCIAL.map(
    (s) =>
      `<a href="${s.url}" title="${s.label}" style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;background:${NAVY};border-radius:9px;color:#ffffff;font-family:${FONT};font-weight:800;font-size:15px;text-decoration:none;margin:0 5px;">${s.glyph}</a>`,
  ).join("");
  return `<tr><td align="center" style="padding:22px 28px;background:#ffffff;">${items}</td></tr>`;
}

/** Enveloppe HTML commune (en-tête + bandeau titre + corps + aide + social + pied). */
function shell(opts: {
  heading: string;
  preheader?: string;
  bodyHtml: string;
  recipientEmail?: string;
}): string {
  const { heading, preheader = "", bodyHtml, recipientEmail } = opts;
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${OUTER};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${OUTER};">
  <tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:18px;overflow:hidden;">

      <!-- En-tête : logo -->
      <tr><td align="center" style="padding:24px 28px 20px;background:${HEADER_BG};">
        <img src="${LOGO_URL}" alt="TIM" width="96" height="44" style="display:block;border:0;outline:none;text-decoration:none;height:44px;width:auto;">
      </td></tr>

      <!-- Bandeau titre -->
      <tr><td style="padding:30px 30px;background:${BANNER};">
        <h1 style="margin:0;font-family:${FONT};font-size:26px;line-height:1.2;color:${INK};font-weight:800;">${heading}</h1>
      </td></tr>

      <!-- Corps -->
      <tr><td style="padding:28px 30px 10px;font-family:${FONT};">
        ${bodyHtml}
      </td></tr>

      <!-- Besoin d'aide ? -->
      <tr><td style="padding:22px 30px;background:${HELP_BG};">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:17px;font-weight:800;color:${INK};">Besoin d'aide ?</p>
        <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${BODY};">Notre équipe support est disponible si vous avez la moindre question${
          REPLY_ENABLED
            ? " — vous pouvez <strong>répondre directement à cet e-mail</strong>"
            : ` via le <a href="${SITE_URL}/contact" style="color:${BRAND};font-weight:700;text-decoration:none;">centre d'aide</a>`
        }.</p>
      </td></tr>

      <!-- Réseaux sociaux -->
      ${socialRow()}

      <!-- Pied de page -->
      <tr><td style="padding:28px 30px;background:${NAVY};" align="center">
        <p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.5;color:#ffffff;">Cordialement,<br><strong>Votre équipe ${COMPANY_NAME}</strong></p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid rgba(255,255,255,.15);padding-top:16px;" align="center">
          <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;letter-spacing:.05em;color:${NAVY_SOFT};text-transform:uppercase;font-weight:700;">${COMPANY_NAME}</p>
          <p style="margin:0;font-family:${FONT};font-size:12px;color:${NAVY_SOFT};">${COMPANY_ADDRESS}</p>
          ${
            recipientEmail
              ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:11px;color:${NAVY_SOFT};">Cet e-mail a été envoyé à ${escape(recipientEmail)} · <a href="${SITE_URL}/contact" style="color:${NAVY_SOFT};text-decoration:underline;">centre d'aide</a></p>`
              : ""
          }
        </td></tr></table>
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
    <tr><td style="padding:14px 20px;background:${OUTER};border:1px solid ${BORDER};border-radius:10px;">
      <span style="font-family:${FONT};font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${label}</span><br>
      <span style="font-family:${FONT};font-size:24px;font-weight:800;color:${BRAND};">${value}</span>
    </td></tr></table>`;
}

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
