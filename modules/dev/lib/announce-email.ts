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
 * Les textes et l'image se reprennent en back-office (Développements → Paramètres →
 * Modèles d'e-mail → « C'est disponible », global `dev-announce-email`). Un
 * champ vide = le texte d'origine ci-dessous : vider un champ ramène
 * l'original, et rien ne change tant que personne n'écrit.
 *
 * Pur : la fabrication se teste sans base ni envoi.
 */

export type BuiltEmail = { subject: string; text: string; html: string };

/** Les textes modifiables. Variables : {{titre}} ; **gras** pour mettre en avant. */
export type AnnounceTexts = {
  subject?: string | null;
  heading?: string | null;
  preheader?: string | null;
  intro?: string | null;
  featureLead?: string | null;
  proposalWithBooking?: string | null;
  proposalWithoutBooking?: string | null;
  ctaLabel?: string | null;
  signoff?: string | null;
};

export const ANNOUNCE_VARIABLES = [{ key: "titre", label: "Titre du développement" }];

/** Le texte d'origine — affiché comme valeur par défaut dans le back-office. */
export const DEFAULT_ANNOUNCE_TEXTS: Required<{ [K in keyof AnnounceTexts]: string }> = {
  subject: "Bonne nouvelle : « {{titre}} » est prête !",
  heading: "Bonne nouvelle !",
  preheader: "« {{titre}} » est prête — on vous la montre ?",
  intro:
    "Vous souhaitiez la fonctionnalité **« {{titre}} »** : bonne nouvelle, **elle est prête !** Notre équipe technique l'a réalisée et elle est disponible dès aujourd'hui dans TIM Management.",
  featureLead: "Le détail est sur notre site support :",
  proposalWithBooking:
    "Pour la découvrir, on vous propose une démonstration de 20 minutes ou un simple échange téléphonique, quand ça vous arrange : réservez un créneau ci-dessous, ou répondez à cet e-mail.",
  proposalWithoutBooking:
    "Pour la découvrir, on vous propose une démonstration de 20 minutes ou un simple échange téléphonique, quand ça vous arrange : répondez simplement à cet e-mail.",
  ctaLabel: "Réserver une démo",
  signoff: "À très vite,\nL'équipe TIM Management",
};

/**
 * Visuel du bandeau par défaut (fusée sur vague), servi par le site depuis
 * `public/email/`. Remplacé par l'image choisie en back-office, s'il y en a une.
 */
export const DEFAULT_ANNOUNCE_HERO = `${SITE_URL}/email/annonce-dev.png`;

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
  /** Textes repris en back-office ; vides ou absents = texte d'origine. */
  texts?: AnnounceTexts | null;
  /** Image du bandeau choisie en back-office (URL absolue) ; absente = la fusée. */
  heroImageUrl?: string | null;
};

const button = (label: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr><td>
     <a href="${url}" style="display:inline-block;padding:13px 26px;background:${BRAND};border-radius:9px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;">${escape(label)}</a>
   </td></tr></table>`;

/** Échappe PUIS met en gras : le texte saisi ne porte jamais de HTML. */
const richHtml = (s: string) => escape(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1");

export function buildAnnounceEmail(ctx: AnnounceContext): BuiltEmail {
  const fill = (s: string) => s.replace(/\{\{\s*titre\s*\}\}/g, ctx.title);
  const t = (key: keyof AnnounceTexts) => fill(ctx.texts?.[key]?.trim() || DEFAULT_ANNOUNCE_TEXTS[key]);
  const oneLine = (s: string) => plain(s).replace(/\s*\n\s*/g, " ").trim();

  const hello = ctx.contactFirstName?.trim() ? `Bonjour ${ctx.contactFirstName.trim()},` : "Bonjour,";
  const featureUrl = ctx.featureSlug ? `${SITE_URL}/features/${ctx.featureSlug}` : null;

  // Le corps, en deux temps : la bonne nouvelle, puis la proposition — avec
  // un bouton de réservation si le partenaire en a un, sinon la réponse.
  const intro = t("intro");
  const proposition = t(ctx.bookingUrl ? "proposalWithBooking" : "proposalWithoutBooking");
  const featureLead = t("featureLead");
  const ctaLabel = oneLine(t("ctaLabel"));
  const signoff = t("signoff");

  const subject = oneLine(t("subject"));

  const text = [
    hello,
    "",
    plain(intro),
    ...(featureUrl ? ["", `${plain(featureLead)} ${featureUrl}`] : []),
    "",
    plain(proposition),
    ...(ctx.bookingUrl ? ["", `${ctaLabel} : ${ctx.bookingUrl}`] : []),
    "",
    plain(signoff),
  ].join("\n");

  const html = shell({
    // `shell` insère titre et pré-en-tête tels quels : on les échappe ici.
    heading: escape(oneLine(t("heading"))),
    heroImageUrl: ctx.heroImageUrl?.trim() || DEFAULT_ANNOUNCE_HERO,
    preheader: escape(oneLine(t("preheader"))),
    recipientEmail: ctx.recipientEmail,
    bodyHtml:
      paragraph(escape(hello)) +
      paragraph(richHtml(intro)) +
      (featureUrl
        ? paragraph(
            `${richHtml(featureLead)} <a href="${featureUrl}" style="color:${BRAND};font-weight:700;text-decoration:none;">${escape(
              ctx.featureTitle?.trim() || ctx.title,
            )}</a>.`,
          )
        : "") +
      paragraph(richHtml(proposition)) +
      (ctx.bookingUrl ? button(ctaLabel, ctx.bookingUrl) : "") +
      `<p style="margin:18px 0 0;font-family:${FONT};font-size:15px;color:#4a4d57;">${richHtml(signoff)}</p>`,
  });

  return { subject, text, html };
}
