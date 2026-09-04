/**
 * Charte des e-mails transactionnels TIM — HTML « email-safe » (styles inline,
 * tables), utilisable par tous les modules.
 *
 * `shell()` : en-tête lavande + bandeau titré + corps + encadré « Besoin d'aide ? »
 * + réseaux sociaux + pied de page foncé. C'est l'habillage des messages
 * adressés aux CLIENTS et aux PARTENAIRES.
 *
 * `internalNotice()` : enveloppe sobre, sans habillage marketing, pour les
 * alertes internes. Une notification qui dit « untel attend une décision » n'a
 * pas besoin de réseaux sociaux — elle a besoin d'un lien.
 *
 * ⚠️ Rien ici ne dépend d'un module métier : ni ticket, ni parcours. Les
 * gabarits spécifiques vivent dans leur module et appellent ces briques.
 */

export const BRAND = "#fe5464"; // rouge TIM (liens/accents)
export const INK = "#22242c";
/**
 * Texte courant. NOIR, comme les titres : du gris sur blanc se lit mal, et rien
 * ne justifie de rendre moins lisible le contenu même du message. `MUTED` reste
 * réservé au vraiment secondaire — mentions de pied, adresses, dates.
 */
export const BODY = "#22242c";
export const MUTED = "#8a8f98";
export const BORDER = "#e6e8ef";
export const OUTER = "#eef0f7"; // fond général
const HEADER_BG = "#f3f3fc"; // en-tête (lavande très clair)
const BANNER = "#ccd0f6"; // bandeau titre (périwinkle)
const HELP_BG = "#e9eafb"; // encadré « besoin d'aide »
const NAVY = "#2b3150"; // pied de page foncé
const NAVY_SOFT = "#b8bcd6"; // texte secondaire sur fond foncé
export const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://support.tim-management.co";

/**
 * Lien vers un écran du back-office, depuis un e-mail.
 *
 * Partagé : chaque module qui le redéfinissait repartait de la même variable
 * d'environnement, avec sa propre valeur de repli — trois copies, trois
 * occasions de diverger le jour où le domaine change.
 */
export const adminUrl = (path: string): string => `${SITE_URL.replace(/\/$/, "")}/admin${path}`;
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

/**
 * Neutralise une valeur saisie avant de la poser dans du HTML.
 *
 * Le guillemet compte autant que le chevron : ces gabarits interpolent aussi à
 * l'INTÉRIEUR d'attributs (`title`, `alt`, `href`), et une valeur qui contient
 * un guillemet y ferme l'attribut pour en ouvrir un autre. L'esperluette passe
 * en premier, sinon elle ré-échapperait les entités produites juste après.
 */
export const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function socialRow(): string {
  const items = SOCIAL.map(
    (s) =>
      `<a href="${s.url}" title="${s.label}" style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;background:${NAVY};border-radius:9px;color:#ffffff;font-family:${FONT};font-weight:800;font-size:15px;text-decoration:none;margin:0 5px;">${s.glyph}</a>`,
  ).join("");
  return `<tr><td align="center" style="padding:22px 28px;background:#ffffff;">${items}</td></tr>`;
}

