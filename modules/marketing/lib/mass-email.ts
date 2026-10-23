import { BRAND, BODY, FONT, escape, plainShell } from "@/core/lib/email-template";
import { appV2Path } from "@/modules/marketing/lib/app-v2";

/**
 * E-mail de masse — un même message envoyé à une liste d'adresses, mais UN
 * e-mail par adresse : chaque destinataire reçoit un message qui n'est adressé
 * qu'à lui, sans copie ni copie cachée, et ne voit jamais à qui d'autre on a
 * écrit.
 *
 * Un message écrit à la main, pas une campagne : enveloppe sobre (plainShell),
 * signature de l'admin qui envoie, réponse directement chez lui.
 */

/**
 * Adresse PUBLIQUE du site, écrite en dur pour les liens des modèles : l'e-mail
 * peut partir d'un poste de développement, où l'adresse du site serait
 * `localhost` — un lien mort chez le client.
 */
const PUBLIC_SITE = "https://support.tim-management.co";
export const APP_V2_PUBLIC_URL = `${PUBLIC_SITE}${appV2Path()}`;

export type MassEmailTemplate = {
  key: string;
  label: string;
  /** Une ligne sous le nom du modèle, pour choisir sans l'ouvrir. */
  description: string;
  subject: string;
  body: string;
  closing: string;
  /** Texte d'aperçu affiché par la messagerie à côté de l'objet. */
  preheader?: string;
};

/**
 * Les modèles FOURNIS : la page blanche d'abord (l'écran s'ouvre dessus), puis
 * ceux qui servent une opération précise. Ceux que l'équipe enregistre depuis
 * l'écran s'y ajoutent (collection `email-templates`, voir la route). Un point
 * de départ, pas un carcan : tout se modifie avant l'envoi.
 */
export const MASS_EMAIL_TEMPLATES: MassEmailTemplate[] = [
  {
    key: "libre",
    label: "Message libre",
    description: "Une page blanche, avec seulement « Bonjour » et votre signature.",
    subject: "",
    body: "Bonjour {{prenom}},\n\n",
    closing: "Bien cordialement,",
  },
  {
    key: "app-v2",
    label: "Présentation de l'app mobile V2",
    description: "Annonce de la V2 avec le lien vers la page de présentation et la prise de rendez-vous.",
    subject: "La V2 de l'application mobile : découvrez-la en avant-première",
    body: [
      "Bonjour {{prenom}},",
      "",
      "La nouvelle version de l'application mobile Tim Management arrive très bientôt, et je voulais vous la présenter en avant-première.",
      "",
      "Au programme : un nouveau profil **Compagnon visuel**, le **pointage directement depuis l'accueil**, le **chrono en un clic**, les **demandes de congé dans l'app**, et pour les chefs de chantier et conducteurs de travaux, **la fiche de chaque ouvrier en un glissé**.",
      "",
      "Tout est sur cette page, avec la vidéo et le détail des changements pour chaque profil :",
      `[Découvrir la V2 de l'application mobile](${APP_V2_PUBLIC_URL})`,
      "",
      "Si vous le souhaitez, vous pouvez aussi y réserver 20 minutes en visio avec moi pour en faire le tour avant la mise en production. Les places sont limitées.",
    ].join("\n"),
    closing: "À très vite,",
    preheader: "La vidéo, ce qui change pour chaque profil, et 20 minutes pour en faire le tour.",
  },
];

export type Recipient = { email: string; firstName: string | null };

const EMAIL_RE = /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/;

/**
 * Lit ce que l'on a collé : une adresse par ligne, ou séparées par des virgules
 * ou des points-virgules — tel que le donne un copier-coller depuis Gmail,
 * Outlook ou un tableur. « Prénom Nom <adresse> » fournit le prénom.
 *
 * Doublons retirés (en minuscules) : la même personne collée deux fois ne doit
 * pas recevoir deux e-mails.
 */
export function parseRecipients(raw: string): { valid: Recipient[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: Recipient[] = [];
  const invalid: string[] = [];

  for (const part of raw.split(/[\n,;]+/)) {
    const chunk = part.trim();
    if (!chunk) continue;
    const named = chunk.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
    const email = (named ? named[2] : chunk).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      invalid.push(chunk);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const firstName = named?.[1]?.trim().split(/\s+/)[0] || null;
    valid.push({ email, firstName });
  }
  return { valid, invalid };
}

/**
 * `{{prenom}}` remplacé par le prénom, ou retiré avec l'espace qui le précède :
 * « Bonjour {{prenom}}, » devient « Bonjour Jean, » ou « Bonjour, ».
 */
export const personalize = (text: string, firstName: string | null): string =>
  text.replace(/\s?\{\{\s*prenom\s*\}\}/gi, firstName ? ` ${firstName}` : "");

/**
 * Le texte de l'e-mail en HTML : paragraphes (ligne vide), retours à la ligne,
 * `**gras**` et `[texte](https://…)`. Rendu à part plutôt que par
 * `markdownToHtml` des notes, qui ne connaît pas les liens — or le lien est
 * souvent tout le message. Tout est échappé avant d'être mis en forme : ce
 * qu'on tape à l'écran reste du texte.
 */
function bodyToHtml(text: string): string {
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,
        `<a href="$2" style="color:${BRAND};font-weight:600;text-decoration:underline;">$1</a>`,
      );
  return text
    .trim()
    .split(/\n\s*\n/)
    .map(
      (para) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.7;color:${BODY};">${para
          .split("\n")
          .map(inline)
          .join("<br>")}</p>`,
    )
    .join("");
}

/** Version texte : le lien devient « texte : adresse », le gras disparaît. */
const bodyToText = (text: string): string =>
  text
    .trim()
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, "$1 : $2");

/** Le message tel qu'il part chez UNE personne. */
export function buildMassEmail(args: {
  subject: string;
  body: string;
  closing: string;
  preheader?: string;
  firstName: string | null;
  signature: { html: string; text: string };
}): { subject: string; html: string; text: string } {
  const body = personalize(args.body, args.firstName);
  const closing = args.closing.trim();
  return {
    subject: personalize(args.subject, args.firstName),
    html: plainShell({
      preheader: args.preheader,
      bodyHtml: bodyToHtml(body),
      closing: closing || undefined,
      signatureHtml: args.signature.html,
    }),
    text: [bodyToText(body), closing, args.signature.text ? `--\n${args.signature.text}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  };
}
