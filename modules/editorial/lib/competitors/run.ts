import type { Payload } from "payload";

import { assertAdsBudget, recordAdsUsage } from "@/modules/ads/lib/spend";
import { analysisKeyword, articleCoverageInput, jobCoverageInput, keywordKey } from "@/modules/editorial/lib/competitors/content";
import { fetchSerp, isDataForSeoConfigured, isMaskedUrl } from "@/modules/editorial/lib/competitors/dataforseo";
import { excludeReason, extractMain, isToolPage } from "@/modules/editorial/lib/competitors/extract";
import { buildCorpus, competitorScores, COPY_BLOCK, COPY_WARN, copyRatio, CORPUS_VERSION, coverage, coverageTarget, isOnTopic, shingles, wordCount, type Corpus, type CorpusPage } from "@/modules/editorial/lib/competitors/terms";

/**
 * LE COMPARATEUR DE CONCURRENTS (étape 4, 19/11/2026) : relever le top 10, lire les
 * pages, bâtir le corpus, noter la couverture de chaque article et fiche.
 *
 * - une analyse par requête, réutilisée 7 jours (sauf « Réanalyser ») ;
 * - chaque relevé passe par le budget « seo » des agents (environ 0,002 € pièce) ;
 * - réanalyse automatique, étalée : 3 contenus par heure au plus (≈ 45 s chacun) (synchronisation
 *   horaire), les contenus jamais analysés d'abord, puis les plus anciens ;
 * - la couverture est recalculée sans aucun appel à chaque recalcul des notes.
 */

type Raw = Record<string, unknown>;
export const SNAPSHOT_MAX_AGE_DAYS = 7;
const DAY = 86_400_000;
const PER_HOUR = 3;

export type Snapshot = { id: number | string; keyword: string; takenAt: string; serp: { rank: number; url: string; domain: string; title: string }[]; questions: string[]; pages: SnapshotPage[]; corpus: Corpus & { competitorScores?: (number | null)[]; target?: number | null }; costUsd?: number };
export type SnapshotPage = { rank: number; url: string; domain: string; title: string; words: number; h2s: string[]; h3s: string[]; excluded: string | null; score: number | null; text?: string };

