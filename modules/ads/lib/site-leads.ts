import type { Payload } from "payload";

import { WON_STATUSES } from "@/modules/ads/agent/sources/acquisition";
import { dayInTz, metricKey } from "@/modules/ads/lib/sync";

/**
 * Les leads du SITE, rattachés à la publicité qui les a amenés (plan Publicité,
 * §9 nonies, étape 1).
 *
 * Chaque publicité Meta envoie ses paramètres d'URL (`META_URL_PARAMS`) :
 * `utm_medium=paid_social`, `utm_campaign` = identifiant de la campagne,
 * `utm_content` = identifiant de la publicité. La vitrine les garde et les
 * renvoie avec le formulaire. Un formulaire, c'est un lead du site ; la fiche
 * qui en naît dit s'il est qualifié, puis gagné.
 *
 * Le compte se range au JOUR DU FORMULAIRE (fuseau du compte), sur la pub, son
 * ensemble et sa campagne : une fiche qualifiée trois semaines plus tard remonte
 * sur le jour où le lead est arrivé, pas sur le jour où on l'a qualifié — c'est
 * ce qui permet de comparer deux pubs à dépense égale.
 *
 * Lead qualifié (v1) : la fiche a dépassé la qualification. Une fiche « perdue »
 * ne compte pas : l'historique des états n'est pas encore lu.
 */

/** Ce qu'il faut de recul : une fiche se qualifie en quelques semaines. */
export const SITE_LEADS_DAYS = 60;
export const QUALIFIED_STATUSES = ["demo-programmee", "attente-engagement", "attente-longue", "en-test", "en-signature", ...WON_STATUSES];

export type SubmissionIn = { id: number | string; createdAt?: string | null; utmMedium?: string | null; utmCampaign?: string | null; utmContent?: string | null };
export type FileIn = { formSubmission?: number | string | null; clientStatus?: string | null };
/** Une publicité connue : son ensemble et sa campagne. */
export type AdParent = { adsetExternalId: string | null; campaignExternalId: string };
export type SiteCounts = { level: "campaign" | "adset" | "ad"; externalId: string; campaignExternalId: string; day: string; siteLeads: number; qualifiedLeads: number; won: number };

const isMetaId = (v?: string | null): v is string => typeof v === "string" && /^\d{5,30}$/.test(v.trim());

/**
 * Compte les leads du site par pub, ensemble et campagne, jour par jour. Un
 * formulaire sans identifiant de pub lisible remonte à sa campagne seule ; un
 * formulaire d'une campagne hors du compte est ignoré. Pure.
 */
export function countSiteLeads(submissions: SubmissionIn[], files: FileIn[], ads: Map<string, AdParent>, campaigns: Set<string>, timeZone: string): SiteCounts[] {
  const fileOf = new Map(files.filter((f) => f.formSubmission != null).map((f) => [String(f.formSubmission), f]));
  const out = new Map<string, SiteCounts>();
  const bump = (level: SiteCounts["level"], externalId: string, campaignExternalId: string, day: string, q: boolean, w: boolean) => {
    const k = metricKey(level, externalId, day);
    const row = out.get(k) ?? { level, externalId, campaignExternalId, day, siteLeads: 0, qualifiedLeads: 0, won: 0 };
    row.siteLeads++;
    if (q) row.qualifiedLeads++;
    if (w) row.won++;
    out.set(k, row);
  };
  for (const s of submissions) {
    if ((s.utmMedium ?? "").trim().toLowerCase() !== "paid_social" || !s.createdAt) continue;
    const ad = isMetaId(s.utmContent) ? ads.get(s.utmContent.trim()) : undefined;
    const campaign = ad?.campaignExternalId ?? (isMetaId(s.utmCampaign) ? s.utmCampaign.trim() : null);
    if (!campaign || !campaigns.has(campaign)) continue;
    const day = dayInTz(new Date(s.createdAt), timeZone);
    const status = fileOf.get(String(s.id))?.clientStatus ?? "";
    const q = QUALIFIED_STATUSES.includes(status);
    const w = WON_STATUSES.includes(status);
    bump("campaign", campaign, campaign, day, q, w);
    if (ad?.adsetExternalId) bump("adset", ad.adsetExternalId, campaign, day, q, w);
    if (ad) bump("ad", s.utmContent!.trim(), campaign, day, q, w);
  }
  return [...out.values()];
}

