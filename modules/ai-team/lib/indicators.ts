import type { Payload } from "payload";

import { timeOf } from "@/modules/ai-team/lib/format";
import { indicatorOf } from "@/modules/ai-team/lib/indicators-meta";

/**
 * LA MESURE des indicateurs d'objectif (voir indicators-meta). `measure(key, at, param)` rend la valeur à une date
 * (aujourd'hui, ou une fin de mois passée pour remplir la courbe d'un indicateur qui a un passé) ; null : pas
 * mesurable. Chaque source n'est lue qu'une fois par contexte (création d'un objectif, relevé de la semaine) et
 * reste en lecture seule ; Search Console et GA4 sont en plus gardés en cache.
 */

type Raw = Record<string, unknown>;
const DAY = 86_400_000;
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const ymOf = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
/** Le dernier mois complet à une date : « AAAAMM ». */
const lastFullMonth = (at: Date) => ymOf(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 15)));

/** Les étapes du pipeline et leur poids : le pipeline pondéré, le même pour la feuille de route, Élise et Nathan. */
export const PIPELINE_WEIGHTS: Record<string, number> = { "en-signature": 0.7, "en-test": 0.4, "attente-engagement": 0.3, "demo-programmee": 0.15, "en-qualification": 0.05, "attente-longue": 0.05, nouvelle: 0.03 };
/** Un lead QUALIFIÉ : son opportunité est arrivée à « Démo programmée » ou plus loin. */
export const QUALIFIED = new Set(["demo-programmee", "attente-engagement", "attente-longue", "en-test", "en-signature", "actif", "resilie"]);

type Client = { id: string; status: string; start: number | null; end: number | null; amount: number; history: { at: number; caHT: number }[]; submission: string | null };

/** Le montant mensuel d'un client à une date : la ligne d'historique en vigueur, sinon son montant actuel. Pure (testée). */
export function amountAt(c: Pick<Client, "amount" | "history">, at: number): number {
  const past = c.history.filter((h) => h.at <= at).sort((a, b) => b.at - a.at)[0];
  return past ? past.caHT : c.amount;
}

const CLIENT_SELECT = { clientStatus: true, contractStartDate: true, resiliationDate: true, caPaye: true, caBrut: true, history: true, formSubmission: true } as const;
/** Une fiche client lue en base, prête pour le MRR (partagée avec la santé des clients de Malo). */
export function toClient(c: Raw): Client {
  const start = timeOf(c.contractStartDate);
  const end = timeOf(c.resiliationDate);
  return {
    id: String(c.id),
    status: String(c.clientStatus ?? ""),
    start: Number.isFinite(start) ? start : null,
    end: Number.isFinite(end) ? end : null,
    amount: Number(c.caPaye ?? c.caBrut ?? 0) || 0,
    history: (Array.isArray(c.history) ? (c.history as Raw[]) : []).flatMap((h) => (Number.isFinite(timeOf(h.at)) && typeof h.caHT === "number" ? [{ at: timeOf(h.at), caHT: h.caHT }] : [])),
    submission: c.formSubmission != null ? String(typeof c.formSubmission === "object" ? (c.formSubmission as Raw).id : c.formSubmission) : null,
  };
}

/** Le MRR à une date : les clients dont le contrat a démarré et n'est pas résilié. Pure (testée). */
export function mrrAt(clients: Client[], at: number): { mrr: number; count: number } {
  const live = clients.filter((c) => c.start != null && c.start <= at && (c.end == null || c.end > at) && (c.status === "actif" || c.status === "resilie"));
  return { mrr: round(live.reduce((s, c) => s + amountAt(c, at), 0)), count: live.length };
}

export type MeasureContext = { measure: (key: string, at: Date, param?: string | null) => Promise<number | null> };

