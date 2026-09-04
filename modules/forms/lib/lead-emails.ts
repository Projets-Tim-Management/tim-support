import {
  BODY,
  BORDER,
  BRAND,
  FONT,
  INK,
  MUTED,
  OUTER,
  adminUrl,
  escape,
  internalNotice,
  shell,
} from "@/core/lib/email-template";

/**
 * Les deux e-mails d'une soumission : l'accusé de réception au prospect, et
 * l'alerte à l'équipe. Ils remplacent deux automations Brevo.
 *
 * L'accusé de réception tient en quatre temps : on accueille, on propose un
 * rendez-vous, on donne trois conseils, on laisse deux liens à explorer. Rien
 * d'autre — c'est un e-mail écrit par quelqu'un, pas une plaquette.
 */

/** Rendez-vous et téléphone, surchargeables sans déploiement. */
const CALENDLY_URL = process.env.LEAD_CALENDLY_URL || "https://calendly.com/cpiancatelli/30min";
const PHONE = process.env.LEAD_PHONE || "09 72 12 59 03";

const SITE = "https://tim-management.co";

const FEATURES = {
  pointage: { label: "Pointage", url: `${SITE}/pointage-digital-mobile-chantier` },
  heures: { label: "Feuilles d'heures", url: `${SITE}/feuilles-dheures-btp` },
  rh: { label: "Gestion RH", url: `${SITE}/employes-rh` },
  chantier: { label: "Suivi de chantier", url: `${SITE}/suivi-chantier` },
  planningOuvrier: { label: "Planning ouvrier", url: `${SITE}/plannings-ouvriers` },
  planningEngins: { label: "Planning engins", url: `${SITE}/plannings-engins` },
  analytique: { label: "Chiffres & analytique", url: `${SITE}/chiffre-analytique` },
} as const;

type FeatureKey = keyof typeof FEATURES;

/**
 * Ce à quoi chaque besoin coché correspond : de quoi l'écrire dans une phrase
 * (`topic`) et vers quoi renvoyer (`links`).
 */
const TOPICS: Record<string, { topic: string; links: FeatureKey[] }> = {
  pointage: { topic: "le pointage", links: ["pointage", "heures"] },
  planning: { topic: "les plannings", links: ["planningOuvrier", "planningEngins"] },
  vehicules: { topic: "la gestion des véhicules", links: ["planningEngins"] },
  chantiers: { topic: "le suivi de chantier", links: ["chantier", "analytique"] },
  "documents-rh": { topic: "les documents RH", links: ["rh"] },
};

/** Sujets retenus, dans l'ordre où les besoins ont été cochés. */
export function topicsFor(besoins: string[] = []) {
  const seen = new Set<string>();
  return besoins.filter((b) => TOPICS[b] && !seen.has(b) && seen.add(b)).map((b) => TOPICS[b]);
}

/** Liens à proposer : ceux des besoins cochés, à défaut les plus courants. */
export function linksFor(besoins: string[] = []): FeatureKey[] {
  const cited = topicsFor(besoins).flatMap((t) => t.links);
  const unique = [...new Set(cited)];
  return unique.length ? unique.slice(0, 3) : ["pointage", "planningOuvrier", "chantier"];
}