/** Enveloppe HTML commune (en-tête + bandeau titre + corps + aide + social + pied). */
export function shell(opts: {
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

/**
 * Enveloppe des messages MARKETING — les séquences de relance.
 *
 * Même charte que `shell()` (en-tête lavande, encadré d'aide, réseaux, pied
 * marine), mais un autre rythme : un hero qui annonce le sujet, des bandes
 * d'images, un seul bouton d'action, et surtout un lien de DÉSINSCRIPTION.
 *
 * Gabarit séparé plutôt qu'option de `shell()` : les e-mails de service ne
 * doivent jamais hériter par accident d'un lien de désinscription — un client
 * qui se désinscrirait depuis un accusé de réception cesserait de recevoir ce
 * qu'il a lui-même demandé.
 */
export function marketingShell(opts: {
  /** Titre du hero, en gros et en gras. */
  heading: string;
  preheader?: string;
  bodyHtml: string;
  /** Image du hero, à droite du titre. Le hero tient sans elle. */
  heroImageUrl?: string;
  recipientEmail?: string;
  /** Obligatoire : un message commercial sans sortie est une plainte en attente. */
  unsubscribeUrl: string;
}): string {
  const { bodyHtml, heroImageUrl, recipientEmail, unsubscribeUrl } = opts;
  /**
   * Titre et pré-en-tête viennent de la BASE : ils sont saisis en back-office.
   * Pas une faille — personne d'hostile n'écrit là — mais une esperluette dans
   * « Heures & absences » suffit à produire du HTML invalide, et un guillemet
   * dans un attribut casse la mise en page chez la moitié des messageries.
   */
  const heading = escape(opts.heading);
  const preheader = escape(opts.preheader ?? "");

  const hero = heroImageUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
         <td width="52%" style="padding:34px 8px 34px 30px;vertical-align:middle;">
           <h1 style="margin:0;font-family:${FONT};font-size:30px;line-height:1.1;color:${INK};font-weight:800;">${heading}</h1>
         </td>
         <td width="48%" style="padding:16px 16px 16px 8px;vertical-align:middle;">
           <img src="${escape(heroImageUrl)}" alt="" width="270" style="display:block;width:100%;max-width:270px;border:0;border-radius:12px;">
         </td>
       </tr></table>`
    : `<div style="padding:34px 30px;"><h1 style="margin:0;font-family:${FONT};font-size:30px;line-height:1.1;color:${INK};font-weight:800;">${heading}</h1></div>`;

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

      <tr><td align="center" style="padding:24px 28px 20px;background:${HEADER_BG};">
        <img src="${LOGO_URL}" alt="TIM" width="96" height="44" style="display:block;border:0;outline:none;text-decoration:none;height:44px;width:auto;">
      </td></tr>

      <tr><td style="background:${BANNER};">${hero}</td></tr>

      <tr><td style="padding:28px 30px 12px;font-family:${FONT};">${bodyHtml}</td></tr>

      <tr><td style="padding:22px 30px;background:${HELP_BG};">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:17px;font-weight:800;color:${INK};">Besoin d'aide ?</p>
        <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${BODY};">Notre équipe est disponible si vous avez la moindre question : <a href="mailto:support@tim-management.co" style="color:${BRAND};font-weight:700;text-decoration:none;">support@tim-management.co</a> · <strong>09 72 12 59 03</strong></p>
      </td></tr>

      ${socialRow()}

      <tr><td style="padding:28px 30px;background:${NAVY};" align="center">
        <p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.5;color:#ffffff;">Cordialement,<br><strong>Votre équipe ${COMPANY_NAME}</strong></p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid rgba(255,255,255,.15);padding-top:16px;" align="center">
          <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;letter-spacing:.05em;color:${NAVY_SOFT};text-transform:uppercase;font-weight:700;">${COMPANY_NAME}</p>
          <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;color:${NAVY_SOFT};">${COMPANY_ADDRESS}</p>
          ${recipientEmail ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:11px;color:${NAVY_SOFT};">Cet e-mail a été envoyé à ${escape(recipientEmail)}</p>` : ""}
          <p style="margin:0;font-family:${FONT};font-size:12px;"><a href="${unsubscribeUrl}" style="color:#ffffff;text-decoration:underline;font-weight:700;">Se désabonner</a></p>
        </td></tr></table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * Enveloppe SOBRE — un message qui doit ressembler à un e-mail écrit à la main.
 *
 * Ni logo, ni bandeau, ni bouton, ni pied de page. C'est le point, et pas une
 * économie de moyens : une relance qui demande « votre projet est-il toujours
 * d'actualité ? » perd tout son sens dans un habillage de campagne — et un
 * encart « Ne plus recevoir ces messages » sous la signature dit au lecteur
 * qu'il est sur une liste, pas dans une conversation.
 *
 * ⚠️ La désinscription n'a pas disparu pour autant. Elle passe par les en-têtes
 * `List-Unsubscribe` (posés à l'envoi par `sequence-send`), que Gmail, Outlook
 * et Apple Mail affichent EUX-MÊMES en haut du message. Le moyen de s'opposer
 * reste donc offert à chaque envoi, en un clic, sans rien peser dans le texte.
 * Et une réponse suffit : elle arrête la séquence.
 *
 * La signature est fournie DÉJÀ RENDUE : elle est fabriquée par
 * `modules/partner/lib/signature`, à partir de la fiche du partenaire. Il n'y en
 * a qu'une dans le logiciel, et elle est la même partout.
 */
export function plainShell(opts: {
  preheader?: string;
  bodyHtml: string;
  /** Formule de politesse, avant la signature. */
  closing?: string;
  /** Signature déjà rendue (voir renderSignature). Vide = pas de bloc. */
  signatureHtml?: string;
}): string {
  const { bodyHtml, closing, signatureHtml } = opts;
  const preheader = escape(opts.preheader ?? "");
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
  <tr><td style="padding:26px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="font-family:${font};font-size:15px;line-height:1.7;color:${INK};">
        ${bodyHtml}
        ${closing ? `<p style="margin:26px 0 20px;font-family:${font};font-size:15px;line-height:1.7;color:${INK};">${escape(closing)}</p>` : ""}
        ${signatureHtml ?? ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};">${text}</p>`;
}

/** Encadré mettant en valeur un numéro de suivi. */
export function refBox(label: string, value: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
    <tr><td style="padding:14px 20px;background:${OUTER};border:1px solid ${BORDER};border-radius:10px;">
      <span style="font-family:${FONT};font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${label}</span><br>
      <span style="font-family:${FONT};font-size:24px;font-weight:800;color:${BRAND};">${value}</span>
    </td></tr></table>`;
}

/**
 * Enveloppe des alertes INTERNES : sobre, sans habillage marketing.
 *
 * Une notification qui dit « untel attend une décision » n'a pas besoin de
 * réseaux sociaux ni de pied de page corporate — elle a besoin des faits et
 * d'un lien pour agir.
 *
 * ⚠️ TOUT LE TEXTE REÇU EST ÉCHAPPÉ ICI, et les appelants passent donc des
 * valeurs BRUTES.
 *
 * L'échappement vivait auparavant chez chaque appelant : deux d'entre eux
 * l'avaient, quatre l'avaient oublié, et il n'existait aucun endroit d'où le
 * constater. Or ces messages affichent exactement ce qu'un partenaire a saisi —
 * raison sociale, adresse de facturation, liste de contrôle. « Dupont & Fils »
 * suffisait à produire un HTML invalide dans le message même qui sert à trancher
 * un Go/No-Go.
 *
 * Les URL ne sont pas échappées : elles ne viennent jamais d'une saisie, elles
 * sont fabriquées par `adminUrl` à partir d'identifiants.
 */
export function internalNotice(args: {
  heading: string;
  /** Libellé et valeur, en TEXTE BRUT — l'échappement se fait ici. */
  rows: Array<[string, string]>;
  message?: string;
  cta: { label: string; url: string };
  /** Liens secondaires en pied (fiche client, fiche partenaire…). */
  links?: Array<{ label: string; url: string }>;
}): string {
  const { rows, cta, links = [] } = args;
  const heading = escape(args.heading);
  const message = args.message ? escape(args.message) : undefined;
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 14px 3px 0;font-family:${FONT};font-size:13px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escape(k)}</td><td style="padding:3px 0;font-family:${FONT};font-size:13px;color:${INK};">${escape(v)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:${OUTER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
    <tr><td style="padding:22px 24px;">
      <p style="margin:0 0 16px;font-family:${FONT};font-size:18px;font-weight:800;color:${INK};">${heading}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${rowsHtml}</table>
      ${
        message
          ? `<div style="margin:0 0 18px;padding:14px 16px;background:${OUTER};border:1px solid ${BORDER};border-radius:8px;font-family:${FONT};font-size:14px;line-height:1.55;color:${BODY};white-space:pre-wrap;">${message}</div>`
          : ""
      }
      <a href="${cta.url}" style="display:inline-block;padding:11px 22px;background:${BRAND};border-radius:8px;color:#ffffff;font-family:${FONT};font-size:14px;font-weight:700;text-decoration:none;">${escape(cta.label)}</a>
      ${
        links.length
          ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;color:${MUTED};">${links
              .map((l) => `<a href="${l.url}" style="color:${MUTED};text-decoration:underline;">${escape(l.label)}</a>`)
              .join(" · ")}</p>`
          : ""
      }
    </td></tr>
  </table>
</body></html>`;
}