/** Un contexte de mesure : les sources se lisent à la demande, une fois. */
export function measureContext(payload: Payload, now = new Date()): MeasureContext {
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(k: string, f: () => Promise<T>): Promise<T> => {
    if (!memo.has(k)) memo.set(k, f().catch(() => null));
    return memo.get(k) as Promise<T>;
  };
  const time = timeOf;

  const clients = () =>
    once("clients", async () => {
      const res = await payload.find({ collection: "partner-clients", pagination: false, depth: 0, overrideAccess: true, draft: true, select: CLIENT_SELECT as never });
      return (res.docs as unknown as Raw[]).map(toClient);
    }) as Promise<Client[] | null>;
  const submissions = () =>
    once("submissions", async () => {
      const res = await payload.find({ collection: "form-submissions", where: { createdAt: { greater_than_equal: new Date(now.getTime() - 400 * DAY).toISOString() } }, pagination: false, depth: 0, overrideAccess: true, select: { createdAt: true } as never });
      return (res.docs as unknown as Raw[]).map((s) => ({ id: String(s.id), at: time(s.createdAt) }));
    }) as Promise<{ id: string; at: number }[] | null>;
  const gsc = () => once("gsc", () => import("@/modules/analytics/lib/seo-gsc").then((m) => m.loadGsc(12, now))) as Promise<Awaited<ReturnType<typeof import("@/modules/analytics/lib/seo-gsc").loadGsc>> | null>;
  const gsc3 = () => once("gsc3", () => import("@/modules/analytics/lib/seo-gsc").then((m) => m.loadGsc(3, now))) as Promise<Awaited<ReturnType<typeof import("@/modules/analytics/lib/seo-gsc").loadGsc>> | null>;
  const ga4 = () => once("ga4", () => import("@/modules/analytics/lib/seo-ga4").then((m) => m.loadGa4Rows(12, now))) as Promise<Awaited<ReturnType<typeof import("@/modules/analytics/lib/seo-ga4").loadGa4Rows>> | null>;
  const page = (path: string) => once(`page:${path}`, () => import("@/modules/analytics/lib/seo-ga4").then((m) => m.loadGa4PageViews(path, now))) as Promise<Awaited<ReturnType<typeof import("@/modules/analytics/lib/seo-ga4").loadGa4PageViews>> | null>;
  const classify = () => once("classify", () => import("@/modules/analytics/lib/seo-ga4").then((m) => m.classifyGa4Source)) as Promise<((s: string, m: string) => { kind: string } | null) | null>;
  const latest = <T>(k: string, f: () => Promise<T>) => once(`latest:${k}`, f) as Promise<T | null>;

  const ga4Month = async (at: Date, pick: (source: string, medium: string) => Promise<boolean> | boolean) => {
    const r = await ga4();
    if (!r || r.status !== "ok") return null;
    const ym = lastFullMonth(at);
    const rows = r.data.rows.filter((x) => x.month === ym);
    if (!rows.length) return null;
    let total = 0;
    for (const x of rows) if (await pick(x.source, x.medium)) total += x.sessions;
    return total;
  };
  const gscMonth = async (at: Date, field: "clicks" | "impressions" | "position") => {
    const r = await gsc();
    if (!r || r.status !== "ok") return null;
    const ym = lastFullMonth(at);
    const m = r.data.monthly.find((x) => x.month.replace("-", "").slice(0, 6) === ym);
    return m ? (field === "position" ? (m.position == null ? null : round(m.position, 1)) : m[field]) : null;
  };

  const measure = async (key: string, at: Date, param?: string | null): Promise<number | null> => {
    const t = at.getTime();
    switch (key) {
      case "mrr":
      case "clients-actifs": {
        const list = await clients();
        if (!list) return null;
        const r = mrrAt(list, t);
        return key === "mrr" ? r.mrr : r.count;
      }
      case "mrr-nouveau-30j": {
        const list = await clients();
        if (!list) return null;
        return round(list.filter((c) => c.start != null && c.start > t - 30 * DAY && c.start <= t && (c.status === "actif" || c.status === "resilie")).reduce((s, c) => s + amountAt(c, t), 0));
      }
      case "mrr-signature":
      case "mrr-test":
      case "pipeline-pondere": {
        const list = await clients();
        if (!list) return null;
        if (key === "pipeline-pondere") return round(list.reduce((s, c) => s + c.amount * (PIPELINE_WEIGHTS[c.status] ?? 0), 0));
        const status = key === "mrr-signature" ? "en-signature" : "en-test";
        return round(list.filter((c) => c.status === status).reduce((s, c) => s + c.amount, 0));
      }
      case "leads-30j":
      case "leads-qualifies-30j": {
        const subs = await submissions();
        if (!subs) return null;
        // Avant le premier formulaire enregistré dans le support, ce n'est pas zéro : on ne sait pas.
        const first = Math.min(...subs.map((x) => x.at));
        if (!subs.length || t - 30 * DAY < first) return null;
        const inWindow = subs.filter((s) => s.at > t - 30 * DAY && s.at <= t);
        if (key === "leads-30j") return inWindow.length;
        const list = await clients();
        const qualified = new Set((list ?? []).filter((c) => c.submission && QUALIFIED.has(c.status)).map((c) => c.submission));
        return inWindow.filter((s) => qualified.has(s.id)).length;
      }
      case "clics-google":
        return gscMonth(at, "clicks");
      case "impressions-google":
        return gscMonth(at, "impressions");
      case "position-google":
        return gscMonth(at, "position");
      case "clics-marque":
      case "clics-hors-marque": {
        const r = await gsc3();
        if (!r || r.status !== "ok") return null;
        return round((key === "clics-marque" ? r.data.brand.brandedClicks : r.data.brand.nonBrandedClicks) / 3);
      }
      case "visites-site":
        return ga4Month(at, () => true);
      case "visites-moteurs":
      case "visites-ia": {
        const c = await classify();
        if (!c) return null;
        return ga4Month(at, (s, m) => c(s, m)?.kind === (key === "visites-ia" ? "ai" : "search"));
      }
      case "vues-page": {
        const path = String(param ?? "").trim();
        if (!path.startsWith("/")) return null;
        const r = await page(path);
        if (!r || r.status !== "ok") return null;
        // Un mois avant la mesure du site par GA4 n'est pas un zéro : on ne sait pas.
        const site = await ga4();
        const measured = site && site.status === "ok" ? new Set(site.data.rows.map((x) => x.month)) : null;
        const ym = lastFullMonth(at);
        if (measured && !measured.has(ym)) return null;
        return r.data.find((x) => x.month === ym)?.views ?? 0;
      }
      case "ia-mentions": {
        const v = await latest("ia", () => import("@/modules/ai-team/lib/ai-visibility").then((m) => m.visibilityState(payload, now)));
        return v?.measure.answers ? v.measure.overall.mentionPct : null;
      }
      case "abonnes-reseaux":
      case "vues-reseaux": {
        const s = await latest("social", () => import("@/modules/ai-team/lib/social").then((m) => m.latestSocial(payload, now)));
        const nets = s?.measure?.networks ?? [];
        if (!nets.length) return null;
        return nets.reduce((n, x) => n + ((key === "abonnes-reseaux" ? x.followers : x.views) ?? 0), 0);
      }
      case "pages-indexees": {
        const tech = await latest("tech", () => import("@/modules/ai-team/lib/site-health").then((m) => m.latestTech(payload, now)));
        const h = tech?.health;
        return h && h.indexed != null && h.inspected ? round((h.indexed / h.inspected) * 100, 1) : null;
      }
      default:
        return null;
    }
  };
  return { measure };
}

