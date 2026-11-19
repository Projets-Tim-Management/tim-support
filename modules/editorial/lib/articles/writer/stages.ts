import type Anthropic from "@anthropic-ai/sdk";
import type { Payload } from "payload";

import { runWebModel, sourcesOf } from "@/modules/ai-team/lib/web-model";
import {
  ALLOWED_OUTBOUND_DOMAINS,
  articlePlainText,
  buildSources,
  CAPSULE_MAX_WORDS,
  CAPSULE_MIN_WORDS,
  capsuleProblems,
  checkCompetitorLinks,
  checkPolicy,
  checkSources,
  conventionDivergences,
  fetchedPages,
  formatFaitsForPrompt,
  formatFaitsForPromptSubset,
  isCompetitorUrl,
  isHomepageUrl,
  MIN_FAITS,
  MAX_FAITS,
  offersFact,
  parseJsonResponse,
  researchDomains,
  resolveSiteUrls,
  sanitizeArticle,
  stripTags,
  unusedFacts,
  unwrapArticleStrong,
  validateArticle,
  verifyFacts,
  wordCount,
  type Article,
  type Fait,
} from "@/modules/editorial/lib/articles/check";
import { HELPER_MODEL, runArticleModel, WRITER_MODEL } from "@/modules/editorial/lib/articles/writer/model";
import { bodyViolations, checkRefreshParts, hasRealChange, parseRefreshResponse, REFRESH_MAX_TOKENS, REFRESH_SYSTEM, refreshPrompt, RESUME_MISE_A_JOUR, wpPostToArticle } from "@/modules/editorial/lib/articles/writer/refresh";
import { parisDay, readPost, updateFields } from "@/modules/editorial/lib/articles/wp-write";
import type { StageOutcome, Stages } from "@/modules/editorial/lib/articles/writer/pipeline";
import { loadOffersText, loadOutlines, loadSitemap, type Outline } from "@/modules/editorial/lib/articles/writer/prep";
import {
  buildArticlePrompt,
  CAPSULE_SYSTEM,
  capsulePrompt,
  FIDELITY_SYSTEM,
  fidelityPrompt,
  isSalesArticle,
  RESEARCH_SYSTEM,
  researchPrompt,
  retryMessage,
  writerSystem,
  type Intent,
  type SerpBrief,
} from "@/modules/editorial/lib/articles/writer/prompt";

/**
 * LES ÉTAPES DE LA RÉDACTION (étape 5, 18/11/2026) — une par passage du cron :
 *  1. recherche des faits (Sonnet 5.5, sites officiels seulement, extrait vérifié
 *     mot pour mot par le code) — sautée si la fiche a déjà assez de faits ;
 *  2. préparation (divergences de sources, plan du site, articles voisins,
 *     structure des concurrents, page /offres pour un article de vente, version
 *     des règles en vigueur) ;
 *  3. rédaction (Opus 5.5), nettoyage, capsules réécrites, contrôle complet,
 *     relecture de fidélité ;
 *  4. relance (une seule), si le contrôle a échoué.
 * Fin : « À relire » (contrôle passé) ou « À vérifier » (avec ce qui bloque).
 * Rien n'est écrit dans WordPress.
 */

type Raw = Record<string, unknown>;
const NOTE_METHODE = "Article rédigé avec assistance IA à partir de sources vérifiées, relu avant publication.";
const MAX_TOKENS_ARTICLE = 32_000;

/** Les faits de la fiche, dans la forme du contrôle. */
export const factsOf = (a: Raw): Fait[] =>
  (Array.isArray(a.facts) ? (a.facts as Raw[]) : [])
    .map((f) => ({ fait: String(f.fact ?? "").trim(), source: String(f.source ?? "").trim(), url: String(f.url ?? "").trim(), annee: String(f.year ?? "").trim() }))
    .filter((f) => f.fait && f.source);

