import type { Payload } from "payload";

import { delta, lastMonths, periodBounds, type Delta } from "@/modules/analytics/lib/growth";
import { monthStart } from "@/modules/partner/lib/month";

/**
 * D'où vient un lead NON PAYÉ : un moteur de recherche (SEO) ou un assistant IA
 * (GEO) — et lequel.
 *
 * C'est la seule mesure GEO qu'on possède déjà, sans rien connecter : chaque
 * soumission garde son référent et ses UTM. ChatGPT ajoute `utm_source=chatgpt.com`
 * à ses liens sortants, Perplexity et Copilot laissent leur domaine en référent.
 * Une partie du trafic IA arrive SANS référent (applications mobiles, copier-
 * coller) et tombe en « direct » : ce compte est donc un PLANCHER, pas un total.
 *
 * Un clic payant (gclid, msclkid, oaiclid, utm_medium payant) n'est jamais
 * compté ici — c'est le canal de la soumission qui le dit (`sea`, `chatgpt`,
 * `meta-*`), on l'écarte avant de classer.
 *
 * Pur : « maintenant » est passé en paramètre.
 */

export type Engine = { key: string; label: string; kind: "ai" | "search" };

/** Ordre = ordre d'affichage. Les domaines sont comparés en fin de nom d'hôte. */
export const ENGINES: (Engine & { hosts: string[]; utm?: string[] })[] = [
  { key: "chatgpt", label: "ChatGPT", kind: "ai", hosts: ["chatgpt.com", "chat.openai.com", "openai.com"], utm: ["chatgpt.com", "chatgpt", "openai"] },
  { key: "perplexity", label: "Perplexity", kind: "ai", hosts: ["perplexity.ai"], utm: ["perplexity", "perplexity.ai"] },
  { key: "gemini", label: "Gemini", kind: "ai", hosts: ["gemini.google.com", "bard.google.com"], utm: ["gemini", "gemini.google.com"] },
  { key: "copilot", label: "Copilot", kind: "ai", hosts: ["copilot.microsoft.com", "copilot.cloud.microsoft", "edgeservices.bing.com"], utm: ["copilot"] },
  { key: "claude", label: "Claude", kind: "ai", hosts: ["claude.ai"], utm: ["claude", "claude.ai"] },
  { key: "mistral", label: "Le Chat (Mistral)", kind: "ai", hosts: ["chat.mistral.ai"], utm: ["mistral", "lechat"] },
  { key: "deepseek", label: "DeepSeek", kind: "ai", hosts: ["chat.deepseek.com"], utm: ["deepseek"] },
  { key: "grok", label: "Grok", kind: "ai", hosts: ["grok.com", "x.ai"], utm: ["grok"] },
  { key: "meta-ai", label: "Meta AI", kind: "ai", hosts: ["meta.ai"], utm: ["meta.ai"] },
  // Moteurs : après les IA — gemini.google.com doit gagner sur google.*.
  { key: "google", label: "Google", kind: "search", hosts: ["google."] },
  { key: "bing", label: "Bing", kind: "search", hosts: ["bing.com"] },
  { key: "qwant", label: "Qwant", kind: "search", hosts: ["qwant.com"] },
  { key: "ecosia", label: "Ecosia", kind: "search", hosts: ["ecosia.org"] },
  { key: "duckduckgo", label: "DuckDuckGo", kind: "search", hosts: ["duckduckgo.com"] },
  { key: "yahoo", label: "Yahoo", kind: "search", hosts: ["yahoo.com", "search.yahoo."] },
  { key: "brave", label: "Brave Search", kind: "search", hosts: ["search.brave.com"] },
  { key: "lilo", label: "Lilo", kind: "search", hosts: ["lilo.org"] },
];

/** Canaux de soumission qui sont des clics achetés : jamais du SEO ni du GEO. */
const PAID_CHANNELS = new Set(["sea", "chatgpt", "meta-facebook", "meta-instagram"]);