export async function findSnapshot(payload: Payload, keyword: string): Promise<Snapshot | null> {
  if (!keyword) return null;
  const r = await payload.find({ collection: "competitor-snapshots" as never, where: { keywordKey: { equals: keywordKey(keyword) } }, sort: "-takenAt", limit: 1, depth: 0, overrideAccess: true });
  return (r.docs[0] as unknown as Snapshot) ?? null;
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** L'adresse réelle derrière un lien masqué de Google (redirection, sinon lien de la page intermédiaire). */
async function resolveMasked(url: string, fetcher: typeof fetch): Promise<string> {
  try {
    const res = await fetcher(url, { headers: { "User-Agent": BROWSER_UA, "Accept-Language": "fr-FR,fr;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if (res.url && !isMaskedUrl(res.url) && !/^https?:\/\/(www\.)?google\./.test(res.url)) return res.url;
    return externalLinkOf(await res.text()) ?? url;
  } catch {
    return url;
  }
}

/** Dans une page intermédiaire de Google : la première adresse qui n'est pas Google. Pure (testée). */
export function externalLinkOf(html: string): string | null {
  for (const m of html.matchAll(/(?:url=|href=["'])(https?:\/\/[^"'&\s>]+)/gi)) {
    const u = m[1].replace(/&amp;/g, "&");
    if (!/^https?:\/\/([a-z0-9-]+\.)*google\.|gstatic\.com|googleusercontent\.com/i.test(u)) return u;
  }
  return null;
}

/** Lit une page en suivant les redirections : l'adresse finale, et son HTML s'il s'agit d'une page web. */
async function fetchResolved(url: string, fetcher: typeof fetch): Promise<{ url: string; html: string | null; isHtml: boolean }> {
  try {
    const res = await fetcher(url, { headers: { "User-Agent": BROWSER_UA, "Accept-Language": "fr-FR,fr;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const finalUrl = res.url || url;
    const isHtml = /html/i.test(res.headers.get("content-type") ?? "");
    if (!res.ok) return { url: finalUrl, html: null, isHtml };
    return { url: finalUrl, html: isHtml ? await res.text() : "", isHtml };
  } catch {
    return { url, html: null, isHtml: false };
  }
}

/** Relève (ou réutilise) l'analyse d'une requête. */
export async function analyzeKeyword(payload: Payload, keyword: string, o: { force?: boolean; now?: Date; fetcher?: typeof fetch } = {}): Promise<Snapshot> {
  const now = o.now ?? new Date();
  const existing = await findSnapshot(payload, keyword);
  if (existing && !o.force && now.getTime() - Date.parse(existing.takenAt) < SNAPSHOT_MAX_AGE_DAYS * DAY) return existing;

  // Le relevé de la semaine d'une requête suivie sert ici (pas de double paiement) ; sinon on relève,
  // et le relevé met aussi à jour le suivi des positions.
  const tracking = await import("@/modules/editorial/lib/seo/tracking");
  let serp = await tracking.recentSerp(payload, keyword, now);
  if (!serp) {
    await assertAdsBudget(payload, "seo", 0.01, now);
    serp = await fetchSerp(keyword, o.fetcher);
    await recordAdsUsage(payload, { kind: "seo", provider: "dataforseo", model: "serp-google-live-advanced", usd: serp.costUsd, detail: `top 20 Google sur « ${keyword.slice(0, 60)} »` });
    await tracking.applySerp(payload, keyword, serp, now).catch(() => false);
  }

  // Adresses masquées par Google : suivies UNE PAR UNE (ouvertes ensemble, Google répond par une
  // page intermédiaire au lieu de rediriger), puis les pages sont lues en parallèle.
  const fetcher = o.fetcher ?? fetch;
  const resolved = new Map<string, string>();
  for (const r of serp.organic) {
    if (!isMaskedUrl(r.url)) continue;
    let real = await resolveMasked(r.url, fetcher);
    if (isMaskedUrl(real)) {
      await new Promise((ok) => setTimeout(ok, 3_000));
      real = await resolveMasked(r.url, fetcher);
    }
    resolved.set(r.url, real);
    await new Promise((ok) => setTimeout(ok, 1_200));
  }
  const pages: SnapshotPage[] = await Promise.all(
    serp.organic.map(async (r0) => {
      const got = await fetchResolved(resolved.get(r0.url) ?? r0.url, fetcher);
      const r = { ...r0, url: got.url };
      const why = excludeReason(r.url) ?? (got.html != null && !got.isHtml ? "pas une page web (PDF, fichier)" : null);
      if (why) return { ...r, words: 0, h2s: [], h3s: [], excluded: why, score: null };
      const html = got.html;
      if (!html) return { ...r, words: 0, h2s: [], h3s: [], excluded: "page illisible (blocage ou délai)", score: null };
      const page = extractMain(html);
      const words = wordCount(page.text);
      const excluded = words < 300 ? "moins de 300 mots" : isToolPage(r.url, page.title || r.title) ? "outil (calculateur, convertisseur…), pas un article" : !isOnTopic(keyword, page.title || r.title, page.text) ? "hors sujet (ne parle pas de la requête)" : null;
      return { ...r, words, h2s: page.h2s, h3s: page.h3s, excluded, score: null, text: page.text };
    }),
  );
  // Une même page classée deux fois (adresse finale identique) ne compte qu'une fois.
  const seen = new Map<string, number>();
  for (const p of pages) {
    if (p.excluded) continue;
    const key = p.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    const first = seen.get(key);
    if (first != null) Object.assign(p, { excluded: `doublon du résultat n° ${first}`, text: undefined });
    else seen.set(key, p.rank);
  }
  const kept = pages.filter((p) => !p.excluded);
  const corpusPages: CorpusPage[] = kept.map((p) => ({ url: p.url, domain: p.domain, text: p.text ?? "", words: p.words, h2s: [...p.h2s, ...p.h3s] }));
  const corpus = buildCorpus(corpusPages, serp.questions);
  const scores = corpus.insufficient ? [] : competitorScores(corpusPages, serp.questions);
  kept.forEach((p, i) => (p.score = scores[i] ?? null));
  const target = coverageTarget(scores.filter((s): s is number => s != null));

  const doc = await payload.create({
    collection: "competitor-snapshots" as never,
    overrideAccess: true,
    data: {
      keyword,
      keywordKey: keywordKey(keyword),
      takenAt: now.toISOString(),
      costUsd: serp.costUsd,
      validPages: corpus.pages,
      domains: corpus.domains,
      checkUrl: serp.checkUrl,
      serp: serp.organic,
      questions: serp.questions,
      pages,
      corpus: { ...corpus, competitorScores: scores, target },
    } as never,
  });
  // Les relevés plus anciens de la même requête ne servent plus.
  await payload.delete({ collection: "competitor-snapshots" as never, where: { and: [{ keywordKey: { equals: keywordKey(keyword) } }, { id: { not_equals: (doc as unknown as Raw).id } }] }, overrideAccess: true }).catch(() => null);
  return doc as unknown as Snapshot;
}

/** La couverture d'un contenu selon une analyse (aucun appel). */
export function coverageOf(kind: "articles" | "job-sheets", doc: Raw, snap: Snapshot | null) {
  if (!snap?.corpus) return null;
  const input = kind === "articles" ? articleCoverageInput(doc) : jobCoverageInput(doc);
  const c = coverage(input.text, snap.corpus, input.headings);
  return {
    score: c.score,
    target: snap.corpus.target ?? null,
    insufficient: c.insufficient,
    risk: c.risk,
    takenAt: snap.takenAt,
    // Pour la note v3 : statut, fourchette de longueur, part des entités citées, termes en excès.
    status: snap.corpus.insufficient ? ("insuffisant" as const) : ("analyse" as const),
    wordsMin: snap.corpus.wordsMin ?? null,
    wordsMax: snap.corpus.wordsMax ?? null,
    entities: c.entities.length ? Math.round((c.entities.filter((e) => e.present).length / c.entities.length) * 100) / 100 : null,
    excess: c.terms.filter((t) => t.state === "exces").length,
  };
}

/** Enregistre la couverture d'un contenu (sans toucher à WordPress). */
export async function saveCoverage(payload: Payload, kind: "articles" | "job-sheets", doc: Raw, snap: Snapshot | null) {
  const c = coverageOf(kind, doc, snap);
  const data = { scoreCoverage: c?.score ?? null, coverageTarget: c?.target ?? null, competitorsAt: c?.takenAt ?? null, coverageStatus: c?.status ?? null, coverageWordsMin: c?.wordsMin ?? null, coverageWordsMax: c?.wordsMax ?? null, coverageEntities: c?.entities ?? null, coverageExcess: c?.excess ?? null };
  if ((Object.keys(data) as (keyof typeof data)[]).every((k) => String(doc[k] ?? "") === String(data[k] ?? ""))) return false;
  await payload.update({ collection: kind as never, id: doc.id as number, overrideAccess: true, context: { fromWordPress: true }, data: data as never });
  return true;
}

/** Analyse un contenu à la demande (bouton du tiroir). */
export async function analyzeContent(payload: Payload, kind: "articles" | "job-sheets", id: number | string, o: { force?: boolean; now?: Date } = {}) {
  const doc = (await payload.findByID({ collection: kind as never, id, depth: 0, overrideAccess: true })) as unknown as Raw;
  const keyword = analysisKeyword(kind, doc);
  if (!keyword) throw new Error(kind === "articles" ? "Renseigne d'abord le mot-clé principal de l'article." : "Fiche sans titre.");
  const snap = await analyzeKeyword(payload, keyword, o);
  await saveCoverage(payload, kind, doc, snap);
  return snap;
}

/** Le corpus d'une analyse, recalculé depuis les pages gardées (aucun appel). */
export function corpusFromPages(snap: Pick<Snapshot, "pages" | "questions" | "keyword">) {
  // Les pages hors sujet sont écartées aussi au recalcul (relevés faits avant ce filtre).
  const pages0 = (snap.pages ?? []).map((p) =>
    !p.excluded && p.text && (isToolPage(p.url, p.title) || excludeReason(p.url)) ? { ...p, excluded: excludeReason(p.url) ?? "outil (calculateur, convertisseur…), pas un article" } : !p.excluded && p.text && snap.keyword && !isOnTopic(snap.keyword, p.title, p.text) ? { ...p, excluded: "hors sujet (ne parle pas de la requête)" } : p,
  );
  snap = { ...snap, pages: pages0 };
  const kept = (snap.pages ?? []).filter((p) => !p.excluded && p.text);
  const corpusPages: CorpusPage[] = kept.map((p) => ({ url: p.url, domain: p.domain, text: p.text ?? "", words: p.words, h2s: [...p.h2s, ...p.h3s] }));
  const corpus = buildCorpus(corpusPages, snap.questions ?? []);
  const scores = corpus.insufficient ? [] : competitorScores(corpusPages, snap.questions ?? []);
  const pages = (snap.pages ?? []).map((p) => {
    const i = kept.indexOf(p);
    return { ...p, score: i >= 0 ? (scores[i] ?? null) : null };
  });
  return { pages, corpus: { ...corpus, competitorScores: scores, target: coverageTarget(scores.filter((x): x is number => x != null)) } };
}

/** Une nouvelle méthode de calcul (CORPUS_VERSION) : les corpus sont recalculés depuis les pages gardées. */
async function rebuildOutdatedCorpora(payload: Payload) {
  const all = (await payload.find({ collection: "competitor-snapshots" as never, pagination: false, depth: 0, overrideAccess: true, select: { corpus: true } as never })).docs as unknown as Snapshot[];
  for (const s of all.filter((x) => (x.corpus?.version ?? 1) !== CORPUS_VERSION)) {
    const full = (await payload.findByID({ collection: "competitor-snapshots" as never, id: s.id, depth: 0, overrideAccess: true })) as unknown as Snapshot;
    const { pages, corpus } = corpusFromPages(full);
    // La collection n'est pas modifiable par l'interface : écriture serveur seulement.
    await payload.update({ collection: "competitor-snapshots" as never, id: s.id, overrideAccess: true, data: { pages, corpus, validPages: corpus.pages, domains: corpus.domains } as never });
  }
}

/**
 * LE CONTRÔLE ANTI-COPIE (étape 5) : la part de notre texte (suites de 5 mots) reprise d'UNE
 * page concurrente. Au-delà de 15 %, l'écriture dans WordPress est refusée — pour la direction
 * comme pour les agents qui publient sans relecture. Sans analyse de la requête : pas de contrôle.
 */
export async function copyCheck(payload: Payload, kind: "articles" | "job-sheets", doc: Raw): Promise<{ ratio: number; domain: string | null; url: string | null; blocked: string | null; warning: string | null }> {
  const none = { ratio: 0, domain: null, url: null, blocked: null, warning: null };
  const snap = await findSnapshot(payload, analysisKeyword(kind, doc)).catch(() => null);
  if (!snap?.pages?.length) return none;
  const ours = shingles((kind === "articles" ? articleCoverageInput(doc) : jobCoverageInput(doc)).text);
  let worst = { ratio: 0, domain: null as string | null, url: null as string | null };
  for (const p of snap.pages) {
    if (!p.text) continue;
    const r = copyRatio(ours, shingles(p.text));
    if (r > worst.ratio) worst = { ratio: r, domain: p.domain, url: p.url };
  }
  const pct = Math.round(worst.ratio * 100);
  return {
    ...worst,
    ratio: Math.round(worst.ratio * 1000) / 1000,
    blocked: worst.ratio >= COPY_BLOCK ? `Texte trop proche d'un concurrent : ${pct} % des suites de 5 mots reprises de ${worst.domain} (${worst.url}). Réécris ces passages avant d'enregistrer.` : null,
    warning: worst.ratio >= COPY_WARN && worst.ratio < COPY_BLOCK ? `${pct} % du texte ressemble à ${worst.domain} : vérifie les passages repris.` : null,
  };
}

/** Recalcule la couverture de tout le tableau depuis les analyses existantes (aucun appel). */
export async function coverageAll(payload: Payload): Promise<number> {
  await rebuildOutdatedCorpora(payload);
  const snaps = (await payload.find({ collection: "competitor-snapshots" as never, pagination: false, depth: 0, overrideAccess: true, select: { keywordKey: true, takenAt: true, corpus: true } as never })).docs as unknown as (Snapshot & { keywordKey: string })[];
  if (!snaps.length) return 0;
  const byKey = new Map(snaps.map((s) => [s.keywordKey, s]));
  let changed = 0;
  for (const kind of ["articles", "job-sheets"] as const) {
    const docs = (await payload.find({ collection: kind as never, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Raw[];
    for (const d of docs) {
      const snap = byKey.get(keywordKey(analysisKeyword(kind, d))) ?? null;
      if (snap && (await saveCoverage(payload, kind, d, snap))) changed++;
    }
  }
  return changed;
}

/**
 * La réanalyse étalée (synchronisation horaire) : contenus en ligne avec une requête,
 * jamais analysés d'abord, puis analysés il y a plus de 7 jours. Rien si DataForSEO
 * n'est pas branché.
 */
export async function refreshDueCompetitors(payload: Payload, now = new Date()): Promise<{ analyzed: number; errors: string[] }> {
  if (!isDataForSeoConfigured()) return { analyzed: 0, errors: [] };
  const limit = new Date(now.getTime() - SNAPSHOT_MAX_AGE_DAYS * DAY).toISOString();
  const due: { kind: "articles" | "job-sheets"; doc: Raw }[] = [];
  for (const kind of ["articles", "job-sheets"] as const) {
    const online = kind === "articles" ? { status: { in: ["publie", "a-rafraichir"] } } : { wpId: { greater_than: 0 } };
    const docs = (await payload.find({ collection: kind as never, where: { and: [online, { or: [{ competitorsAt: { exists: false } }, { competitorsAt: { less_than: limit } }] }] } as never, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Raw[];
    for (const doc of docs) if (analysisKeyword(kind, doc)) due.push({ kind, doc });
  }
  due.sort((a, b) => String(a.doc.competitorsAt ?? "").localeCompare(String(b.doc.competitorsAt ?? "")));
  const errors: string[] = [];
  let analyzed = 0;
  for (const { kind, doc } of due.slice(0, PER_HOUR)) {
    try {
      const snap = await analyzeKeyword(payload, analysisKeyword(kind, doc), { now });
      await saveCoverage(payload, kind, doc, snap);
      analyzed++;
    } catch (e) {
      errors.push(`${String(doc.title ?? doc.id)} : ${e instanceof Error ? e.message : String(e)}`);
      if (/budget|Interrupteur/i.test(String(e))) break;
    }
  }
  return { analyzed, errors };
}

/** Ce que reçoit le rédacteur : termes recommandés, questions, structure des 3 premières pages. */
export function writerBrief(snap: Snapshot | null) {
  if (!snap?.corpus || snap.corpus.insufficient) return null;
  return {
    terms: snap.corpus.terms.slice(0, 40).map((t) => ({ label: t.label, share: t.share, min: t.min, max: t.max })),
    entities: (snap.corpus.entities ?? []).slice(0, 15).map((e) => ({ label: e.label, share: e.share })),
    questions: snap.questions.slice(0, 10),
    medianWords: snap.corpus.medianWords,
    medianH2: snap.corpus.medianH2,
    outlines: snap.pages.filter((p) => !p.excluded).slice(0, 5).map((p) => ({ url: p.url, h2s: p.h2s.slice(0, 10), h3s: p.h3s.slice(0, 15), questions: [...p.h2s, ...p.h3s].filter((h) => h.endsWith("?")).slice(0, 10) })),
    urls: snap.pages.filter((p) => !p.excluded).map((p) => p.url),
  };
}
