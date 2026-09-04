import {
  BODY,
  BORDER,
  BRAND,
  FONT,
  INK,
  MUTED,
  escape,
  marketingShell,
  plainShell,
} from "@/core/lib/email-template";

/**
 * Assemblage d'un message de séquence à partir de son thème.
 *
 * Le contenu vient de la base (un message d'une séquence), pas du code : les
 * textes, l'image et le style se modifient en back-office. Cette fonction ne
 * fait que mettre en forme — et elle est PURE, donc testable sans base.
 */

/** Forme minimale attendue d'un message de séquence. */
export interface ThemeDoc {
  key?: string | null;
  title?: string | null;
  subject?: string | null;
  paragraphs?: { text?: string | null }[] | null;
  payoff?: string | null;
  cta?: string | null;
  url?: string | null;
  active?: boolean | null;
  /** « marketing » (avec le design) ou « standard » (sobre). */
  style?: string | null;
  /** Média du hero, résolu ou non selon la profondeur de lecture. */
  image?: { url?: string | null } | number | string | null;
}

export interface SequenceEmailContext {
  /** Prénom, s'il est connu. Le message tient sans. */
  firstName?: string;
  email: string;
  unsubscribeUrl: string;
  /** Formule de politesse, portée par la séquence. */
  closing?: string;
  /**
   * Signature DÉJÀ RENDUE, fabriquée à partir de la fiche du partenaire de
   * l'opportunité. Le prospect connaît cette personne — c'est elle qui doit
   * signer une relance, pas une adresse générique.
   *
   * Elle se dégrade toute seule : une fiche qui ne porte qu'un nom signe ce
   * nom, sans photo ni encadré. C'est voulu — un partenaire qui n'a pas rempli
   * son bloc signature doit quand même pouvoir relancer.
   */
  signatureHtml?: string;
  /** Version texte de la même signature. */
  signatureText?: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const heroUrl = (image: ThemeDoc["image"]): string | undefined => {
  if (!image || typeof image !== "object") return undefined;
  const url = text((image as { url?: unknown }).url);
  // Une URL relative ne s'affiche pas dans un client de messagerie : il n'a
  // aucun domaine de référence. Mieux vaut pas d'image qu'un cadre cassé.
  return url.startsWith("http") ? url : undefined;
};

const p = (t: string, extra = "") =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.7;color:${BODY};${extra}">${t}</p>`;

/**
 * @returns `null` si le thème est inactif ou incomplet — mieux vaut ne rien
 * envoyer qu'un message amputé de son bouton ou de son texte.
 */
export function buildSequenceEmail(
  theme: ThemeDoc | null | undefined,
  ctx: SequenceEmailContext,
): BuiltEmail | null {
  if (!theme || theme.active === false) return null;

  const title = text(theme.title);
  const subject = text(theme.subject) || title;
  const payoff = text(theme.payoff);
  const cta = text(theme.cta);
  const url = text(theme.url);
  const paragraphs = (theme.paragraphs ?? [])
    .map((x) => text(x?.text))
    .filter(Boolean);

  const sobre = theme.style === "standard";
  // Le bouton n'existe que dans le style marketing : l'exiger partout
  // empêcherait d'enregistrer une relance qui, elle, n'en veut pas.
  if (!title || !subject || paragraphs.length === 0) return null;
  if (!sobre && (!cta || !url)) return null;

  const hello = ctx.firstName?.trim() ? `Bonjour ${ctx.firstName.trim()},` : "Bonjour,";
  const closing = ctx.closing?.trim() || "Bien cordialement,";
  const signedBy = ctx.signatureText?.trim() || "L'équipe Tim Management";

  const body = sobre
    ? [hello, "", ...paragraphs.flatMap((t) => [t, ""]), payoff, "", closing, signedBy]
    : [
        hello,
        "",
        ...paragraphs.flatMap((t) => [t, ""]),
        payoff,
        "",
        `${cta} : ${url}`,
        "",
        "Si vous voulez en parler de vive voix, répondez simplement à cet e-mail.",
        "",
        closing,
        signedBy,
        "",
        `Se désabonner : ${ctx.unsubscribeUrl}`,
      ];

  /**
   * Sobre : que du texte. Ni bouton, ni lien d'appel à l'action.
   *
   * Même sans habillage, une ligne seule qui dit « Reprendre là où on s'était
   * arrêté » se lit comme un bouton et trahit l'envoi automatique. Le message
   * demande une réponse — c'est la réponse qui est l'action, et elle arrête la
   * séquence. Il n'y a donc rien à cliquer.
   */
  if (sobre) {
    const bodyHtml = [
      p(escape(hello)),
      ...paragraphs.map((t) => p(escape(t))),
      payoff ? p(escape(payoff)) : "",
    ].join("");

    return {
      subject,
      text: body.join("\n"),
      html: plainShell({
        preheader: payoff || paragraphs[0],
        bodyHtml,
        closing,
        /**
         * Fiche sans aucun nom : on signe quand même. Un message qui dit
         * « je vous relance » et se termine sur « Bien cordialement, » puis
         * plus rien se lit comme un envoi raté.
         */
        signatureHtml:
          ctx.signatureHtml?.trim() ||
          `<p style="margin:0;font-family:${FONT};font-size:15px;color:${INK};font-weight:700;">${escape(signedBy.split("\n")[0])}</p>`,
      }),
    };
  }

  const bodyHtml = [
    p(escape(hello), `font-size:16px;color:${INK};`),
    ...paragraphs.map((t) => p(escape(t))),
    payoff
      ? p(`<strong style="color:${INK};font-size:16px;">${escape(payoff)}</strong>`, "margin-top:22px;")
      : "",
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;"><tr><td>
      <a href="${url}" style="display:inline-block;padding:14px 28px;background:${BRAND};border-radius:9px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;">${escape(cta)}</a>
    </td></tr></table>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${BORDER};padding-top:18px;">
      <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.7;color:${MUTED};">Si vous voulez en parler de vive voix, répondez simplement à cet e-mail.<br><br>Excellente journée,<br><strong style="color:${INK};">${escape(signedBy.split("\n")[0])}</strong></p>
    </td></tr></table>`,
  ].join("");

  return {
    subject,
    text: body.join("\n"),
    html: marketingShell({
      heading: title,
      preheader: payoff || paragraphs[0],
      bodyHtml,
      heroImageUrl: heroUrl(theme.image),
      recipientEmail: ctx.email,
      unsubscribeUrl: ctx.unsubscribeUrl,
    }),
  };
}
