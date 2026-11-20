import type { Payload } from "payload";

import { assertAdsBudget, recordAdsUsage } from "@/modules/ads/lib/spend";
import { keywordKey } from "@/modules/editorial/lib/competitors/content";
import { fetchSerp, isDataForSeoConfigured, OUR_DOMAIN, type Serp } from "@/modules/editorial/lib/competitors/dataforseo";
import { competitorsDomain, keywordOverview, rankedKeywords, type RankedRow } from "@/modules/editorial/lib/seo/labs";

/**
 * LE SUIVI DES REQUÊTES ET LE MARCHÉ SEO (19/11/2026), pour les agents SEO/GEO.
 *
 *  - CHAQUE SEMAINE : chaque requête suivie est relevée (top 20 de google.fr, réponse IA
 *    chargée : ≈ 0,006 $), 10 par heure au plus. Le relevé sert aussi au comparateur
 *    (pas de double paiement dans les 7 jours).
 *  - CHAQUE MOIS (1er lundi) : nos requêtes classées, nos concurrents réels, leurs requêtes
 *    où nous sommes absents (opportunités), volumes et difficultés (≈ 0,40 $).
 *  - PAGES CLÉS : la requête de chaque page du site (hors articles et fiches) et sa
 *    couverture face au top 10, 2 par heure au plus.
 * Tout passe par le budget « seo » ; rien ne part si DataForSEO n'est pas branché.
 */

type Raw = Record<string, unknown>;
const DAY = 86_400_000;
const COLL = "seo-keywords" as never;
export const TRACK_PER_HOUR = 10;
export const PAGES_PER_HOUR = 2;
const MAX_TRACKED = 150;

// ── Lectures pures (testées) ─────────────────────────────────────────────────

/** Une page du site qui n'est ni un article ni une fiche métier. Pure. */
export function isSitePage(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  // Le site vitrine seulement (pas app., support.…), hors accueil, blog, articles, fiches et pages légales.
  if (!/^(www\.)?tim-management\.co$/.test(u.hostname)) return false;
  const path = u.pathname.replace(/\/$/, "");
  if (!path || /^\/(actualite|fiche-metier|metier|blog|category|tag|author)(\/|$)/.test(path)) return false;
  return !/^\/(contact|mentions|cgu|cgv|confidentialite|politique)/.test(path);
}

/** Une requête de marque (« tim », « tim management ») : jamais une page clé ni une opportunité. Pure. */
export const isBrandQuery = (k: string) => /(^|\s)tim(\s|$)|tim-management|timmanagement/i.test(k);

/** Sites publics et généralistes : ils se classent sur tout, ce ne sont pas des concurrents. Pure. */
export const isGeneralistDomain = (d: string, totalKeywords?: number | null) => /\.gouv\.fr$|(^|\.)service-public\.fr$|legifrance|wikipedia|youtube|linkedin|facebook|indeed|pole-emploi|francetravail|urssaf|ameli|caf\.fr|insee/i.test(d) || (totalKeywords ?? 0) > 200_000;

// Mots qui ne disent rien du sujet : ils ne rattachent jamais une requête à nos thèmes.
const GENERIC_WORDS = new Set("montant calcul calculer calculs combien comment definition exemple exemples modele modeles gratuit gratuite france francais quel quelle quels quelles prix tarif cout couts date dates delai liste nouveau nouvelle net brut horaire mensuel mensuelle annuel annuelle jour jours mois semaine annee plus moins faire avoir pour dans avec sans entre vers selon chez quand legal legale".split(" "));
const wordsOf = (k: string) => keywordKey(k).split(/[^a-z0-9]+/).filter((x) => x.length >= 4 && !/^\d+$/.test(x) && !GENERIC_WORDS.has(x));

/** La forme canonique d'une requête : ses mots sans ordre, pluriel ni terminaison verbale (« calculer » = « calcul »). Pure. */
export const canonicalQuery = (k: string) =>
  [...new Set(keywordKey(k).split(/[^a-z0-9]+/).filter((w) => w && !["de", "du", "des", "le", "la", "les", "un", "une", "d", "l", "a", "en", "et"].includes(w)).map((w) => w.replace(/(er|es|s|e)$/, "")))].sort().join(" ");