export type Measure = { at: string; value: number; source: "auto" | "historique" | "manuel" };

/** Les indicateurs lus sur le dernier mois complet (un point par mois suffit). */
const MONTHLY = new Set(["clics-google", "impressions-google", "position-google", "visites-site", "visites-moteurs", "visites-ia", "vues-page"]);

/**
 * La courbe de départ d'un objectif : le passé (une fin de mois sur 12, si l'indicateur en a un) et la valeur du
 * jour. Rien pour une saisie manuelle.
 */
export async function initialMeasures(ctx: MeasureContext, key: string, param: string | null, now = new Date()): Promise<Measure[]> {
  const meta = indicatorOf(key);
  if (!meta || key === "manuel") return [];
  const out: Measure[] = [];
  if (meta.history) {
    for (let i = 12; i >= 1; i--) {
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 12));
      // Un indicateur « du mois » se lit au lendemain de la fin du mois (le mois est alors complet).
      const at = new Date(end.getTime() + DAY);
      const v = await ctx.measure(key, at, param);
      if (v != null) out.push({ at: end.toISOString(), value: v, source: "historique" });
    }
  }
  // Un indicateur « du mois » se lit sur le dernier mois complet : la valeur du jour est déjà le dernier point.
  if (MONTHLY.has(key) && out.length) return out;
  const today = await ctx.measure(key, now, param);
  if (today != null) out.push({ at: now.toISOString(), value: today, source: "auto" });
  return out;
}

/**
 * Le dernier essai de relevé de chaque objectif, dans la mémoire du serveur : un objectif dont la source ne répond
 * pas, ou dont l'indicateur du mois n'a pas bougé, n'est pas remesuré à chaque réveil de la minute, mais au plus
 * toutes les 6 heures (relecture du 15/11/2026).
 */
const lastAttempt = new Map<string, number>();
const RETRY_MS = 6 * 3_600_000;

/** Relève les objectifs en cours dont la dernière mesure date de plus de 6 jours. Rend le nombre d'objectifs relevés. */
export async function measureGoals(payload: Payload, now = new Date()): Promise<number> {
  const res = await payload.find({ collection: "ai-team-goals", where: { and: [{ status: { in: ["propose", "valide"] } }, { kind: { equals: "chiffre" } }, { metric: { not_equals: "manuel" } }] }, pagination: false, depth: 0, overrideAccess: true }).catch(() => null);
  const goals = (res?.docs ?? []) as unknown as Raw[];
  const ctx = measureContext(payload, now);
  let done = 0;
  for (const g of goals) {
    const measures = ((Array.isArray(g.measures) ? g.measures : []) as Measure[]).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const last = measures.filter((m) => m.source !== "historique").map((m) => Date.parse(m.at)).sort((a, b) => b - a)[0];
    if (last && now.getTime() - last < 6 * DAY) continue;
    if (now.getTime() - (lastAttempt.get(String(g.id)) ?? 0) < RETRY_MS) continue;
    lastAttempt.set(String(g.id), now.getTime());
    const v = await ctx.measure(String(g.metric), now, (g.param as string | null) ?? null);
    if (v == null) continue;
    // Un indicateur « du mois » ne change qu'une fois par mois : pas de point en double chaque lundi.
    const prev = measures.at(-1);
    if (MONTHLY.has(String(g.metric)) && prev && prev.value === v && now.getTime() - Date.parse(prev.at) < 40 * DAY) continue;
    await payload.update({ collection: "ai-team-goals", id: g.id as number, data: { measures: [...measures, { at: now.toISOString(), value: v, source: "auto" }] } as never, overrideAccess: true }).catch(() => null);
    done += 1;
  }
  return done;
}