type Row = { id: number | string; level: string; externalId: string; day: string; siteLeads?: number | null; qualifiedLeads?: number | null; won?: number | null };

/**
 * Réécrit les compteurs du site d'un compte sur les `SITE_LEADS_DAYS` derniers
 * jours : une ligne qui en avait et n'en a plus revient à zéro, un jour sans
 * dépense mais avec un lead reçoit sa ligne. Rend le nombre de lignes écrites.
 */
export async function writeSiteLeads(
  payload: Payload,
  acc: { id: number | string; currency?: string | null; timezone?: string | null },
  platform: string,
  ads: Map<string, AdParent>,
  campaigns: Set<string>,
  now: Date,
): Promise<number> {
  const tz = acc.timezone || "Europe/Paris";
  const sinceAt = new Date(now.getTime() - SITE_LEADS_DAYS * 86_400_000);
  const since = dayInTz(sinceAt, tz);
  const subs = await payload.find({
    collection: "form-submissions",
    where: { and: [{ utmMedium: { equals: "paid_social" } }, { createdAt: { greater_than_equal: sinceAt.toISOString() } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { createdAt: true, utmMedium: true, utmCampaign: true, utmContent: true } as never,
  });
  const ids = (subs.docs as SubmissionIn[]).map((d) => d.id);
  const files = ids.length
    ? await payload.find({ collection: "partner-clients", where: { formSubmission: { in: ids } }, pagination: false, depth: 0, overrideAccess: true, select: { formSubmission: true, clientStatus: true } as never })
    : { docs: [] };
  const counts = countSiteLeads(subs.docs as SubmissionIn[], files.docs as FileIn[], ads, campaigns, tz);

  const existing = await payload.find({
    collection: "ad-metrics-daily",
    where: { and: [{ account: { equals: acc.id } }, { day: { greater_than_equal: since } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { level: true, externalId: true, day: true, siteLeads: true, qualifiedLeads: true, won: true } as never,
  });
  const known = new Map((existing.docs as unknown as Row[]).map((r) => [metricKey(r.level, r.externalId, r.day), r]));
  const wanted = new Map(counts.map((c) => [metricKey(c.level, c.externalId, c.day), c]));

  let written = 0;
  for (const [k, c] of wanted) {
    const data = { siteLeads: c.siteLeads, qualifiedLeads: c.qualifiedLeads, won: c.won };
    const prev = known.get(k);
    if (prev) {
      if (Number(prev.siteLeads ?? 0) === c.siteLeads && Number(prev.qualifiedLeads ?? 0) === c.qualifiedLeads && Number(prev.won ?? 0) === c.won) continue;
      await payload.update({ collection: "ad-metrics-daily", id: prev.id, data, overrideAccess: true });
    } else {
      await payload.create({
        collection: "ad-metrics-daily",
        data: { ...data, day: c.day, account: acc.id as number, platform, level: c.level, externalId: c.externalId, campaignExternalId: c.campaignExternalId, currency: acc.currency ?? null },
        overrideAccess: true,
      });
    }
    written++;
  }
  for (const [k, r] of known) {
    if (wanted.has(k) || !(Number(r.siteLeads ?? 0) || Number(r.qualifiedLeads ?? 0) || Number(r.won ?? 0))) continue;
    await payload.update({ collection: "ad-metrics-daily", id: r.id, data: { siteLeads: 0, qualifiedLeads: 0, won: 0 }, overrideAccess: true });
    written++;
  }
  return written;
}