/** Le vocabulaire de nos sujets : les mots porteurs qui reviennent dans au moins 3 de nos requêtes classées. Pure. */
export function topicVocabulary(rows: { keyword: string }[]): Set<string> {
  const n = new Map<string, number>();
  for (const r of rows) for (const w of new Set(wordsOf(r.keyword))) n.set(w, (n.get(w) ?? 0) + 1);
  return new Set([...n.entries()].filter(([, c]) => c >= 3).map(([w]) => w));
}

/** La part des mots porteurs d'une requête qui appartiennent à nos sujets (0 à 1). Pure. */
export function topicShare(keyword: string, vocab: Set<string>): number {
  const w = wordsOf(keyword);
  if (!w.length) return 0;
  return w.filter((x) => vocab.has(x)).length / w.length;
}

/** Ce qu'un relevé change sur une requête suivie. Pure (testée). */
export function serpUpdate(doc: Raw, serp: Serp, now: Date) {
  const prev = doc.position == null ? null : Number(doc.position);
  const pos = serp.ourPosition ?? null;
  const change = prev != null && pos != null ? prev - pos : null;
  const best = pos == null ? (doc.bestPosition ?? null) : doc.bestPosition == null ? pos : Math.min(Number(doc.bestPosition), pos);
  const ai = serp.aiOverview ?? { present: false, sources: [] };
  const cited = ai.sources.some((s) => s.domain === OUR_DOMAIN || s.domain.endsWith(`.${OUR_DOMAIN}`));
  const history = [...(Array.isArray(doc.history) ? (doc.history as Raw[]) : []), { date: now.toISOString().slice(0, 10), position: pos, ia: ai.present, citee: cited }].slice(-26);
  return {
    position: pos,
    positionChange: change,
    bestPosition: best,
    positionUrl: serp.ourUrl ?? null,
    top1Domain: serp.organic[0]?.domain ?? null,
    top10: serp.organic.slice(0, 10).map((o) => ({ rang: o.rank, domaine: o.domain, titre: o.title })),
    aiOverview: ai.present,
    aiCited: cited,
    aiSources: ai.sources.slice(0, 15),
    checkedAt: now.toISOString(),
    history,
    serp: { takenAt: now.toISOString(), organic: serp.organic, questions: serp.questions, checkUrl: serp.checkUrl },
  };
}

/**
 * Les opportunités : requêtes où au moins un concurrent est dans le top 10 et où nous sommes
 * absents (ou au-delà de la 20e place). Les requêtes de marque d'un concurrent sont écartées.
 * Classées par volume × facilité × nombre de concurrents. Pure (testée).
 */
