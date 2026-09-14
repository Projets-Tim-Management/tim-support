import { BRAND, FONT, SITE_URL, escape, paragraph, shell } from "@/core/lib/email-template";

/**
 * « C'est disponible » — l'e-mail au client qui avait demandé un développement.
 *
 * Il part depuis la fenêtre « Prévenir les demandeurs » de la fiche du
 * développement (voir admin/AnnounceField), quand on le passe dans un statut
 * qui porte ce rôle — un message PAR destinataire, jamais de copie, avec
 * l'intitulé que l'équipe a relu dans la fenêtre.
 *
 * Charte CLIENT (`shell`) : le destinataire est un prospect ou un client, pas
 * l'équipe. Une seule demande dans le message — organiser une démo ou un
 * échange — dite à la première personne du pluriel : c'est TIM qui écrit, le
 * partenaire n'est pas nommé (demandé le 11/09/2026). La réponse, elle, lui
 * arrive (Reply-To posé à l'envoi).
 *
 * Pur : la fabrication se teste sans base ni envoi.
 */

export type BuiltEmail = { subject: string; text: string; html: string };

export type AnnounceContext = {
  /** Titre du développement, tel que saisi — c'est ce que le client reconnaîtra. */
  title: string;
  /** Prénom du référent (compte espace client), s'il est connu. */
  contactFirstName?: string | null;
  /** Lien de réservation du partenaire (réglage « lien externe »), s'il en a un. */
  bookingUrl?: string | null;
  /** Fiche du site support qui documente la fonctionnalité, s'il y en a une. */
  featureSlug?: string | null;
  featureTitle?: string | null;
  recipientEmail?: string;
};

const TEAM = "L'équipe TIM Management";

const button = (label: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr><td>
     <a href="${url}" style="display:inline-block;padding:13px 26px;background:${BRAND};border-radius:9px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;">${escape(label)}</a>
   </td></tr></table>`;

export function buildAnnounceEmail(ctx: AnnounceContext): BuiltEmail {
  const hello = ctx.contactFirstName?.trim() ? `Bonjour ${ctx.contactFirstName.trim()},` : "Bonjour,";
  const featureUrl = ctx.featureSlug ? `${SITE_URL}/features/${ctx.featureSlug}` : null;

  // Le corps, en deux temps : la bonne nouvelle, puis la proposition — avec
  // un bouton de réservation si le partenaire en a un, sinon la réponse.
  const bonneNouvelle = `Vous souhaitiez la fonctionnalité « ${ctx.title} » : bonne nouvelle, elle est prête ! Notre équipe technique l'a réalisée et elle est disponible dès aujourd'hui dans TIM Management.`;
  const proposition = ctx.bookingUrl
    ? "Pour la découvrir, on vous propose une démonstration de 20 minutes ou un simple échange téléphonique, quand ça vous arrange : réservez un créneau ci-dessous, ou répondez à cet e-mail."
    : "Pour la découvrir, on vous propose une démonstration de 20 minutes ou un simple échange téléphonique, quand ça vous arrange : répondez simplement à cet e-mail.";

  const subject = `Bonne nouvelle : « ${ctx.title} » est prête !`;

  const text = [
    hello,
    "",
    bonneNouvelle,
    ...(featureUrl ? ["", `Le détail est sur notre site support : ${featureUrl}`] : []),
    "",
    proposition,
    ...(ctx.bookingUrl ? ["", `Réserver une démo : ${ctx.bookingUrl}`] : []),
    "",
    "À très vite,",
    TEAM,
  ].join("\n");

  const html = shell({
    heading: "Bonne nouvelle !",
    // `shell` insère le pré-en-tête tel quel : on l'échappe ici, comme le reste.
    preheader: escape(`« ${ctx.title} » est prête — on vous la montre ?`),
    recipientEmail: ctx.recipientEmail,
    bodyHtml:
      paragraph(escape(hello)) +
      paragraph(
        `Vous souhaitiez la fonctionnalité <strong>« ${escape(ctx.title)} »</strong> : bonne nouvelle, <strong>elle est prête !</strong> Notre équipe technique l'a réalisée et elle est disponible dès aujourd'hui dans TIM Management.`,
      ) +
      (featureUrl
        ? paragraph(
            `Le détail est sur notre site support : <a href="${featureUrl}" style="color:${BRAND};font-weight:700;text-decoration:none;">${escape(
              ctx.featureTitle?.trim() || ctx.title,
            )}</a>.`,
          )
        : "") +
      paragraph(escape(proposition)) +
      (ctx.bookingUrl ? button("Réserver une démo", ctx.bookingUrl) : "") +
      `<p style="margin:18px 0 0;font-family:${FONT};font-size:15px;color:#4a4d57;">À très vite,<br>${TEAM}</p>`,
  });

  return { subject, text, html };
}
