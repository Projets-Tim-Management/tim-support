import type { Payload } from "payload";

import { idOf } from "@/core/lib/relations";
import { leadOutcomes } from "@/modules/ai-team/lib/scorecard";
import { periodBounds } from "@/modules/analytics/lib/growth";
import { classifyGa4Source, loadGa4Rows, type Ga4PageRow, type Ga4Row } from "@/modules/analytics/lib/seo-ga4";
import { classifySource, hostMatches, loadLeadClients, loadLeadRows, type SourceRow } from "@/modules/analytics/lib/seo-sources";

/**
 * L'ENTONNOIR DE BOUT EN BOUT de la visibilité gratuite (analyste de l'équipe
 * SEO/GEO, étape 2, 12/11/2026 : « qui analyse de bout en bout nos réseaux,
 * nos médias, notre site vitrine ? ») — source par source :
 *
 *    visites (GA4) → leads (formulaires) → leads QUALIFIÉS → clients signés
 *
 * pour Google et les autres moteurs, chaque IA (ChatGPT, Perplexity…), et les
 * réseaux (LinkedIn, YouTube, Instagram, Facebook, TikTok, X) quand ils
 * amènent du monde sans payer. La publicité payante n'y entre pas (clic
 * acheté, canal payant). Et, page par page : celles qui attirent sans
 * convertir.
 *
 * Qualifié : la règle de la fiche des canaux (« Démo programmée » ou plus,
 * même perdu ensuite — leadOutcomes). Pur (`buildFunnel`, testé) ; lu en
 * direct (GA4 gardé 6 h).
 */

export type FunnelKind = "search" | "ai" | "social";
type Source = { key: string; label: string; kind: FunnelKind };

/** Les réseaux, par leurs domaines et leurs étiquettes de lien (utm_source). */
const SOCIALS: (Source & { hosts: string[]; utm: string[] })[] = [
  { key: "linkedin", label: "LinkedIn", kind: "social", hosts: ["linkedin.com", "lnkd.in"], utm: ["linkedin", "linkedin.com", "li"] },
  { key: "youtube", label: "YouTube", kind: "social", hosts: ["youtube.com", "youtu.be"], utm: ["youtube", "youtube.com", "yt"] },
  { key: "instagram", label: "Instagram", kind: "social", hosts: ["instagram.com"], utm: ["instagram", "instagram.com", "ig"] },
  { key: "facebook", label: "Facebook", kind: "social", hosts: ["facebook.com", "fb.com", "fb.me"], utm: ["facebook", "facebook.com", "fb"] },
  { key: "tiktok", label: "TikTok", kind: "social", hosts: ["tiktok.com"], utm: ["tiktok"] },
  { key: "x", label: "X (Twitter)", kind: "social", hosts: ["x.com", "twitter.com", "t.co"], utm: ["twitter", "x"] },
];
const PAID_MEDIUM = /(cpc|ppc|cpm|paid|display|retarget)/i;
const PAID_CHANNELS = new Set(["sea", "chatgpt", "meta-facebook", "meta-instagram"]);
const strip = (h: string) => h.trim().toLowerCase().replace(/^www\./, "");
const hostOf = (url: string | null | undefined) => {
  try {
    return url ? strip(new URL(url).hostname) : null;
  } catch {
    return null;
  }
};
const socialByHost = (host: string | null) => (host ? SOCIALS.find((s) => s.hosts.some((h) => hostMatches(host, h))) : undefined);

/** Le réseau d'une session GA4 (source / medium), hors clic payé. Pure. */
export function socialOfSession(source: string, medium: string): Source | null {
  if (PAID_MEDIUM.test(medium)) return null;
  const src = strip(source);
  const hit = SOCIALS.find((s) => s.utm.includes(src)) ?? socialByHost(src);
  return hit ? { key: hit.key, label: hit.label, kind: "social" } : null;
}

/** La source gratuite d'un lead : moteur, IA ou réseau ; null si payé ou inconnu. Pure. */
export function sourceOfLead(r: SourceRow): Source | null {
  const engine = classifySource(r);
  if (engine) return engine;
  if (PAID_CHANNELS.has(r.channel ?? "") || r.gclid || r.msclkid || r.oaiclid) return null;
  if (r.utmMedium && PAID_MEDIUM.test(r.utmMedium)) return null;
  const utm = r.utmSource?.trim().toLowerCase();
  const hit = (utm ? SOCIALS.find((s) => s.utm.includes(utm)) : undefined) ?? socialByHost(hostOf(r.referrer));
  return hit ? { key: hit.key, label: hit.label, kind: "social" } : null;
}

