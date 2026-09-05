import type { Attribution } from "@/modules/forms/lib/ingest";
import type { Channel } from "@/modules/forms/lib/form-schema";

/**
 * Canal d'acquisition d'une soumission — ce qui remplira le champ « Provenance »
 * de l'opportunité.
 *
 * Trois signaux, du plus sûr au plus faible :
 *
 *  1. une TRACE DE CLIC PAYANT (`gclid`, `msclkid`, `utm_medium` payant). C'est
 *     un fait : la personne arrive d'une annonce, quelle que soit la page ;
 *  2. l'EMPLACEMENT sur une landing page. Les deux LP ne sont pas indexées et ne
 *     sont atteignables que par les campagnes Ads — mais un visiteur peut y
 *     revenir en direct, sans paramètre, et le clic payant est alors invisible ;
 *  3. à défaut, le canal déclaré du formulaire.
 *
 * ⚠️ Le signal 2 existe parce que les deux formulaires ont fusionné en un seul
 * (décision du 04/09/2026) : le canal déclaré ne distingue plus le tiroir global
 * d'un hero de landing page, puisque c'est la même définition qui les sert.
 * L'emplacement a repris ce rôle.
 */

/** `utm_medium` qui désigne un clic acheté, quelle que soit la régie. */
const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "cpm",
  "paid",
  "paidsearch",
  "paid-search",
  "paid_search",
  "paidsocial",
  "paid-social",
  "paid_social",
]);

/** Emplacements qui ne vivent que sur une landing page de campagne. */
const AD_PLACEMENTS = new Set(["lp-hero", "lp-section"]);

export const isPaidMedium = (medium?: string | null): boolean =>
  Boolean(medium && PAID_MEDIUMS.has(medium.trim().toLowerCase()));

/**
 * La visite vient-elle d'une ANNONCE ChatGPT ?
 *
 * Deux signaux, et il en faut un des deux :
 *
 *  - `oaiclid`, la référence de clic posée par la vitrine à partir de la macro
 *    `{oppref}` de ChatGPT Ads. Elle n'existe que sur un clic d'annonce, donc
 *    elle suffit à elle seule ;
 *  - `utm_source=chatgpt` ACCOMPAGNÉ d'un medium payant.
 *
 * ⚠️ `utm_source=chatgpt` seul ne suffit délibérément PAS, alors que le canal
 * s'appelle « ChatGPT Ads ». ChatGPT cite aussi des sites hors publicité, et
 * cette étiquette se met facilement à la main dans un lien partagé : compter ce
 * trafic-là comme un clic acheté gonflerait le coût d'acquisition d'un canal
 * qui n'a rien coûté. Sans medium payant ni référence de clic, la visite suit
 * la règle générale — landing page, puis canal par défaut.
 */
export const isChatGpt = (a: Attribution): boolean =>
  Boolean(a.oaiclid) ||
  (a.utmSource?.trim().toLowerCase() === "chatgpt" && isPaidMedium(a.utmMedium));

/** La visite porte-t-elle la trace d'un clic acheté ? */
export const hasPaidClick = (a: Attribution): boolean =>
  Boolean(a.gclid || a.msclkid) || isPaidMedium(a.utmMedium);

/** La soumission vient-elle d'une landing page de campagne ? */
export const isLandingPage = (a: Attribution): boolean =>
  Boolean((a.placement && AD_PLACEMENTS.has(a.placement)) || a.lpSlug);

/**
 * Comment le canal a été décidé.
 *
 * Stocké avec le canal, et pas seulement calculé : c'est ce qui rend la règle de
 * repli MESURABLE. Une part élevée de « landing-page » dans les leads SEA veut
 * dire quelque chose de précis — le taggage automatique de Google Ads ne remonte
 * plus, ou le cookie d'attribution ne tient pas. Sans cette trace, l'anomalie
 * serait indiscernable d'un trafic normal.
 */
export const CHANNEL_SOURCES = [
  { label: "Clic payant identifié", value: "clic-payant" },
  { label: "Landing page de campagne", value: "landing-page" },
  { label: "Canal par défaut", value: "defaut" },
] as const;

export type ChannelSource = (typeof CHANNEL_SOURCES)[number]["value"];

export interface ResolvedChannel {
  channel: Channel;
  source: ChannelSource;
}

export function resolveChannel(a: Attribution, defaultChannel: Channel = "seo"): ResolvedChannel {
  /**
   * ChatGPT AVANT la règle générale, et c'est tout l'enjeu de l'ordre.
   *
   * ChatGPT Ads envoie `utm_medium=cpc`, donc `hasPaidClick()` répond déjà oui.
   * Placée après, cette règle ne serait JAMAIS atteinte : tous les leads
   * ChatGPT tomberaient dans « Google Ads », sans que rien ne le signale — le
   * détail resterait juste dans `utm_source`, mais l'intitulé, celui qu'on lit
   * dans les tableaux de bord, mentirait.
   */
  if (isChatGpt(a)) return { channel: "chatgpt", source: "clic-payant" };

  // Un gclid est un fait ; l'emplacement n'est qu'une présomption. L'ordre compte.
  if (hasPaidClick(a)) return { channel: "sea", source: "clic-payant" };
  if (isLandingPage(a)) return { channel: "sea", source: "landing-page" };
  return { channel: defaultChannel, source: "defaut" };
}