const hostOf = (url: string | null | undefined): string | null => {
  if (!url?.trim()) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** « google. » correspond à google.fr, google.com… ; « bing.com » à bing.com et cn.bing.com. */
export const hostMatches = (host: string, pattern: string) =>
  pattern.endsWith(".") ? host === pattern.slice(0, -1) || host.startsWith(pattern) || host.includes(`.${pattern}`) : host === pattern || host.endsWith(`.${pattern}`);

export type SourceRow = {
  id: number | string;
  createdAt?: string | null;
  channel?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  gclid?: string | null;
  msclkid?: string | null;
  oaiclid?: string | null;
  fbclid?: string | null;
  landingPath?: string | null;
  sourcePagePath?: string | null;
};

/** Un moteur tel qu'on le rend (sans ses domaines ni ses étiquettes de lien). */
export const engineOf = (e: { key: string; label: string; kind: Engine["kind"] }): Engine => ({ key: e.key, label: e.label, kind: e.kind });

/** L'ordre d'affichage des moteurs, pour départager à égalité. */
export const ENGINE_ORDER = new Map(ENGINES.map((e, i) => [e.key, i]));

/** Le moteur ou l'assistant d'un lead non payé — null s'il ne vient ni de l'un ni de l'autre. */
export function classifySource(r: SourceRow): Engine | null {
  if (PAID_CHANNELS.has(r.channel ?? "") || r.gclid || r.msclkid || r.oaiclid || r.fbclid) return null;
  const medium = r.utmMedium?.trim().toLowerCase();
  if (medium && /(cpc|ppc|cpm|paid)/.test(medium)) return null;
  const utm = r.utmSource?.trim().toLowerCase();
  if (utm) {
    const hit = ENGINES.find((e) => e.utm?.includes(utm));
    if (hit) return engineOf(hit);
  }
  const host = hostOf(r.referrer);
  if (!host) return null;
  const hit = ENGINES.find((e) => e.hosts.some((h) => hostMatches(host, h)));
  return hit ? engineOf(hit) : null;
}

export type LeadClient = { formSubmission?: number | string | { id: number | string } | null; clientStatus?: string | null };

const WON = new Set(["actif", "resilie", "archive"]);
const subId = (v: LeadClient["formSubmission"]) => (v && typeof v === "object" ? v.id : v);

export type EngineStat = { key: string; label: string; kind: "ai" | "search"; leads: number; opportunities: number; won: number; conversion: number | null; delta: Delta };
export type PageStat = { path: string; search: number; ai: number; total: number };

export type OrganicAnalytics = {
  kpis: { search: Delta; ai: Delta; aiShare: number | null; won: number; organicTotal: number };
  monthly: { month: string; search: number; ai: number }[];
  engines: EngineStat[];
  pages: PageStat[];
  /** Les soumissions de la période, toutes origines : le dénominateur de la part organique. */
  allLeads: number;
};

export function buildOrganicAnalytics(rows: SourceRow[], clients: LeadClient[], months: number, now: Date): OrganicAnalytics {
  const { from, prevFrom } = periodBounds(months, now);
  const byLead = new Map<string, LeadClient>();
  for (const c of clients) {
    const id = subId(c.formSubmission);
    if (id != null) byLead.set(String(id), c);
  }

  const monthKeys = lastMonths(months, now);
  const monthly = new Map(monthKeys.map((m) => [m, { month: m, search: 0, ai: 0 }]));
  const stats = new Map<string, EngineStat & { prev: number }>();
  const pages = new Map<string, PageStat>();
  let allLeads = 0;
  const cur = { search: 0, ai: 0 };
  const prev = { search: 0, ai: 0 };

  for (const r of rows) {
    const t = r.createdAt ? Date.parse(r.createdAt) : NaN;
    if (!Number.isFinite(t) || t < prevFrom) continue;
    const inPeriod = t >= from;
    if (inPeriod) allLeads += 1;
    const e = classifySource(r);
    if (!e) continue;
    const s = stats.get(e.key) ?? { ...e, leads: 0, opportunities: 0, won: 0, conversion: null, delta: delta(0, 0), prev: 0 };
    stats.set(e.key, s);
    if (!inPeriod) {
      prev[e.kind] += 1;
      s.prev += 1;
      continue;
    }
    cur[e.kind] += 1;
    s.leads += 1;
    const client = byLead.get(String(r.id));
    if (client) {
      s.opportunities += 1;
      if (WON.has(client.clientStatus ?? "")) s.won += 1;
    }
    const m = monthly.get(monthStart(r.createdAt!));
    if (m) m[e.kind] += 1;
    const path = r.landingPath || r.sourcePagePath || "(inconnue)";
    const p = pages.get(path) ?? { path, search: 0, ai: 0, total: 0 };
    p[e.kind] += 1;
    p.total += 1;
    pages.set(path, p);
  }

  const engines = [...stats.values()]
    .filter((s) => s.leads || s.prev)
    .map(({ prev: p, ...s }) => ({ ...s, conversion: s.leads ? Math.round((s.won / s.leads) * 1000) / 10 : null, delta: delta(s.leads, p) }))
    .sort((a, b) => b.leads - a.leads || ENGINE_ORDER.get(a.key)! - ENGINE_ORDER.get(b.key)!);
  const organic = cur.search + cur.ai;

  return {
    kpis: {
      search: delta(cur.search, prev.search),
      ai: delta(cur.ai, prev.ai),
      aiShare: organic ? Math.round((cur.ai / organic) * 1000) / 10 : null,
      won: engines.reduce((n, e) => n + e.won, 0),
      organicTotal: organic,
    },
    monthly: [...monthly.values()],
    engines,
    pages: [...pages.values()].sort((a, b) => b.total - a.total).slice(0, 25),
    allLeads,
  };
}

/**
 * Les leads organiques et IA, lus en base : les formulaires de la période et
 * de la précédente, et les opportunités nées d'un formulaire. Partagé par
 * l'écran SEO & GEO et la revue du chef SEO/GEO.
 */
export async function loadOrganicAnalytics(payload: Payload, months: number, now: Date): Promise<OrganicAnalytics> {
  const [rows, clients] = await Promise.all([loadLeadRows(payload, periodBounds(months, now).prevFrom), loadLeadClients(payload)]);
  return buildOrganicAnalytics(rows, clients, months, now);
}

/** Les formulaires depuis `since` (ms), avec tout ce qui dit d'où vient le lead. */
export const loadLeadRows = (payload: Payload, since: number): Promise<SourceRow[]> =>
  payload
    .find({
      collection: "form-submissions",
      // Seule la période utile compte : on ne lit pas le reste.
      where: { createdAt: { greater_than_equal: new Date(since).toISOString() } },
      limit: 20000,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: { createdAt: true, channel: true, referrer: true, utmSource: true, utmMedium: true, gclid: true, msclkid: true, oaiclid: true, fbclid: true, landingPath: true, sourcePagePath: true } as never,
    })
    .then((r) => r.docs as unknown as SourceRow[]);

/** Les opportunités nées d'un formulaire (leur statut). */
export const loadLeadClients = (payload: Payload): Promise<LeadClient[]> =>
  payload
    .find({ collection: "partner-clients", where: { formSubmission: { exists: true } }, pagination: false, depth: 0, draft: true, overrideAccess: true, select: { formSubmission: true, clientStatus: true } as never })
    .then((r) => r.docs as unknown as LeadClient[]);
