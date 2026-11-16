import {
  BODY,
  BORDER,
  BRAND,
  FONT,
  INK,
  MUTED,
  OUTER,
  SITE_URL,
  adminUrl,
  escape,
  internalNotice,
  shell,
} from "@/core/lib/email-template";
import { HEARD_FROM, HEARD_FROM_PATH, HEARD_FROM_QUESTION } from "@/modules/booking/lib/heard-from";

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

export const FEATURES = {
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


export interface LeadEmailContext {
  /**
   * La page de réservation du support (16/11/2026), déjà remplie avec cette demande : remplace Calendly dès que le
   * formulaire « propose un rendez-vous après l'envoi ». Absente : le lien Calendly d'avant.
   */
  bookingUrl?: string;
  /** La référence signée de la demande : les boutons « Comment nous avez-vous connus ? » (un clic) la portent. */
  sourceRef?: string;
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


/** Un bouton de « Comment nous avez-vous connus ? » : la page de remerciement l'enregistre à l'affichage. */
const heardFromUrl = (ref: string, value: string) => `${SITE_URL.replace(/\/$/, "")}${HEARD_FROM_PATH}?d=${encodeURIComponent(ref)}&r=${value}`;

/** La question en un clic, en bas de l'accusé de réception (16/11/2026) : facultative, rien à taper. */
function heardFromHtml(ref: string | undefined): string {
  if (!ref) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
      <tr><td style="border-top:1px solid ${BORDER};padding-top:16px;">
        <p style="margin:0 0 10px;font-family:${FONT};font-size:14px;color:${MUTED};">Une dernière chose, en un clic : ${escape(HEARD_FROM_QUESTION.toLowerCase())}</p>
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:2.4;">${HEARD_FROM.map(
          (h) =>
            `<a href="${escape(heardFromUrl(ref, h.value))}" style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border:1px solid ${BORDER};border-radius:999px;color:${INK};text-decoration:none;white-space:nowrap;">${escape(h.label)}</a>`,
        ).join("")}</p>
      </td></tr>
    </table>`;
}

/**
 * L'ACCUSÉ DE RÉCEPTION (refait le 16/11/2026 : « trop de texte, pas assez d'icônes ni de “validé” ») : la demande
 * est arrivée (coché), un suivi en trois étapes dont la suivante est mise en avant — choisir le créneau —, UN bouton,
 * trois repères courts, le téléphone en une ligne ; « comment nous avez-vous connus ? » en petit, tout en bas.
 */
export function leadConfirmationEmail(ctx: LeadEmailContext): BuiltEmail {
  const url = ctx.bookingUrl ?? CALENDLY_URL;
  const text = [
    greeting(ctx),
    "",
    "✅ Votre demande est bien arrivée.",
    "📅 Dernière étape : choisissez le créneau de votre démo (30 min, en visio ou par téléphone, sans engagement).",
    `→ ${url}`,
    "",
    `Une question ? ${PHONE}`,
    ...(ctx.sourceRef ? ["", `${HEARD_FROM_QUESTION} ${heardFromUrl(ctx.sourceRef, "").replace(/&r=$/, "")}`] : []),
  ].join("\n");

  // Une étape du suivi : son pastille (faite, en cours, à venir), son titre, sa précision.
  const step = (icon: string, title: string, detail: string, state: "fait" | "maintenant" | "ensuite") => {
    const bg = state === "fait" ? "#e3f5e9" : state === "maintenant" ? BRAND : OUTER;
    const color = state === "maintenant" ? INK : state === "fait" ? INK : MUTED;
    return `<tr>
      <td width="44" style="padding:0 14px 0 0;vertical-align:middle;">
        <div style="width:40px;height:40px;line-height:40px;border-radius:999px;background:${bg};text-align:center;font-size:19px;">${icon}</div>
      </td>
      <td style="padding:10px 0;vertical-align:middle;font-family:${FONT};">
        <div style="font-size:15px;font-weight:${state === "ensuite" ? 600 : 800};color:${color};">${escape(title)}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:2px;">${escape(detail)}</div>
      </td>
    </tr>`;
  };
  const tick = (t: string) => `<td style="padding:0 14px 0 0;font-family:${FONT};font-size:13px;color:${BODY};white-space:nowrap;"><span style="color:#15803d;font-weight:800;">✓</span> ${escape(t)}</td>`;

  const bodyHtml = [
    `<p style="margin:0 0 18px;font-family:${FONT};font-size:16px;color:${INK};">${escape(greeting(ctx))}</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;padding:14px 18px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;">
      ${step("✅", "Demande reçue", "Elle est entre nos mains.", "fait")}
      ${step("📅", "Choisissez votre créneau", "C'est la dernière étape, en 1 minute.", "maintenant")}
      ${step("💬", "Votre démo", "On part de vos chantiers, pas d'une présentation toute faite.", "ensuite")}
    </table>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr><td align="center">
      <a href="${escape(url)}" style="display:inline-block;padding:15px 34px;background:${BRAND};border-radius:999px;color:#ffffff;font-family:${FONT};font-size:16px;font-weight:800;text-decoration:none;">📅&nbsp; Choisir mon créneau</a>
    </td></tr></table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 24px;"><tr>${tick("30 min")}${tick("Visio ou téléphone")}${tick("Sans engagement")}</tr></table>`,
    `<p style="margin:0 0 4px;text-align:center;font-family:${FONT};font-size:13px;color:${MUTED};">Une question ? <a href="tel:${escape(PHONE.replace(/\s/g, ""))}" style="color:${INK};font-weight:700;text-decoration:none;">${escape(PHONE)}</a></p>`,
    heardFromHtml(ctx.sourceRef),
  ].join("");

  return {
    subject: "✅ Votre demande est bien arrivée",
    text,
    html: shell({
      heading: "Votre demande est bien arrivée ✓",
      preheader: "Dernière étape : choisissez le créneau de votre démo.",
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
  /** Réserves posées sur la fiche : elle existe, « Nouvelle », mais quelque chose est à corriger. */
  issues?: string[];
  /** L'entreprise avait déjà une fiche : la demande y est rattachée, aucune fiche créée. */
  known?: boolean;
  /** Le partenaire qui suit cette fiche, quand ce n'est pas celui du site. */
  followedBy?: string;
}

/**
 * Alerte à l'équipe. Volontairement sobre : elle dit QUI vient d'arriver, ce
 * qu'il demande, d'où il vient, et donne un lien pour agir.
 *
 * Tout le texte est échappé par `internalNotice` — les valeurs sont donc passées
 * brutes. « Dupont & Fils » suffirait sinon à casser le message.
 */
/** Les lignes d'une demande, communes à l'alerte TIM et à l'avis au partenaire. */
function leadRows(ctx: LeadNoticeContext): Array<[string, string]> {
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
  return rows;
}

export function newLeadNoticeEmail(ctx: LeadNoticeContext): BuiltEmail {
  const company = ctx.companyName || "Société inconnue";
  const rows = leadRows(ctx);
  if (ctx.followedBy) rows.splice(1, 0, ["Déjà suivie par", ctx.followedBy]);

  // Une entreprise déjà connue n'est pas un « nouveau lead » : le dire dès
  // l'objet évite de la rappeler comme une inconnue.
  const subject = `${ctx.known ? "Demande d'un prospect connu" : "Nouveau lead"} — ${company}${ctx.canal ? ` (${ctx.canal})` : ""}`;

  const text = [
    subject,
    "",
    ...rows.map(([k, v]) => `${k} : ${v}`),
    ...(ctx.issues?.length
      ? ["", "⚠️ Fiche créée avec des réserves :", ...ctx.issues.map((i) => `• ${i}`)]
      : []),
    "",
    ctx.clientId ? adminUrl(`/collections/partner-clients/${ctx.clientId}`) : adminUrl("/collections/form-submissions"),
  ].join("\n");

  return {
    subject,
    text,
    html: internalNotice({
      kicker: "Site vitrine · Formulaire",
      heading: ctx.known ? "Demande d'une entreprise déjà suivie" : "Nouveau lead du site vitrine",
      rows,
      message: ctx.known
        ? `Aucune fiche créée : la demande est inscrite dans l'historique de la fiche existante${
            ctx.followedBy ? `, suivie par ${ctx.followedBy}, qui est prévenu` : ""
          }.`
        : ctx.issues?.length
          ? `Fiche créée « Nouvelle » avec des réserves — à corriger sur la fiche : ${ctx.issues.join(" · ")}`
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

/**
 * Avis au PARTENAIRE : une entreprise qu'il suit vient de passer par le
 * formulaire du site. La fiche reste la sienne ; sans cet avis, il apprendrait
 * la demande par TIM, ou jamais.
 */
export function knownLeadPartnerEmail(ctx: LeadNoticeContext): BuiltEmail {
  const company = ctx.companyName || "Une entreprise que vous suivez";
  const url = ctx.clientId ? adminUrl(`/collections/partner-clients/${ctx.clientId}`) : adminUrl("/collections/partner-clients");
  const subject = `${company} vient de faire une demande sur le site TIM`;
  const rows = leadRows(ctx);
  const message =
    "Elle est passée par le formulaire du site. Sa demande est inscrite dans l'historique de sa fiche, qui reste la vôtre : à vous de la recontacter.";
  return {
    subject,
    text: [subject, "", ...rows.map(([k, v]) => `${k} : ${v}`), "", message, "", url].join("\n"),
    html: internalNotice({
      kicker: "Site TIM · Formulaire",
      heading: "Une entreprise que vous suivez a fait une demande",
      audience: "partenaire",
      rows,
      message,
      cta: { label: "Ouvrir la fiche", url },
    }),
  };
}
