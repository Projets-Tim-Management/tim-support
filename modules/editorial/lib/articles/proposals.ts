import type { Payload } from "payload";

import { gscQueryPages } from "@/modules/analytics/lib/seo-gsc";
import { findCannibal, findCannibalBySearch, overlaps, topicTokens, type BoardEntry } from "@/modules/editorial/lib/articles/cannibal";
import { ONLINE_STATUSES, PREPARATION_STATUSES, REFRESH_REASONS, type ArticleStatusValue, type RefreshReason } from "@/modules/editorial/lib/articles/statuses";
import { pathKey } from "@/modules/editorial/lib/articles/stats";

/**
 * LES PROPOSITIONS D'ARTICLES DE L'ÉQUIPE SEO/GEO → LE TABLEAU (étape 3, 18/11/2026).
 *
 * Chaque lundi, Paige rend, en plus des pages du site, des propositions d'articles :
 *  - « nouvel-article » : une idée, rangée dans une thématique, avec le pourquoi
 *    chiffré, l'angle et le plan ;
 *  - « reprise » : un article existant à rafraîchir (clics en baisse, position à
 *    faire monter, échéance, format GEO manquant).
 *
 * Règles (décisions de Charlie) :
 *  - L'ÉQUIPE DÉCIDE (18/11/2026 : « je ne veux pas avoir des idées d'article, les
 *    agents savent mieux que moi, ils me proposent 2 articles prêts à être rédigés
 *    par semaine ») : un nouvel article entre directement en « Validée », la
 *    rédaction démarre seule ; Charlie relit le texte rédigé, et peut toujours
 *    arrêter un sujet (« Arrêter l'idée ») ;
 *  - CANNIBALISATION OBLIGATOIRE : une idée dont le sujet existe déjà devient une
 *    REPRISE de l'article existant (« je préfère qu'on mette à jour un article
 *    plutôt qu'on crée un doublon ») ; si le sujet est déjà en préparation, elle
 *    est écartée. Deux contrôles : le sujet (titres, slugs, mots-clés) et
 *    Search Console (la recherche visée mène-t-elle déjà à un de nos articles ?) ;
 *  - 2 articles nouveaux par semaine au plus, et pas plus de 4 articles décidés
 *    qui attendent encore leur rédaction (si la rédaction prend du retard, on
 *    n'empile pas) ;
 *  - les MISES À JOUR (reprises d'articles en ligne) aussi, l'équipe les décide,
 *    et elles partent SANS relecture (18/11/2026 : « je n'ai pas besoin de relire
 *    une mise à jour ») : l'article passe « À rafraîchir », le moteur de rédaction
 *    les réécrit sous le même contrôle des faits, puis le support les écrit dans
 *    WordPress (étapes 5 et 6) ; 2 par semaine au plus ; une mise à jour annulée
 *    par Charlie ne revient pas avant 8 semaines ;
 *  - une idée ARRÊTÉE par Charlie ne revient pas ;
 *  - rien n'est publié ni écrit dans WordPress : tout attend Charlie.
 */

export const MAX_NEW_PER_WEEK = 2;
/** Mises à jour d'articles en ligne décidées par l'équipe, par semaine. */
export const MAX_REFRESH_PER_WEEK = 2;
/** Articles décidés (« Validée », ou « Idée » ajoutée à la main) qui attendent encore leur rédaction. */
export const MAX_WAITING_IDEAS = 4;
const REFUSED_REFRESH_COOLDOWN_DAYS = 56;
const DAY = 86_400_000;


export type ArticleProposal = {
  type: "nouvel-article" | "reprise";
  theme: number | null;
  subtheme: string;
  title: string;
  keyword: string;
  intent: "tofu" | "mofu" | "bofu" | null;
  why: string;
  angle: string;
  outline: string[];
  /** Reprise : le slug (ou le titre) de l'article existant. */
  article: string;
  reason: RefreshReason;
};

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const tagOf = (text: string, tag: string) => text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? null;