/** « a », « a et b », « a, b et c » — une énumération qui se lit. */
function enumerate(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

export interface LeadEmailContext {
  /** Libellés, pas valeurs : « Mme », « Employé », « 11 - 25 ». */
  civilite?: string;
  nom?: string;
  companyName?: string;
  fonction?: string;
  effectif?: string;
  besoins?: string[];
  /** Valeurs techniques des besoins, qui pilotent le contenu. */
  besoinValues?: string[];
  email?: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/** « Bonjour Mme Poulit, » — ou « Bonjour, » si on ne sait pas la nommer. */
function greeting(ctx: LeadEmailContext): string {
  const who = [ctx.civilite, ctx.nom].filter(Boolean).join(" ").trim();
  return who ? `Bonjour ${who},` : "Bonjour,";
}

/**
 * La phrase d'accueil. Chaque morceau est facultatif et la phrase se recompose
 * autour de ce qui manque — un modèle qui écrirait « Vous êtes  de  » serait
 * pire que pas de personnalisation.
 */
function opening(ctx: LeadEmailContext): string {
  const qui = ctx.companyName
    ? ctx.fonction
      ? `Vous êtes ${ctx.fonction} chez ${ctx.companyName}`
      : `Vous représentez ${ctx.companyName}`
    : ctx.fonction
      ? `Vous êtes ${ctx.fonction}`
      : "";

  const sujets = enumerate(topicsFor(ctx.besoinValues).map((t) => t.topic));

  if (qui && sujets)
    return `Merci pour votre demande, elle est bien arrivée. ${qui}, et vous souhaitez y voir plus clair sur ${sujets} — c'est exactement ce dont on peut parler ensemble.`;
  if (sujets)
    return `Merci pour votre demande, elle est bien arrivée. Vous souhaitez y voir plus clair sur ${sujets} — c'est exactement ce dont on peut parler ensemble.`;
  if (qui)
    return `Merci pour votre demande, elle est bien arrivée. ${qui} : voyons ensemble ce que Tim peut changer dans votre organisation.`;
  return "Merci pour votre demande, elle est bien arrivée. Voyons ensemble ce que Tim peut changer dans votre organisation.";
}

const INVITE =
  "Le plus simple est de réserver trente minutes en visio. On part de votre organisation actuelle, pas d'une démonstration toute faite.";

const TIPS = [
  "Venez avec un chantier en cours en tête : c'est ce qui parle le mieux.",
  "Si vous le pouvez, invitez la personne qui gère les heures — c'est elle qui verra le plus vite ce que ça change.",
  "Rien à préparer de votre côté, trente minutes suffisent.",
];

export function leadConfirmationEmail(ctx: LeadEmailContext): BuiltEmail {
  const links = linksFor(ctx.besoinValues);

  const text = [
    greeting(ctx),
    "",
    opening(ctx),
    "",
    INVITE,
    `→ ${CALENDLY_URL}`,
    `Ou par téléphone : ${PHONE}`,
    "",
    "Trois conseils pour que ce soit utile :",
    ...TIPS.map((t) => `· ${t}`),
    "",
    "En attendant, si vous voulez jeter un œil :",
    ...links.map((k) => `  ${FEATURES[k].label} : ${FEATURES[k].url}`),
  ].join("\n");

  const p = (t: string, extra = "") =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BODY};${extra}">${t}</p>`;

  const tipRow = (t: string) =>
    `<tr>
      <td style="padding:0 10px 10px 0;font-family:${FONT};font-size:15px;color:${BRAND};vertical-align:top;line-height:1.6;">•</td>
      <td style="padding:0 0 10px;font-family:${FONT};font-size:14px;line-height:1.6;color:${BODY};">${escape(t)}</td>
    </tr>`;

  const bodyHtml = [
    p(escape(greeting(ctx)), `font-size:16px;color:${INK};margin-bottom:14px;`),
    p(escape(opening(ctx))),
    p(escape(INVITE)),

    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 6px;"><tr><td>
      <a href="${CALENDLY_URL}" style="display:inline-block;padding:13px 26px;background:${BRAND};border-radius:9px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;">Choisir un créneau</a>
    </td></tr></table>`,
    p(`Ou par téléphone : <strong style="color:${INK};">${escape(PHONE)}</strong>`, `font-size:14px;color:${MUTED};margin-bottom:26px;`),

    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="padding:18px 20px;background:${OUTER};border-radius:12px;">
        <p style="margin:0 0 12px;font-family:${FONT};font-size:15px;font-weight:800;color:${INK};">Trois conseils pour que ce soit utile</p>
        <table role="presentation" cellpadding="0" cellspacing="0">${TIPS.map(tipRow).join("")}</table>
      </td></tr>
    </table>`,

    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="border-top:1px solid ${BORDER};padding-top:16px;">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:14px;color:${MUTED};">En attendant, si vous voulez jeter un œil :</p>
        <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.9;">${links
          .map(
            (k) =>
              `<a href="${FEATURES[k].url}" style="color:${BRAND};font-weight:600;text-decoration:none;">${escape(FEATURES[k].label)}</a>`,
          )
          .join(`<span style="color:${MUTED};"> · </span>`)}</p>
      </td></tr>
    </table>`,
  ].join("");

  return {
    subject: "Votre demande est bien arrivée",
    text,
    html: shell({
      heading: "Votre demande est bien arrivée",
      preheader: "Réservons trente minutes, en partant de votre organisation.",
      bodyHtml,
      recipientEmail: ctx.email,
    }),
  };
}

export interface LeadNoticeContext extends LeadEmailContext {
  telephone?: string;
  pays?: string;
  /** « Google Ads — SEA » ou « Site vitrine — SEO ». */
  canal?: string;
  page?: string;
  campagne?: string;
  variante?: string;
  /** Identifiant de l'opportunité créée, pour le lien direct. */
  clientId?: number | string;
  /** Vrai quand la fiche est entrée en brouillon (soumission sans e-mail). */
  brouillon?: boolean;
}

/**
 * Alerte à l'équipe. Volontairement sobre : elle dit QUI vient d'arriver, ce
 * qu'il demande, d'où il vient, et donne un lien pour agir.
 *
 * Tout le texte est échappé par `internalNotice` — les valeurs sont donc passées
 * brutes. « Dupont & Fils » suffirait sinon à casser le message.
 */
export function newLeadNoticeEmail(ctx: LeadNoticeContext): BuiltEmail {
  const who = [ctx.civilite, ctx.nom].filter(Boolean).join(" ");
  const company = ctx.companyName || "Société inconnue";

  const rows: Array<[string, string]> = [["Société", company]];
  if (ctx.effectif) rows.push(["Effectif", ctx.effectif]);
  if (who || ctx.fonction) rows.push(["Contact", [who, ctx.fonction].filter(Boolean).join(" · ")]);
  if (ctx.email) rows.push(["E-mail", ctx.email]);
  if (ctx.telephone) rows.push(["Téléphone", ctx.telephone]);
  if (ctx.besoins?.length) rows.push(["Besoins", ctx.besoins.join(", ")]);
  if (ctx.pays) rows.push(["Pays", ctx.pays]);
  rows.push([
    "Origine",
    [ctx.canal, ctx.page, ctx.variante && `variante ${ctx.variante}`, ctx.campagne && `campagne ${ctx.campagne}`]
      .filter(Boolean)
      .join(" · ") || "—",
  ]);

  const subject = `Nouveau lead — ${company}${ctx.canal ? ` (${ctx.canal})` : ""}`;

  const text = [
    subject,
    "",
    ...rows.map(([k, v]) => `${k} : ${v}`),
    ...(ctx.brouillon
      ? ["", "⚠️ Fiche créée en BROUILLON : aucune adresse e-mail exploitable."]
      : []),
    "",
    ctx.clientId ? adminUrl(`/collections/partner-clients/${ctx.clientId}`) : adminUrl("/collections/form-submissions"),
  ].join("\n");

  return {
    subject,
    text,
    html: internalNotice({
      heading: "Nouveau lead du site vitrine",
      rows,
      message: ctx.brouillon
        ? "Fiche créée en brouillon : aucune adresse e-mail exploitable. À compléter avant de la publier."
        : undefined,
      cta: {
        label: ctx.clientId ? "Ouvrir l'opportunité" : "Voir les soumissions",
        url: ctx.clientId
          ? adminUrl(`/collections/partner-clients/${ctx.clientId}`)
          : adminUrl("/collections/form-submissions"),
      },
      links: [{ label: "Toutes les soumissions", url: adminUrl("/collections/form-submissions") }],
    }),
  };
}