const secondaryOf = (a: Raw) =>
  String(a.secondaryKeywords ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// ── 1. Recherche des faits ────────────────────────────────────────────────────

async function research(payload: Payload, a: Raw, now: Date): Promise<StageOutcome> {
  // Une mise à jour d'article en ligne passe directement à sa réécriture après la recherche.
  const after = a.writeMode === "maj" ? "maj" : "preparation";
  const existing = factsOf(a);
  if (existing.length >= MIN_FAITS) return { next: after };
  const run = await runWebModel(payload, {
    model: HELPER_MODEL,
    system: RESEARCH_SYSTEM,
    user: researchPrompt({ keyword: String(a.keyword ?? a.title ?? ""), title: a.title as string, secondary: secondaryOf(a), angle: a.ideaAngle as string, notes: a.ideaWhy as string, year: now.getUTCFullYear(), min: MIN_FAITS, max: MAX_FAITS }),
    kind: "seo",
    detail: `recherche des faits de l'article « ${String(a.title ?? "").slice(0, 80)} »`,
    now,
    maxTokens: 32_000,
    maxSearches: 8,
    maxFetches: 12,
    maxTurns: 5,
    webInputTokens: 360_000,
    facts: { allowedDomains: researchDomains(), maxFetchTokens: 30_000 },
  });
  if (run.stopReason === "refusal") throw new Error("Recherche refusée par le modèle.");
  if (run.stopReason === "max_tokens") throw new Error("Recherche tronquée (réponse trop longue).");
  let candidates: unknown[] = [];
  try {
    const parsed = parseJsonResponse(run.text) as { faits?: unknown[] };
    candidates = Array.isArray(parsed?.faits) ? parsed.faits : [];
  } catch {
    throw new Error("Réponse finale de la recherche illisible.");
  }
  const pages = fetchedPages(run.contents.flat() as unknown as Parameters<typeof fetchedPages>[0]);
  const [kept, rejected] = verifyFacts(candidates, pages);
  const excerptOf = new Map((candidates as Raw[]).map((c) => [String(c?.fait ?? "").trim(), String(c?.extrait ?? "").trim()]));
  const seen = new Set(existing.map((f) => `${f.url}|${f.fait}`));
  const added = kept.filter((f) => !seen.has(`${f.url}|${f.fait}`));
  const facts = [
    ...(Array.isArray(a.facts) ? (a.facts as Raw[]) : []),
    ...added.map((f) => ({ fact: f.fait, source: f.source, url: f.url ?? "", year: f.annee ?? "", origin: "recherche", excerpt: excerptOf.get(f.fait) ?? "" })),
  ];
  const rejectedFacts = rejected.map(([fait, raison]) => ({ fait, raison }));
  if (existing.length + added.length < MIN_FAITS) {
    return {
      next: "a-verifier",
      costEur: run.costEur,
      data: { facts, rejectedFacts },
      reason: `Recherche des faits : ${existing.length + added.length} fait(s) vérifié(s), il en faut au moins ${MIN_FAITS}. Ajoutez des faits sourcés sur la fiche (onglet Rédaction), puis repassez l'article en « Validée ».${rejected.length ? ` Écartés : ${rejected.slice(0, 10).map(([f, r]) => `« ${f.slice(0, 80)} » (${r})`).join(" ; ")}` : ""}`,
    };
  }
  return { next: after, costEur: run.costEur, data: { facts, rejectedFacts } };
}

// ── 2. Préparation ────────────────────────────────────────────────────────────

/** Les 3 premières pages Google sur le mot-clé (hors TIM Management, concurrents compris : seule leur STRUCTURE sert). */
async function competitorBrief(payload: Payload, keyword: string, now: Date) {
  const { isDataForSeoConfigured } = await import("@/modules/editorial/lib/competitors/dataforseo");
  if (!keyword || !isDataForSeoConfigured()) return null;
  const { analyzeKeyword, writerBrief } = await import("@/modules/editorial/lib/competitors/run");
  return writerBrief(await analyzeKeyword(payload, keyword, { now }).catch(() => null));
}

async function topPages(payload: Payload, keyword: string, now: Date): Promise<{ urls: string[]; costEur: number }> {
  const run = await runWebModel(payload, {
    model: HELPER_MODEL,
    system: "Tu fais une seule recherche web et tu réponds en une ligne.",
    user: `Cherche « ${keyword} » (Google France). Réponds seulement « fait ».`,
    kind: "seo",
    detail: `pages concurrentes sur « ${keyword.slice(0, 60)} »`,
    now,
    maxTokens: 1_000,
    maxSearches: 1,
    maxFetches: 1,
    maxTurns: 1,
    webInputTokens: 10_000,
    effort: "low",
  });
  const urls = sourcesOf(run.contents)
    .map((s) => s.url)
    .filter((u) => /^https?:\/\//.test(u) && !/tim-management\.co/i.test(u) && !isHomepageUrl(u));
  return { urls: [...new Set(urls)].slice(0, 3), costEur: run.costEur };
}

async function preparation(payload: Payload, a: Raw, now: Date): Promise<StageOutcome> {
  const facts = factsOf(a);
  const divergences = conventionDivergences(facts);
  if (divergences.length) return { next: "a-verifier", reason: `Sources divergentes, à trancher avant la rédaction : ${divergences.join(" ; ")}` };
  const sitemap = await loadSitemap();
  if (!sitemap.length) throw new Error("Plan du site de tim-management.co illisible : le maillage interne est impossible.");
  const themeId = a.theme && typeof a.theme === "object" ? (a.theme as Raw).id : a.theme;
  const theme = themeId ? ((await payload.findByID({ collection: "article-themes" as never, id: themeId as number, depth: 0, overrideAccess: true }).catch(() => null)) as Raw | null) : null;
  const intent = (a.intent as Intent | null) ?? null;
  const sales = isSalesArticle(intent, (theme?.kind as string) ?? null);
  const keyword = String(a.keyword || a.title || "");
  const [neighbours, rules, serp, offersText] = await Promise.all([
    themeId
      ? payload
          .find({ collection: "articles" as never, where: { and: [{ theme: { equals: themeId } }, { status: { in: ["publie", "a-rafraichir"] } }, { id: { not_equals: a.id } }] }, limit: 12, depth: 0, overrideAccess: true, sort: "-gscClicks", select: { wpLink: true } as never })
          .then((r) => (r.docs as unknown as Raw[]).map((d) => String(d.wpLink ?? "")).filter((u) => u.includes("tim-management.co")))
      : Promise.resolve([] as string[]),
    payload.find({ collection: "article-rule-versions" as never, sort: "-number", limit: 1, depth: 0, overrideAccess: true }).then((r) => r.docs[0] as unknown as { number: number } | undefined),
    // Le vrai top 10 de google.fr (comparateur, étape 4) quand DataForSEO est branché ; sinon une recherche web.
    competitorBrief(payload, keyword, now).then(async (brief) => (brief ? { urls: brief.urls, costEur: 0, brief } : { ...(await topPages(payload, keyword, now).catch(() => ({ urls: [] as string[], costEur: 0 }))), brief: null })),
    sales ? loadOffersText() : Promise.resolve(null),
  ]);
  if (!rules) throw new Error("Aucune version des règles en vigueur (Éditorial › Règles des articles).");
  const outlines: Outline[] = serp.brief ? serp.brief.outlines : await loadOutlines(serp.urls).catch(() => []);
  const requiredUrls = resolveSiteUrls(String(theme?.pillarUrl ?? ""), sitemap);
  return {
    next: "redaction",
    costEur: serp.costEur,
    data: {
      rulesVersion: rules.number,
      writeContext: { sitemap, related: neighbours, requiredUrls, competitors: outlines, offersText, sales, cluster: theme?.name ?? null, competitorUrls: serp.urls.filter((u) => isCompetitorUrl(u)), brief: serp.brief ? { terms: serp.brief.terms, entities: serp.brief.entities, questions: serp.brief.questions, medianWords: serp.brief.medianWords, medianH2: serp.brief.medianH2 } : null },
    },
  };
}

// ── 3. Rédaction, contrôle, relance ──────────────────────────────────────────

type Ctx = { sitemap: string[]; related: string[]; requiredUrls: string[]; competitors: Outline[]; offersText: string | null; sales: boolean; cluster: string | null; brief?: SerpBrief | null; retry?: { messages: Anthropic.MessageParam[] } };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Réécrit les capsules hors normes (2 essais chacune, Sonnet 5.5) ; rend le coût. */
async function fixCapsules(payload: Payload, article: Article, a: Raw, facts: Fait[], now: Date): Promise<number> {
  let cost = 0;
  const keyword = String(a.keyword ?? "");
  const fix = async (html: string, fallback: string) => {
    let out = html;
    for (const m of [...html.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)]) {
      let inner = m[1];
      let problems = capsuleProblems(inner);
      if (!problems.length) continue;
      const before = html.slice(0, m.index ?? 0);
      const h2s = [...before.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
      const context = h2s.length ? stripTags(h2s[h2s.length - 1][1]).trim() : fallback;
      for (let i = 0; i < 2 && problems.length; i++) {
        const r = await runArticleModel(payload, {
          model: HELPER_MODEL,
          system: CAPSULE_SYSTEM,
          messages: [{ role: "user", content: capsulePrompt({ keyword, context, problems, current: stripTags(inner).trim(), factsBlock: formatFaitsForPrompt(facts), clientCase: a.clientCase as string, min: CAPSULE_MIN_WORDS, max: CAPSULE_MAX_WORDS }) }],
          maxTokens: 1_024,
          detail: `capsule de l'article « ${String(a.title ?? "").slice(0, 60)} »`,
          now,
        });
        cost += r.costEur;
        inner = escapeHtml(stripTags(r.text).trim().replace(/^["«»\s]+|["«»\s]+$/g, "").replace(/\s+/g, " "));
        problems = capsuleProblems(inner);
      }
      out = out.replace(m[0], `<strong>${inner}</strong>`);
    }
    return out;
  };
  for (const b of article.contenu ?? []) if (b && typeof b.texte === "string") b.texte = await fix(b.texte, keyword);
  for (const q of article.faq ?? []) if (q && typeof q.text === "string") q.text = await fix(q.text, String(q.titre ?? keyword));
  return cost;
}

/** Fidélité : contradictions de sens entre l'article et les faits (Opus 5.5). Réponse illisible = ignorée. */
async function fidelity(payload: Payload, article: Article, facts: Fait[], a: Raw, now: Date): Promise<{ errors: string[]; costEur: number }> {
  if (!facts.length) return { errors: [], costEur: 0 };
  const r = await runArticleModel(payload, { model: WRITER_MODEL, system: FIDELITY_SYSTEM, messages: [{ role: "user", content: fidelityPrompt(formatFaitsForPrompt(facts), articlePlainText(article)) }], maxTokens: 4_096, detail: `relecture de fidélité de « ${String(a.title ?? "").slice(0, 60)} »`, now });
  try {
    const data = parseJsonResponse(r.text) as { problemes?: Raw[] };
    const errors = (data?.problemes ?? []).filter((p) => String(p?.phrase ?? "").trim()).map((p) => `Fidélité au fait [${String(p.fait ?? "?")}] : « ${String(p.phrase).slice(0, 200)} » — ${String(p.explication ?? "").trim()}`);
    return { errors, costEur: r.costEur };
  } catch {
    return { errors: [], costEur: r.costEur };
  }
}

/** Un essai : rédiger (ou corriger), nettoyer, contrôler. */
async function attempt(payload: Payload, a: Raw, now: Date, messages: Anthropic.MessageParam[]) {
  const ctx = a.writeContext as Ctx;
  const facts = factsOf(a);
  const rules = (await payload.find({ collection: "article-rule-versions" as never, where: { number: { equals: a.rulesVersion } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { number: number; text: string } | undefined;
  if (!rules) throw new Error(`Version ${String(a.rulesVersion)} des règles introuvable.`);
  const reply = await runArticleModel(payload, { model: WRITER_MODEL, system: writerSystem(rules.number, rules.text), messages, maxTokens: MAX_TOKENS_ARTICLE, detail: `rédaction de l'article « ${String(a.title ?? "").slice(0, 60)} »`, now });
  if (reply.stopReason === "max_tokens") throw new Error("Rédaction tronquée (article trop long pour la limite de sortie).");
  if (reply.stopReason === "refusal") throw new Error("Rédaction refusée par le modèle.");
  let cost = reply.costEur;
  let article: Article;
  try {
    article = parseJsonResponse(reply.text) as Article;
  } catch (e) {
    return { article: null, raw: reply.text, errors: [`JSON invalide : ${e instanceof Error ? e.message : String(e)}`], warnings: [] as string[], cost, unused: null as string | null };
  }
  sanitizeArticle(article);
  unwrapArticleStrong(article);
  cost += await fixCapsules(payload, article, a, facts, now);
  // Article de vente : la page /offres est un fait de RÉFÉRENCE pour les prix — jamais une source de l'article.
  const checkFacts = ctx.sales && ctx.offersText ? [...facts, offersFact(ctx.offersText)] : facts;
  const report = validateArticle(article, checkFacts, String(a.clientCase ?? ""), ctx.sitemap, { keyword: String(a.keyword ?? ""), wordcount: (a.wordcountTarget as number) ?? null, required_urls: ctx.requiredUrls });
  const policy = checkPolicy(article, { sales: ctx.sales });
  const errors = [...report.errors, ...policy.errors];
  const warnings = [...report.warnings, ...policy.warnings];
  const declared = new Set(
    (Array.isArray(article.faits_utilises) ? (article.faits_utilises as unknown[]) : [])
      .map((v) => Number(String(v).trim()) - 1)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < facts.length),
  );
  delete (article as Raw).faits_utilises;
  const used = new Set([...report.faits_utilises].filter((i) => i < facts.length));
  article.sources = buildSources(facts, new Set([...used, ...declared]));
  errors.push(...checkSources(article), ...checkCompetitorLinks(article, true).filter((e) => e.startsWith("[sources]")));
  Object.assign(article, {
    methode: { assistance_ia: true, note_methode: NOTE_METHODE },
    date_mise_a_jour: "",
    resume_mise_a_jour: "",
    temps_de_lecture: `${Math.max(1, Math.round(wordCount(articlePlainText(article)) / 230))} min`,
  });
  if (!errors.length) {
    const f = await fidelity(payload, article, facts, a, now);
    errors.push(...f.errors);
    cost += f.costEur;
  }
  const unusedIdx = unusedFacts(article, { faits_utilises: used, faits_declares: declared }, facts);
  const unused = unusedIdx.length ? formatFaitsForPromptSubset(unusedIdx.map((i) => [i, facts[i]] as [number, Fait])) : null;
  return { article, raw: reply.text, errors, warnings, cost, unused };
}

const finish = (article: Article | null, errors: string[], warnings: string[], cost: number, a: Raw): StageOutcome => ({
  next: errors.length ? "a-verifier" : "a-relire",
  costEur: cost,
  reason: errors.length ? `Le contrôle a bloqué l'article après la relance :\n${errors.map((e) => `- ${e}`).join("\n")}`.slice(0, 8000) : undefined,
  data: {
    ...(article ? { draft: article, ...(article.title ? { title: String(article.title).slice(0, 300) } : {}) } : {}),
    writeWarnings: warnings.length ? warnings.map((w) => `- ${w}`).join("\n").slice(0, 4000) : null,
    ...(errors.length ? {} : { writeErrors: null }),
    writeContext: { ...(a.writeContext as Ctx), retry: undefined },
  },
});

async function redaction(payload: Payload, a: Raw, now: Date): Promise<StageOutcome> {
  const ctx = a.writeContext as Ctx;
  if (!ctx?.sitemap) throw new Error("Préparation absente : l'article repasse par la préparation.");
  const facts = factsOf(a);
  const prompt = buildArticlePrompt({
    keyword: String(a.keyword || a.title || ""),
    angle: a.ideaAngle as string,
    outline: String(a.ideaOutline ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    cluster: ctx.cluster,
    secondary: secondaryOf(a),
    intent: (a.intent as Intent) ?? null,
    themeKind: ctx.sales ? "vente" : "trafic",
    wordcount: (a.wordcountTarget as number) ?? null,
    requiredUrls: ctx.requiredUrls,
    related: ctx.related,
    sitemap: ctx.sitemap,
    competitors: ctx.competitors,
    serpBrief: ctx.brief ?? null,
    factsBlock: formatFaitsForPrompt(facts),
    clientCase: a.clientCase as string,
    offersGrid: ctx.offersText,
    allowedOutbound: [...ALLOWED_OUTBOUND_DOMAINS],
    today: now.toISOString().slice(0, 10),
    rulesVersion: Number(a.rulesVersion),
    rulesText: "",
  });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const r = await attempt(payload, a, now, messages);
  if (!r.errors.length) return finish(r.article, [], r.warnings, r.cost, a);
  // Contrôle échoué : la relance se fait au passage suivant (5 minutes au plus par passage).
  return {
    next: "relance",
    costEur: r.cost,
    data: {
      ...(r.article ? { draft: r.article } : {}),
      writeErrors: `Premier essai bloqué par le contrôle :\n${r.errors.map((e) => `- ${e}`).join("\n")}`.slice(0, 8000),
      writeContext: { ...ctx, retry: { messages: [...messages, { role: "assistant", content: r.raw }, { role: "user", content: retryMessage(r.errors, r.unused) }] } },
    },
  };
}

async function relance(payload: Payload, a: Raw, now: Date): Promise<StageOutcome> {
  const ctx = a.writeContext as Ctx;
  if (!ctx?.retry?.messages?.length) return { next: "redaction" };
  const r = await attempt(payload, a, now, ctx.retry.messages);
  return finish(r.article, r.errors, r.warnings, r.cost, a);
}

// ── 5. Mise à jour d'un article en ligne (décidée par l'équipe, sans relecture) ──

/**
 * Réécrit la TL;DR, les capsules et la FAQ à partir des faits revérifiés (refresh
 * du pipeline Python), puis écrit dans WordPress — garde-fous du 18/11/2026 :
 *  - même contrôle des faits ; le reste de l'article doit être conforme
 *    (sinon « À vérifier » avec la liste : on n'écrit pas par-dessus) ;
 *  - seules les parties réécrites changent : jamais le titre, le SEO, l'auteur,
 *    ni la relecture ; la date ne bouge que s'il y a un vrai changement ;
 *  - relire avant (article inchangé depuis la synchronisation), relire après ;
 *  - l'ancienne version est gardée sur la fiche (« Annuler la mise à jour »).
 * Une relance au plus (passage suivant), comme le pipeline Python.
 */
async function maj(payload: Payload, a: Raw, now: Date): Promise<StageOutcome> {
  const wpId = Number(a.wpId);
  if (!wpId) return { next: "a-verifier", reason: "Mise à jour impossible : l'article n'a pas d'identifiant WordPress." };
  const facts = factsOf(a);
  const clientCase = String(a.clientCase ?? "");
  const keyword = String(a.keyword || a.wpFocusKeyword || a.title || "");
  const post = await readPost(wpId);
  if (post.status !== "publish") return { next: "a-verifier", reason: `Mise à jour annulée : l'article n'est pas en ligne dans WordPress (${post.status}).` };
  const current = wpPostToArticle(post.acf as never, String(a.title ?? ""));
  const ctx = (a.writeContext ?? {}) as { majRetry?: Anthropic.MessageParam[] };
  const messages: Anthropic.MessageParam[] = ctx.majRetry?.length ? ctx.majRetry : [{ role: "user", content: refreshPrompt(current, keyword, facts, clientCase) }];
  const reply = await runArticleModel(payload, { model: WRITER_MODEL, system: REFRESH_SYSTEM, messages, maxTokens: REFRESH_MAX_TOKENS, detail: `mise à jour de l'article « ${String(a.title ?? "").slice(0, 60)} »`, now });
  if (reply.stopReason === "max_tokens") throw new Error("Mise à jour tronquée (réponse trop longue).");
  if (reply.stopReason === "refusal") throw new Error("Mise à jour refusée par le modèle.");
  const parts = parseRefreshResponse(reply.text);
  const checked = checkRefreshParts(current, parts, facts, clientCase);
  if (checked.errors.length || !checked.article) {
    if (!ctx.majRetry?.length) {
      // Relance au passage suivant, avec les erreurs (retry du pipeline Python).
      return {
        next: "maj",
        costEur: reply.costEur,
        data: { writeErrors: `Premier essai de mise à jour bloqué :\n${checked.errors.map((e) => `- ${e}`).join("\n")}`.slice(0, 8000), writeContext: { ...ctx, majRetry: [...messages, { role: "assistant", content: reply.text }, { role: "user", content: retryMessage(checked.errors, null) }] } },
      };
    }
    return { next: "a-verifier", costEur: reply.costEur, reason: `Mise à jour bloquée par le contrôle après la relance (rien n'a été écrit dans WordPress) :\n${checked.errors.map((e) => `- ${e}`).join("\n")}`.slice(0, 8000), data: { writeContext: { ...ctx, majRetry: undefined } } };
  }
  const updated = checked.article;
  const body = bodyViolations(updated, facts, clientCase);
  if (body.length) {
    return { next: "a-verifier", costEur: reply.costEur, reason: `Mise à jour non écrite : le reste de l'article contient des chiffres ou références sans source, à corriger d'abord dans WordPress :\n${body.map((e) => `- ${e}`).join("\n")}`.slice(0, 8000), data: { writeContext: { ...ctx, majRetry: undefined } } };
  }
  if (!hasRealChange(current, updated)) {
    return { next: "publie", costEur: reply.costEur, data: { writeWarnings: "Mise à jour sans changement réel : rien n'a été écrit, la date n'a pas bougé.", writeContext: { ...ctx, majRetry: undefined } } };
  }
  updated.sources = buildSources(facts, checked.faits_utilises);
  const sourceErrors = checkSources(updated);
  if (sourceErrors.length) return { next: "a-verifier", costEur: reply.costEur, reason: `Mise à jour non écrite : ${sourceErrors.join(" ; ")}`, data: { writeContext: { ...ctx, majRetry: undefined } } };
  // Anti-copie (étape 5) : une mise à jour sans relecture n'écrit jamais un texte trop proche d'un concurrent.
  const { copyCheck } = await import("@/modules/editorial/lib/competitors/run");
  const copy = await copyCheck(payload, "articles", { ...a, acf: { ...(post.acf as Raw), introduction: updated.introduction, contenu: updated.contenu, faq: updated.faq } });
  if (copy.blocked) return { next: "a-verifier", costEur: reply.costEur, reason: `Mise à jour non écrite : ${copy.blocked}`, data: { writeContext: { ...ctx, majRetry: undefined } } };
  const { previousAcf, modifiedIso } = await updateFields(
    wpId,
    { acf: { introduction: updated.introduction ?? "", contenu: updated.contenu ?? [], faq: updated.faq ?? [], sources: updated.sources, date_mise_a_jour: parisDay(now), resume_mise_a_jour: RESUME_MISE_A_JOUR } },
    (a.wpModified as string) ?? null,
  );
  return {
    next: "publie",
    costEur: reply.costEur,
    data: { previousAcf, lastUpdateAt: now.toISOString(), wpModified: modifiedIso, writeWarnings: null, writeContext: { ...ctx, majRetry: undefined } },
  };
}

export const WRITING_STAGES: Stages = { recherche: research, preparation, redaction, relance, maj };