export function findOpportunities(ours: RankedRow[], theirs: { domain: string; rows: RankedRow[] }[], limit = 80) {
  // Nos positions, aussi par forme canonique : « calcul heure de travail » = « calculer heure de travail ».
  const ourPos = new Map<string, number>();
  for (const r of ours) for (const k of [keywordKey(r.keyword), canonicalQuery(r.keyword)]) ourPos.set(k, Math.min(ourPos.get(k) ?? 999, r.position));
  // Seulement nos sujets (au moins la moitié des mots porteurs dans notre vocabulaire), jamais une requête de navigation.
  const vocab = topicVocabulary(ours);
  const onTopic = (k: string) => !vocab.size || topicShare(k, vocab) >= 0.5;
  const byKey = new Map<string, { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; cpc: number | null; competitors: { domain: string; position: number; url: string }[] }>();
  for (const t of theirs) {
    const brand = t.domain.split(".").slice(-2, -1)[0]?.toLowerCase() ?? "";
    for (const r of t.rows) {
      const k = keywordKey(r.keyword);
      if (!k || (brand.length >= 3 && k.replace(/\s+/g, "").includes(brand.replace(/-/g, "")))) continue;
      if (r.intent === "navigational" || isBrandQuery(k) || !onTopic(k)) continue;
      const mine = Math.min(ourPos.get(k) ?? 999, ourPos.get(canonicalQuery(r.keyword)) ?? 999);
      if (mine <= 20) continue;
      const o = byKey.get(k) ?? { keyword: r.keyword, volume: r.volume, difficulty: r.difficulty, intent: r.intent, cpc: r.cpc, competitors: [] };
      // Un concurrent compte une fois (sa meilleure page).
      const same = o.competitors.find((c) => c.domain === t.domain);
      if (same) {
        if (r.position < same.position) Object.assign(same, { position: r.position, url: r.url });
      } else o.competitors.push({ domain: t.domain, position: r.position, url: r.url });
      byKey.set(k, o);
    }
  }
  // Racine du volume : une requête grand public énorme ne passe pas devant dix requêtes de métier.
  const score = (o: { keyword: string; volume: number | null; difficulty: number | null; competitors: unknown[] }) => Math.sqrt(o.volume ?? 0) * (1 - (o.difficulty ?? 50) / 100) * o.competitors.length * topicShare(o.keyword, vocab);
  // Les variantes d'une même requête (« smic horaire net », « net horaire smic ») : une seule, la plus recherchée.
  const groups = new Map<string, ReturnType<typeof byKey.get> & { variantes: number }>();
  for (const o of [...byKey.values()].sort((a, b) => Number(b.volume ?? 0) - Number(a.volume ?? 0))) {
    const canon = canonicalQuery(o.keyword);
    const g = groups.get(canon);
    if (g) g.variantes++;
    else groups.set(canon, { ...o, variantes: 0 });
  }
  return [...groups.values()].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

/** Le classement d'une opportunité enregistrée (volume, facilité, nombre de concurrents). Pure. */
export const opportunityScore = (d: { volume?: unknown; difficulty?: unknown; competitorsRanking?: unknown }) => Math.sqrt(Number(d.volume ?? 0)) * (1 - Number(d.difficulty ?? 50) / 100) * Math.max(1, Array.isArray(d.competitorsRanking) ? d.competitorsRanking.length : 1);

// ── Écritures ────────────────────────────────────────────────────────────────

async function upsert(payload: Payload, keyword: string, data: Raw, o: { keepTracked?: boolean } = {}) {
  const key = keywordKey(keyword);
  const existing = (await payload.find({ collection: COLL, where: { keywordKey: { equals: key } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as Raw | undefined;
  if (existing) {
    // Ce que la direction ou un agent a posé (origine, suivi, page visée) n'est jamais écrasé.
    const keep = { ...data };
    if (o.keepTracked !== false) delete keep.tracked;
    if (existing.source && existing.source !== "opportunite" && existing.source !== "classee") delete keep.source;
    if (existing.targetUrl) delete keep.targetUrl;
    await payload.update({ collection: COLL, id: existing.id as number, overrideAccess: true, data: keep as never });
    return existing.id;
  }
  const created = await payload.create({ collection: COLL, overrideAccess: true, data: { keyword, ...data } as never });
  return (created as unknown as Raw).id;
}

/** Les requêtes des articles en ligne, suivies (sans appel). */
export async function seedFromArticles(payload: Payload) {
  const docs = (await payload.find({ collection: "articles" as never, where: { status: { in: ["publie", "a-rafraichir"] } }, pagination: false, depth: 0, overrideAccess: true, select: { keyword: true, wpFocusKeyword: true, wpLink: true } as never })).docs as unknown as Raw[];
  let n = 0;
  for (const d of docs) {
    const k = String(d.keyword || d.wpFocusKeyword || "").trim();
    if (!k) continue;
    await upsert(payload, k, { source: "article", tracked: true, targetUrl: d.wpLink ?? null });
    n++;
  }
  return n;
}

/** Un relevé appliqué à une requête suivie (aussi appelé par le comparateur quand il relève lui-même). */
export async function applySerp(payload: Payload, keyword: string, serp: Serp, now = new Date()) {
  const doc = (await payload.find({ collection: COLL, where: { keywordKey: { equals: keywordKey(keyword) } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as Raw | undefined;
  if (!doc) return false;
  await payload.update({ collection: COLL, id: doc.id as number, overrideAccess: true, data: serpUpdate(doc, serp, now) as never });
  return true;
}

/** Un relevé récent (moins de 7 jours) d'une requête suivie, pour le comparateur. */
export async function recentSerp(payload: Payload, keyword: string, now = new Date()): Promise<Serp | null> {
  const doc = (await payload.find({ collection: COLL, where: { keywordKey: { equals: keywordKey(keyword) } }, limit: 1, depth: 0, overrideAccess: true, select: { serp: true, position: true, positionUrl: true, aiOverview: true, aiSources: true } as never }).catch(() => ({ docs: [] }))).docs[0] as unknown as Raw | undefined;
  const s = doc?.serp as { takenAt?: string; organic?: Serp["organic"]; questions?: string[]; checkUrl?: string | null } | undefined;
  if (!s?.takenAt || !s.organic?.length || now.getTime() - Date.parse(s.takenAt) > 7 * DAY) return null;
  return { keyword, organic: s.organic, questions: s.questions ?? [], costUsd: 0, checkUrl: s.checkUrl ?? null };
}

/** Le relevé de la semaine : les requêtes suivies dues (jamais relevées d'abord). */
export async function trackDue(payload: Payload, o: { limit?: number; now?: Date } = {}) {
  if (!isDataForSeoConfigured()) return { tracked: 0, errors: ["DataForSEO n'est pas branché."] };
  const now = o.now ?? new Date();
  await seedFromArticles(payload).catch(() => 0);
  const limit = new Date(now.getTime() - 6.5 * DAY).toISOString();
  const due = (await payload.find({ collection: COLL, where: { and: [{ tracked: { equals: true } }, { or: [{ checkedAt: { exists: false } }, { checkedAt: { less_than: limit } }] }] } as never, sort: "checkedAt", limit: o.limit ?? TRACK_PER_HOUR, depth: 0, overrideAccess: true })).docs as unknown as Raw[];
  const errors: string[] = [];
  let tracked = 0;
  for (const d of due) {
    try {
      await assertAdsBudget(payload, "seo", 0.01, now);
      const serp = await fetchSerp(String(d.keyword));
      await recordAdsUsage(payload, { kind: "seo", provider: "dataforseo", model: "serp-google-live-advanced", usd: serp.costUsd, detail: `position sur « ${String(d.keyword).slice(0, 60)} »` });
      await payload.update({ collection: COLL, id: d.id as number, overrideAccess: true, data: serpUpdate(d, serp, now) as never });
      tracked++;
    } catch (e) {
      errors.push(`${String(d.keyword)} : ${e instanceof Error ? e.message : String(e)}`);
      // Seuls le budget, l'interrupteur ou le crédit DataForSEO arrêtent la série ; une erreur passagère de Google, non.
      if (/budget|Interrupteur|crédit|balance|funds|402\d\d/i.test(String(e))) break;
    }
  }
  return { tracked, errors };
}

/** L'analyse du mois : nos requêtes, nos concurrents, les opportunités, les volumes. */
export async function runMonthlyLabs(payload: Payload, o: { force?: boolean; now?: Date } = {}) {
  if (!isDataForSeoConfigured()) return { skipped: "DataForSEO n'est pas branché." };
  const now = o.now ?? new Date();
  const market = (await payload.findGlobal({ slug: "seo-market" as never, overrideAccess: true }).catch(() => null)) as Raw | null;
  if (!o.force && market?.ranAt && now.getTime() - Date.parse(String(market.ranAt)) < 25 * DAY) return { skipped: "Analyse du mois déjà faite." };
  await assertAdsBudget(payload, "seo", 0.6, now);
  await seedFromArticles(payload).catch(() => 0);
  let cost = 0;
  const errors: string[] = [];
  const note = async (usd: number, detail: string) => {
    cost += usd;
    await recordAdsUsage(payload, { kind: "seo", provider: "dataforseo", model: "dataforseo-labs", usd, detail });
  };

  // 1. Nos requêtes classées (les 1 000 plus recherchées).
  const ours = await rankedKeywords(OUR_DOMAIN, { limit: 1000, maxPosition: 100 });
  await note(ours.cost, "requêtes classées de tim-management.co");
  for (const r of ours.rows.filter((x) => x.position <= 30 && (x.volume ?? 0) >= 50).slice(0, 200)) {
    await upsert(payload, r.keyword, { source: "classee", tracked: false, volume: r.volume, difficulty: r.difficulty, intent: r.intent, cpc: r.cpc, metricsAt: now.toISOString() });
  }
  // Pages clés : la requête la plus recherchée de chaque page du site (hors articles et fiches), suivie.
  const bestByPage = new Map<string, RankedRow>();
  for (const r of ours.rows) {
    const u = r.url.replace(/[#?].*$/, "");
    if (!isSitePage(u) || r.position > 50 || isBrandQuery(r.keyword)) continue;
    const cur = bestByPage.get(u);
    if (!cur || (r.volume ?? 0) > (cur.volume ?? 0)) bestByPage.set(u, r);
  }
  for (const [url, r] of bestByPage) await upsert(payload, r.keyword, { source: "page", tracked: true, targetUrl: url, volume: r.volume, difficulty: r.difficulty, intent: r.intent, cpc: r.cpc, metricsAt: now.toISOString() });

  // 2. Nos concurrents réels sur Google, et les concurrents suivis par la direction.
  const comp = await competitorsDomain(OUR_DOMAIN, 15).catch((e) => {
    errors.push(`concurrents : ${e}`);
    return { rows: [], cost: 0 };
  });
  await note(comp.cost, "concurrents de tim-management.co sur Google");
  const followed = (await payload.find({ collection: "ad-competitors" as never, where: { and: [{ status: { equals: "suivi" } }, { usages: { contains: "seo" } }] }, pagination: false, depth: 0, overrideAccess: true, select: { website: true } as never }).catch(() => ({ docs: [] }))).docs as unknown as Raw[];
  const followedDomains = followed.map((f) => String(f.website ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean);
  const realCompetitors = comp.rows.filter((c) => c.domain && c.domain !== OUR_DOMAIN && !c.domain.endsWith(`.${OUR_DOMAIN}`) && !isGeneralistDomain(c.domain, c.keywords));
  const targets = [...new Set([...realCompetitors.slice(0, 4).map((c) => c.domain), ...followedDomains.slice(0, 4)])].slice(0, 7);

  // 3. Leurs requêtes du top 10 (≥ 50 recherches par mois), et nos opportunités.
  const theirs: { domain: string; rows: RankedRow[] }[] = [];
  for (const domain of targets) {
    try {
      const r = await rankedKeywords(domain, { limit: 200, maxPosition: 10, minVolume: 50 });
      await note(r.cost, `requêtes du top 10 de ${domain}`);
      theirs.push({ domain, rows: r.rows });
    } catch (e) {
      errors.push(`${domain} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const opportunities = findOpportunities(ours.rows, theirs);
  for (const op of opportunities) {
    await upsert(payload, op.keyword, { source: "opportunite", tracked: false, volume: op.volume, difficulty: op.difficulty, intent: op.intent, cpc: op.cpc, competitorsRanking: op.competitors, metricsAt: now.toISOString() });
  }

  // 4. Volumes et difficultés des requêtes suivies qui n'en ont pas (ou vieux de 90 jours).
  const stale = (await payload.find({ collection: COLL, where: { and: [{ tracked: { equals: true } }, { or: [{ metricsAt: { exists: false } }, { metricsAt: { less_than: new Date(now.getTime() - 90 * DAY).toISOString() } }] }] } as never, pagination: false, depth: 0, overrideAccess: true, select: { keyword: true } as never })).docs as unknown as Raw[];
  if (stale.length) {
    try {
      const ov = await keywordOverview(stale.map((s) => String(s.keyword)));
      await note(ov.cost, `volumes de ${stale.length} requêtes suivies`);
      for (const m of ov.rows) await upsert(payload, m.keyword, { volume: m.volume, difficulty: m.difficulty, intent: m.intent, cpc: m.cpc, metricsAt: now.toISOString() });
    } catch (e) {
      errors.push(`volumes : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Le suivi hebdomadaire reste borné : au-delà de 150 requêtes suivies, les moins recherchées sont décochées (sauf articles et pages).
  const tracked = (await payload.find({ collection: COLL, where: { tracked: { equals: true } }, sort: "-volume", pagination: false, depth: 0, overrideAccess: true, select: { source: true } as never })).docs as unknown as Raw[];
  for (const t of tracked.slice(MAX_TRACKED).filter((t) => t.source !== "article" && t.source !== "page")) await payload.update({ collection: COLL, id: t.id as number, overrideAccess: true, data: { tracked: false } as never });

  await payload.updateGlobal({
    slug: "seo-market" as never,
    overrideAccess: true,
    data: {
      ranAt: now.toISOString(),
      costUsd: Math.round(cost * 10_000) / 10_000,
      ourKeywords: ours.total,
      ourTop10: ours.rows.filter((r) => r.position <= 10).length,
      competitors: realCompetitors.slice(0, 15).map((c) => ({ domaine: c.domain, requetesCommunes: c.shared, positionMoyenne: c.avgPosition, requetesTotales: c.keywords, analyse: targets.includes(c.domain) })),
      errors,
    } as never,
  });
  return { ourKeywords: ours.total, pages: bestByPage.size, competitors: targets, opportunities: opportunities.length, costUsd: Math.round(cost * 10_000) / 10_000, errors };
}

/** Les pages clés : couverture de notre page face au top 10 de sa requête (comparateur). */
export async function keyPagesDue(payload: Payload, o: { limit?: number; now?: Date } = {}) {
  if (!isDataForSeoConfigured()) return { analyzed: 0, errors: [] as string[] };
  const now = o.now ?? new Date();
  const limit = new Date(now.getTime() - 7 * DAY).toISOString();
  const due = (await payload.find({ collection: COLL, where: { and: [{ source: { equals: "page" } }, { tracked: { equals: true } }, { targetUrl: { exists: true } }, { or: [{ pageCheckedAt: { exists: false } }, { pageCheckedAt: { less_than: limit } }] }] } as never, sort: "pageCheckedAt", limit: o.limit ?? PAGES_PER_HOUR, depth: 0, overrideAccess: true })).docs as unknown as Raw[];
  const { analyzeKeyword } = await import("@/modules/editorial/lib/competitors/run");
  const { extractMain } = await import("@/modules/editorial/lib/competitors/extract");
  const { coverage } = await import("@/modules/editorial/lib/competitors/terms");
  const { fetchPage } = await import("@/modules/editorial/lib/articles/writer/prep");
  const errors: string[] = [];
  let analyzed = 0;
  for (const d of due) {
    try {
      const snap = await analyzeKeyword(payload, String(d.keyword), { now });
      const html = await fetchPage(String(d.targetUrl));
      if (!html) throw new Error("notre page est illisible");
      const page = extractMain(html);
      const c = coverage(page.text, snap.corpus, [page.title, ...page.h2s, ...page.h3s]);
      await payload.update({
        collection: COLL,
        id: d.id as number,
        overrideAccess: true,
        data: {
          coverage: c.score,
          coverageTarget: snap.corpus.target ?? null,
          pageCheckedAt: now.toISOString(),
          coverageGaps: {
            motsDeNotrePage: c.words,
            motsMedianeConcurrents: snap.corpus.medianWords,
            termesManquants: c.terms.filter((t) => t.state === "absent").slice(0, 12).map((t) => t.label),
            termesInsuffisants: c.terms.filter((t) => t.state === "insuffisant").slice(0, 8).map((t) => t.label),
            termesEnExces: c.terms.filter((t) => t.state === "exces").map((t) => t.label),
            entitesAbsentes: c.entities.filter((e) => !e.present).slice(0, 10).map((e) => e.label),
            questionsNonTraitees: c.questions.filter((q) => !q.covered).map((q) => q.question),
            corpusInsuffisant: c.insufficient,
          },
        } as never,
      });
      analyzed++;
    } catch (e) {
      errors.push(`${String(d.keyword)} : ${e instanceof Error ? e.message : String(e)}`);
      if (/budget|Interrupteur/i.test(String(e))) break;
    }
  }
  return { analyzed, errors };
}

/** Le bloc des agents SEO/GEO : suivi, réponses IA, pages clés, opportunités, concurrents. Sans appel. */
export async function seoMarketForAgents(payload: Payload) {
  const [all, market] = await Promise.all([
    payload.find({ collection: COLL, pagination: false, depth: 0, overrideAccess: true, select: { keyword: true, source: true, tracked: true, position: true, positionChange: true, positionUrl: true, targetUrl: true, volume: true, difficulty: true, intent: true, top1Domain: true, aiOverview: true, aiCited: true, aiSources: true, competitorsRanking: true, coverage: true, coverageTarget: true, coverageGaps: true, checkedAt: true, top10: true } as never }).then((r) => r.docs as unknown as Raw[]),
    payload.findGlobal({ slug: "seo-market" as never, overrideAccess: true }).catch(() => null) as Promise<Raw | null>,
  ]);
  if (!all.length) return null;
  const tracked = all.filter((d) => d.tracked && d.checkedAt);
  // Les titres du top 3 : ce que Google classe vraiment (des articles ? des calculettes, des modèles, des vidéos ?).
  const top3 = (d: Raw) => (Array.isArray(d.top10) ? (d.top10 as { domaine?: string; titre?: string }[]) : []).slice(0, 3).map((t) => `${t.domaine ?? "?"} — ${String(t.titre ?? "").slice(0, 90)}`);
  const row = (d: Raw) => ({ requete: d.keyword, position: d.position ?? "absent du top 20", evolution: d.positionChange ?? null, volume: d.volume ?? null, n1: d.top1Domain ?? null, top3: top3(d), notrePage: d.positionUrl ?? d.targetUrl ?? null });
  const sources = new Map<string, number>();
  for (const d of tracked) for (const s of (Array.isArray(d.aiSources) ? d.aiSources : []) as { domain: string }[]) sources.set(s.domain, (sources.get(s.domain) ?? 0) + 1);
  return {
    releveLe: tracked.map((d) => String(d.checkedAt).slice(0, 10)).sort().pop() ?? null,
    suivi: {
      requetesSuivies: tracked.length,
      top3: tracked.filter((d) => d.position != null && Number(d.position) <= 3).length,
      top10: tracked.filter((d) => d.position != null && Number(d.position) <= 10).length,
      absentesDuTop20: tracked.filter((d) => d.position == null).length,
      gains: tracked.filter((d) => Number(d.positionChange ?? 0) >= 3).sort((a, b) => Number(b.positionChange) - Number(a.positionChange)).slice(0, 10).map(row),
      pertes: tracked.filter((d) => Number(d.positionChange ?? 0) <= -3).sort((a, b) => Number(a.positionChange) - Number(b.positionChange)).slice(0, 10).map(row),
      lesPlusRecherchees: [...tracked].sort((a, b) => Number(b.volume ?? 0) - Number(a.volume ?? 0)).slice(0, 15).map(row),
    },
    reponsesIAdeGoogle: {
      requetesAvecReponseIA: tracked.filter((d) => d.aiOverview).length,
      ouTIMManagementEstCite: tracked.filter((d) => d.aiCited).map((d) => d.keyword),
      reponseIASansNous: tracked.filter((d) => d.aiOverview && !d.aiCited).sort((a, b) => Number(b.volume ?? 0) - Number(a.volume ?? 0)).slice(0, 10).map((d) => ({ requete: d.keyword, volume: d.volume ?? null, sourcesCitees: ((d.aiSources ?? []) as { domain: string }[]).map((s) => s.domain).slice(0, 6) })),
      sitesLesPlusCites: [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([domaine, fois]) => ({ domaine, fois })),
    },
    pagesCles: all
      .filter((d) => d.source === "page")
      .map((d) => ({ page: d.targetUrl, requete: d.keyword, position: d.position ?? "absent du top 20", volume: d.volume ?? null, n1: d.top1Domain ?? null, couverture: d.coverage ?? null, cible: d.coverageTarget ?? null, manques: d.coverageGaps ?? null })),
    opportunites: all
      .filter((d) => d.source === "opportunite")
      .sort((a, b) => opportunityScore(b) - opportunityScore(a))
      .slice(0, 25)
      .map((d) => ({ requete: d.keyword, volume: d.volume ?? null, difficulte: d.difficulty ?? null, intention: d.intent ?? null, concurrentsDansLeTop10: ((d.competitorsRanking ?? []) as { domain: string; position: number }[]).map((c) => `${c.domain} (${c.position}e)`) })),
    concurrentsSurGoogle: market?.competitors ?? null,
    requetesOuTIMManagementEstClasse: market?.ourKeywords ?? null,
    note: "Si le top 3 d'une requête est fait d'outils (calculettes, convertisseurs, simulateurs, modèles à télécharger) et non d'articles, un article seul ne passera pas devant : demande plutôt l'outil sur le site vitrine (<demandesVitrine>). Données Google relevées par DataForSEO (positions dans le top 20 de google.fr, réponse IA de Google et ses sources, volumes mensuels estimés). Une position est une photo du jour : juger sur la tendance.",
  };
}