export type FunnelRow = { key: string; label: string; kind: FunnelKind; sessions: number; leads: number; qualified: number; won: number; leadRate: number | null; qualifiedRate: number | null };
export type FunnelPage = { path: string; sessions: number; leads: number; qualified: number };
export type Funnel = { since: string; rows: FunnelRow[]; totals: Omit<FunnelRow, "key" | "label" | "kind">; pages: FunnelPage[]; attractWithoutConverting: FunnelPage[]; otherLeads: number };

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const pathOf = (p: string | null | undefined) => {
  const v = String(p ?? "").trim();
  if (!v) return null;
  try {
    return new URL(v, "https://tim-management.co").pathname.replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
};
const sessionSource = (source: string, medium: string): Source | null => classifyGa4Source(source, medium) ?? socialOfSession(source, medium);

/** Pur (testé). `from` : début de la fenêtre (ms). */
export function buildFunnel(input: { from: number; leads: (SourceRow & { id: unknown })[]; clients: Record<string, unknown>[]; journal: Record<string, unknown>[]; ga4Rows: Ga4Row[]; ga4Pages: Ga4PageRow[] }): Funnel {
  const outcomes = leadOutcomes(input.clients, input.journal);
  const fromMonth = new Date(input.from).toISOString().slice(0, 7).replace("-", "");
  const rows = new Map<string, FunnelRow>();
  const rowOf = (s: Source) => {
    let r = rows.get(s.key);
    if (!r) rows.set(s.key, (r = { ...s, sessions: 0, leads: 0, qualified: 0, won: 0, leadRate: null, qualifiedRate: null }));
    return r;
  };
  for (const g of input.ga4Rows) {
    if (g.month < fromMonth) continue;
    const s = sessionSource(g.source, g.medium);
    if (s) rowOf(s).sessions += g.sessions;
  }
  const pages = new Map<string, FunnelPage>();
  const pageOf = (path: string) => {
    let p = pages.get(path);
    if (!p) pages.set(path, (p = { path, sessions: 0, leads: 0, qualified: 0 }));
    return p;
  };
  for (const g of input.ga4Pages) {
    const path = pathOf(g.page);
    if (path && sessionSource(g.source, g.medium)) pageOf(path).sessions += g.sessions;
  }
  let otherLeads = 0;
  for (const l of input.leads) {
    if (!(Date.parse(String(l.createdAt ?? "")) >= input.from)) continue;
    const s = sourceOfLead(l);
    if (!s) {
      otherLeads += 1;
      continue;
    }
    const o = outcomes.get(String(idOf(l.id)));
    const r = rowOf(s);
    r.leads += 1;
    if (o?.qualified) r.qualified += 1;
    if (o?.won) r.won += 1;
    const path = pathOf(l.landingPath) ?? pathOf(l.sourcePagePath);
    if (path) {
      const p = pageOf(path);
      p.leads += 1;
      if (o?.qualified) p.qualified += 1;
    }
  }
  const list = [...rows.values()].map((r) => ({ ...r, leadRate: pct(r.leads, r.sessions), qualifiedRate: pct(r.qualified, r.leads) })).sort((a, b) => b.qualified - a.qualified || b.leads - a.leads || b.sessions - a.sessions);
  const sum = (k: "sessions" | "leads" | "qualified" | "won") => list.reduce((n, r) => n + r[k], 0);
  const all = [...pages.values()];
  return {
    since: new Date(input.from).toISOString().slice(0, 10),
    rows: list,
    totals: { sessions: sum("sessions"), leads: sum("leads"), qualified: sum("qualified"), won: sum("won"), leadRate: pct(sum("leads"), sum("sessions")), qualifiedRate: pct(sum("qualified"), sum("leads")) },
    pages: all.filter((p) => p.leads > 0).sort((a, b) => b.qualified - a.qualified || b.leads - a.leads).slice(0, 15),
    // Assez de visites gratuites pour juger (30 sur la période), et pas un seul lead.
    attractWithoutConverting: all.filter((p) => p.sessions >= 30 && p.leads === 0).sort((a, b) => b.sessions - a.sessions).slice(0, 15),
    otherLeads,
  };
}

/** L'entonnoir des `months` derniers mois (3 par défaut), lu en base et dans GA4. GA4 absent : les visites restent à 0. */
export async function loadFunnel(payload: Payload, now = new Date(), months = 3): Promise<Funnel> {
  const { from } = periodBounds(months, now);
  const [leads, clients, journal, ga4] = await Promise.all([
    loadLeadRows(payload, from),
    loadLeadClients(payload),
    payload
      .find({ collection: "client-activities", where: { and: [{ type: { equals: "systeme" } }, { title: { like: "Étape :" } }] }, pagination: false, depth: 0, overrideAccess: true, select: { client: true, title: true } as never })
      .then((r) => r.docs as unknown as Record<string, unknown>[])
      .catch(() => []),
    loadGa4Rows(months, now),
  ]);
  return buildFunnel({
    from,
    leads: leads as (SourceRow & { id: unknown })[],
    clients: clients as unknown as Record<string, unknown>[],
    journal,
    ga4Rows: ga4.status === "ok" ? ga4.data.rows : [],
    ga4Pages: ga4.status === "ok" ? ga4.data.pages : [],
  });
}

/** Ce que Serge et l'audit lisent de l'entonnoir : l'essentiel. Pure. */
export const funnelForModel = (f: Funnel) => ({
  depuis: f.since,
  total: f.totals,
  parSource: f.rows.map((r) => ({ source: r.label, type: r.kind, visites: r.sessions, leads: r.leads, qualifies: r.qualified, clients: r.won, tauxLeadParVisitePct: r.leadRate, tauxQualifiesPct: r.qualifiedRate })),
  pagesQuiConvertissent: f.pages.slice(0, 10),
  pagesQuiAttirentSansConvertir: f.attractWithoutConverting.slice(0, 10),
  leadsDAutresSourcesOuInconnues: f.otherLeads,
});