/** Les propositions d'articles de la réponse de Paige (balise <articles>). Pure (testée). */
export function parseArticleProposals(text: string): ArticleProposal[] {
  let raw: unknown;
  try {
    raw = JSON.parse(tagOf(text, "articles") ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const reasons = REFRESH_REASONS.map((r) => r.value) as string[];
  return raw
    .map((i) => ({
      type: (i?.type === "reprise" ? "reprise" : "nouvel-article") as ArticleProposal["type"],
      theme: Number.isInteger(Number(i?.thematique)) && Number(i.thematique) >= 1 && Number(i.thematique) <= 7 ? Number(i.thematique) : null,
      subtheme: clip(i?.sousThematique, 120),
      title: clip(i?.titre, 200),
      keyword: clip(i?.motCle, 120),
      intent: (["tofu", "mofu", "bofu"].includes(String(i?.intention)) ? i.intention : null) as ArticleProposal["intent"],
      why: clip(i?.pourquoi, 1500),
      angle: clip(i?.angle, 500),
      outline: Array.isArray(i?.structure) ? i.structure.map((h: unknown) => clip(h, 200)).filter(Boolean).slice(0, 12) : [],
      article: clip(i?.article, 200),
      reason: (reasons.includes(String(i?.raison)) ? i.raison : "autre") as RefreshReason,
    }))
    .filter((p) => p.title && (p.type === "reprise" ? p.article : p.keyword));
}

export type BoardArticle = BoardEntry & {
  path?: string | null;
  refreshState?: string | null;
  refreshDecidedAt?: string | null;
  refreshReason?: string | null;
};

export type Decision =
  | { kind: "create"; proposal: ArticleProposal }
  | { kind: "refresh"; articleId: number | string; articleTitle: string; reason: RefreshReason; why: string; plan: string; from: ArticleProposal }
  | { kind: "skip"; title: string; motive: string };

const isOnline = (s: unknown) => ONLINE_STATUSES.includes(s as ArticleStatusValue);
const isPreparing = (s: unknown) => PREPARATION_STATUSES.includes(s as ArticleStatusValue);

const planOf = (p: ArticleProposal) => [p.angle ? `Angle : ${p.angle}` : "", ...p.outline.map((h) => `- ${h}`)].filter(Boolean).join("\n");

/** Trouve l'article d'une reprise par son slug, son adresse ou son titre exact. */
function articleOf(ref: string, board: BoardArticle[]): BoardArticle | null {
  const r = ref.trim().toLowerCase();
  const slug = r.replace(/^https?:\/\/[^/]+/, "").replace(/^\/?(actualite\/)?/, "").replace(/\/+$/, "");
  return board.find((a) => a.slug?.toLowerCase() === slug || a.path === pathKey(ref) || a.title?.trim().toLowerCase() === r) ?? null;
}

/**
 * Ce qu'on fait de chaque proposition. Pure (testée).
 * `rows` : Search Console requête × page (chemins déjà normalisés), pour le second contrôle.
 */
export function planProposals(proposals: ArticleProposal[], board: BoardArticle[], rows: { keys: string[]; impressions: number }[], now: Date): Decision[] {
  const out: Decision[] = [];
  const waiting = board.filter((a) => a.status === "idee" || a.status === "validee").length;
  // Plus de 4 articles validés attendent leur créneau : pas de nouvel article (19/11/2026), les reprises continuent.
  const queued = board.filter((a) => ["image", "pret", "programme"].includes(String(a.status))).length;
  const aheadFull = queued > 4;
  let room = aheadFull ? 0 : Math.max(0, Math.min(MAX_NEW_PER_WEEK, MAX_WAITING_IDEAS - waiting));
  const stopped = board.filter((a) => a.status === "arretee");
  const live = board.filter((a) => a.status !== "arretee");
  const touched = new Set<string>();
  // Les idées de cette même réponse comptent aussi : deux idées sur le même sujet n'en font qu'une.
  const accepted: BoardEntry[] = [];

  let refreshRoom = MAX_REFRESH_PER_WEEK;
  const proposeRefresh = (a: BoardArticle, reason: RefreshReason, why: string, plan: string, from: ArticleProposal) => {
    if (touched.has(String(a.id))) return out.push({ kind: "skip", title: from.title, motive: `Une mise à jour de « ${a.title} » est déjà décidée cette semaine.` });
    if (a.status === "a-rafraichir" || a.refreshState === "proposee") return out.push({ kind: "skip", title: from.title, motive: `Une mise à jour de « ${a.title} » est déjà en cours.` });
    if (a.refreshState === "refusee" && a.refreshDecidedAt && now.getTime() - Date.parse(a.refreshDecidedAt) < REFUSED_REFRESH_COOLDOWN_DAYS * DAY) {
      return out.push({ kind: "skip", title: from.title, motive: `Mise à jour de « ${a.title} » annulée par Charlie il y a moins de 8 semaines.` });
    }
    if (refreshRoom <= 0) return out.push({ kind: "skip", title: from.title, motive: "Plus de 2 mises à jour cette semaine." });
    refreshRoom--;
    touched.add(String(a.id));
    out.push({ kind: "refresh", articleId: a.id, articleTitle: String(a.title ?? ""), reason, why, plan, from });
  };

  for (const p of proposals) {
    if (p.type === "reprise") {
      const a = articleOf(p.article, live);
      if (!a) out.push({ kind: "skip", title: p.title, motive: `Article à reprendre introuvable dans le tableau (« ${p.article} »).` });
      else if (!isOnline(a.status)) out.push({ kind: "skip", title: p.title, motive: `« ${a.title} » n'est pas en ligne : rien à reprendre.` });
      else proposeRefresh(a, p.reason, p.why, planOf(p), p);
      continue;
    }
    // Une idée arrêtée par Charlie ne revient pas.
    if (findCannibal(p, stopped, { includeStopped: true })) {
      out.push({ kind: "skip", title: p.title, motive: "Sujet d'une idée déjà arrêtée par Charlie." });
      continue;
    }
    // Cannibalisation, obligatoire : d'abord le sujet, puis Search Console.
    const same = findCannibal(p, live) ?? findCannibalBySearch(p.keyword, rows, live as (BoardEntry & { path?: string | null })[]);
    if (same) {
      const a = same as BoardArticle;
      if (isPreparing(a.status)) out.push({ kind: "skip", title: p.title, motive: `Sujet déjà en préparation dans le tableau : « ${a.title} ».` });
      else if (isOnline(a.status)) {
        proposeRefresh(a, "doublon", `Proposé comme nouvel article (« ${p.title} », mot-clé « ${p.keyword} ») ; le sujet existe déjà : on reprend cet article plutôt que de créer un doublon. ${p.why}`.trim(), planOf(p), p);
      } else out.push({ kind: "skip", title: p.title, motive: `Sujet d'un article retiré du site : « ${a.title} ». À voir avec Charlie.` });
      continue;
    }
    const k = topicTokens(p.keyword);
    if (accepted.some((x) => overlaps(k, topicTokens(String(x.keyword ?? ""))))) {
      out.push({ kind: "skip", title: p.title, motive: "Même sujet qu'une autre idée de cette semaine." });
      continue;
    }
    if (room <= 0) {
      out.push({ kind: "skip", title: p.title, motive: aheadFull ? `Déjà ${queued} articles programmés (4 au plus d'avance) : pas de nouvel article tant que la file n'a pas baissé.` : waiting >= MAX_WAITING_IDEAS ? `Déjà ${waiting} articles décidés attendent leur rédaction (4 au plus).` : "Plus de 2 articles nouveaux cette semaine." });
      continue;
    }
    room--;
    accepted.push({ id: `new-${accepted.length}`, title: p.title, keyword: p.keyword });
    out.push({ kind: "create", proposal: p });
  }
  return out;
}

export type ApplyResult = { created: number; refreshes: number; skipped: { title: string; motive: string }[] };

/** Lit le tableau et Search Console, décide, puis écrit dans le tableau (jamais dans WordPress). */
export async function applyArticleProposals(payload: Payload, proposals: ArticleProposal[], o: { now?: Date; proposedBy: string }): Promise<ApplyResult> {
  const now = o.now ?? new Date();
  if (!proposals.length) return { created: 0, refreshes: 0, skipped: [] };
  const [docs, themes, rows] = await Promise.all([
    payload
      .find({
        collection: "articles" as never,
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { title: true, keyword: true, wpFocusKeyword: true, slug: true, status: true, wpLink: true, gscClicks: true, refreshState: true, refreshDecidedAt: true } as never,
      })
      .then((r) => r.docs as unknown as (BoardArticle & { wpLink?: string })[]),
    payload.find({ collection: "article-themes" as never, pagination: false, depth: 0, overrideAccess: true, select: { number: true } as never }).then((r) => r.docs as unknown as { id: number; number: number }[]),
    // Search Console indisponible : le contrôle par le sujet reste, seul.
    gscQueryPages(now)
      .then((r) => r.map((x) => ({ keys: [x.keys[0], pathKey(x.keys[1]) ?? ""], impressions: x.impressions })))
      .catch(() => [] as { keys: string[]; impressions: number }[]),
  ]);
  const board = docs.map((a) => ({ ...a, path: pathKey(a.wpLink) }));
  const themeId = new Map(themes.map((t) => [t.number, t.id]));
  const result: ApplyResult = { created: 0, refreshes: 0, skipped: [] };
  const at = now.toISOString();
  for (const d of planProposals(proposals, board, rows, now)) {
    try {
      if (d.kind === "skip") result.skipped.push({ title: d.title, motive: d.motive });
      else if (d.kind === "create") {
        const p = d.proposal;
        await payload.create({
          collection: "articles" as never,
          overrideAccess: true,
          data: {
            title: p.title,
            // L'équipe décide : l'article part directement en rédaction (décision du 18/11/2026).
            status: "validee",
            decidedAt: at,
            keyword: p.keyword,
            theme: p.theme != null ? (themeId.get(p.theme) ?? null) : null,
            themeSource: p.theme != null ? "auto" : null,
            subtheme: p.subtheme,
            intent: p.intent,
            ideaWhy: p.why,
            ideaAngle: p.angle,
            ideaOutline: p.outline.join("\n"),
            proposedBy: o.proposedBy,
            proposedAt: at,
            origin: "equipe-seo",
          } as never,
        });
        result.created++;
      } else {
        await payload.update({
          collection: "articles" as never,
          id: d.articleId,
          overrideAccess: true,
          context: { fromWordPress: true },
          // L'équipe décide : la mise à jour part sans relecture (décision du 18/11/2026).
          data: { status: "a-rafraichir", refreshState: "validee", refreshReason: d.reason, refreshWhy: d.why, refreshPlan: d.plan, refreshProposedBy: o.proposedBy, refreshProposedAt: at, refreshDecidedAt: at, refreshDecisionNote: null } as never,
        });
        result.refreshes++;
      }
    } catch (e) {
      result.skipped.push({ title: d.kind === "create" ? d.proposal.title : d.kind === "refresh" ? d.articleTitle : d.title, motive: `Erreur d'enregistrement : ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return result;
}
