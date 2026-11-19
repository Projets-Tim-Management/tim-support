import type { Payload } from "payload";

import { htmlToText } from "@/core/lib/html";
import { parseJsonResponse } from "@/modules/editorial/lib/articles/check";
import { HELPER_MODEL, runArticleModel } from "@/modules/editorial/lib/articles/writer/model";
import { readPost, updateFields } from "@/modules/editorial/lib/articles/wp-write";

/**
 * APRÈS LA PUBLICATION (étape 7, décisions de Charlie du 18/11/2026).
 *
 * 1. LE MAILLAGE RETOUR, sans relecture : quand un article est publié, jusqu'à
 *    3 articles en ligne de la même thématique reçoivent UN lien vers lui, dans
 *    une phrase qui parle déjà du sujet. Garde-fous : la phrase reste mot pour
 *    mot la même (seul le lien s'ajoute) ; jamais dans une capsule ni la TL;DR ;
 *    5 liens internes au plus par article ; relire avant et après l'écriture ;
 *    l'ancienne version gardée (« Annuler la mise à jour »). La date de mise à
 *    jour ne bouge pas (ajout d'un lien = changement de forme).
 * 2. LES ÉCHÉANCES : une échéance de la fiche à moins de 7 jours déclenche une
 *    mise à jour automatique (quota d'une par jour de l'ordonnancement).
 * 3. LES BILANS à 30 et 90 jours de chaque article publié (clics Google,
 *    position, visites), relevés avec les chiffres du lundi.
 * 4. LA DIFFUSION : Cléo (réseaux, vidéo) et Linda (relations presse) reçoivent
 *    les nouvelles publications dans leurs données.
 */

type Raw = Record<string, unknown>;
const COLL = "articles" as never;
const ctx = { fromWordPress: true };
const DAY = 86_400_000;
export const MAX_BACKLINKS = 3;
export const MAX_INTERNAL_LINKS = 5;

const WEAK_ANCHORS = new Set(["ici", "cliquez ici", "cliquez", "en savoir plus", "lire la suite", "cet article", "ce lien", "lien", "voir", "voir plus", "plus d'infos", "plus d'informations"]);
const norm = (s: string) => htmlToText(s).replace(/\s+/g, " ").trim();
const linkCount = (html: string) => [...html.matchAll(/<a\b[^>]*href\s*=\s*["'](?:https?:\/\/(?:[\w-]+\.)*tim-management\.co)?\/[^"']*["']/gi)].length;

/** Le texte des blocs d'un article (champ ACF `contenu`). */
const blocksOf = (acf: unknown): { acf_fc_layout?: string; texte?: string }[] =>
  acf && typeof acf === "object" && !Array.isArray(acf) && Array.isArray((acf as Raw).contenu) ? ((acf as Raw).contenu as { texte?: string }[]) : [];

/** Les articles qui recevront un lien vers le nouvel article. Pure (testée). */
export function pickBacklinkSources(target: Raw, candidates: Raw[]): Raw[] {
  const themeOf = (a: Raw) => (a.theme && typeof a.theme === "object" ? (a.theme as Raw).id : a.theme);
  const targetPath = String(target.wpLink ?? "").replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
  return candidates
    .filter((c) => c.id !== target.id && String(themeOf(c)) === String(themeOf(target)) && (c.status === "publie" || c.status === "a-rafraichir") && Number(c.wpId))
    .filter((c) => {
      const html = blocksOf(c.acf).map((b) => String(b?.texte ?? "")).join("\n") + String((c.acf as Raw)?.introduction ?? "") + String((c.acf as Raw)?.conclusion ?? "");
      return linkCount(html) < MAX_INTERNAL_LINKS && !(targetPath && html.includes(targetPath));
    })
    .sort((a, b) => Number(b.gscClicks ?? 0) - Number(a.gscClicks ?? 0))
    .slice(0, MAX_BACKLINKS);
}

/**
 * Vérifie un ajout de lien proposé par le modèle, et rend le bloc modifié (ou la
 * raison du refus). La phrase doit exister telle quelle dans le bloc, hors capsule ;
 * le texte ne change pas ; un seul lien, vers l'article cible, ancre descriptive. Pure (testée).
 */
export function applyBacklink(blockHtml: string, original: string, withLink: string, targetUrl: string): { ok: true; html: string } | { ok: false; reason: string } {
  if (!original || !withLink) return { ok: false, reason: "phrase manquante" };
  const at = blockHtml.indexOf(original);
  if (at < 0) return { ok: false, reason: "phrase introuvable telle quelle dans le bloc" };
  if (blockHtml.indexOf(original, at + 1) >= 0) return { ok: false, reason: "phrase présente plusieurs fois" };
  for (const m of blockHtml.matchAll(/<strong\b[^>]*>[\s\S]*?<\/strong>/gi)) {
    const s = m.index ?? 0;
    if (at < s + m[0].length && at + original.length > s) return { ok: false, reason: "phrase dans une capsule" };
  }
  if (/<a\b/i.test(original)) return { ok: false, reason: "la phrase contient déjà un lien" };
  // Sans les balises du lien, la phrase doit être STRICTEMENT l'originale (mots et balises).
  if (withLink.replace(/<a\b[^>]*>/i, "").replace(/<\/a>/i, "") !== original) return { ok: false, reason: "le texte de la phrase a changé" };
  const links = [...withLink.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  if (links.length !== 1 || (withLink.match(/<a\b/gi) ?? []).length !== 1) return { ok: false, reason: "un seul lien attendu" };
  const strip = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  if (strip(links[0][1]) !== strip(targetUrl)) return { ok: false, reason: "le lien ne pointe pas vers le nouvel article" };
  const anchor = norm(links[0][2]).toLowerCase().replace(/^[\s.:]+|[\s.:]+$/g, "");
  if (!anchor || WEAK_ANCHORS.has(anchor) || anchor.split(" ").length < 2) return { ok: false, reason: "ancre non descriptive" };
  return { ok: true, html: blockHtml.slice(0, at) + withLink + blockHtml.slice(at + original.length) };
}

const BACKLINK_SYSTEM = "Tu es l'éditeur SEO de TIM Management. Tu ajoutes UN lien interne dans un article existant, sans changer un seul mot. Tu réponds UNIQUEMENT avec un objet JSON valide.";

function backlinkPrompt(target: { title: string; url: string; keyword: string }, blocks: string[]): string {
  return `Ajoute dans l'ARTICLE ci-dessous UN lien vers ce nouvel article : « ${target.title} » (${target.url}), mot-clé « ${target.keyword} ».

Règles :
- Choisis UNE phrase qui parle déjà de ce sujet, dans un bloc (jamais dans une capsule <strong>, jamais dans un titre).
- "phrase_originale" : la phrase COPIÉE MOT POUR MOT du HTML du bloc (balises comprises), sans rien changer.
- "phrase_avec_lien" : exactement la même phrase, où seuls quelques mots existants sont entourés de <a href="${target.url}">…</a> : une ancre descriptive de 2 mots ou plus, qui dit ce que contient l'article (jamais « ici », « en savoir plus », « cet article »). Aucun autre mot ajouté, retiré ou modifié.
- Si aucune phrase ne s'y prête vraiment, réponds {"bloc": null}.

Réponse : {"bloc": 1, "phrase_originale": "…", "phrase_avec_lien": "…"}

ARTICLE (blocs numérotés à partir de 1) :
${blocks.map((b, i) => `[bloc ${i + 1}]\n${b}`).join("\n\n")}`;
}

/** Le maillage retour d'UN article publié (le plus ancien en attente). */
export async function runBacklinks(payload: Payload, now = new Date()): Promise<{ status: string; message?: string }> {
  const target = (
    await payload.find({ collection: COLL, where: { and: [{ backlinksPending: { equals: true } }, { status: { equals: "publie" } }] }, sort: "publishedAt", limit: 1, depth: 0, overrideAccess: true })
  ).docs[0] as unknown as Raw | undefined;
  if (!target) return { status: "pas-encore" };
  const url = String(target.wpLink ?? "");
  const candidates = (await payload.find({ collection: COLL, where: { theme: { equals: target.theme as number } }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Raw[];
  const sources = pickBacklinkSources(target, candidates);
  const done: { id: unknown; titre: unknown; resultat: string }[] = [];
  for (const src of sources) {
    try {
      const post = await readPost(Number(src.wpId));
      const acf = post.acf && !Array.isArray(post.acf) ? post.acf : {};
      const blocks = blocksOf(acf);
      const r = await runArticleModel(payload, {
        model: HELPER_MODEL,
        system: BACKLINK_SYSTEM,
        messages: [{ role: "user", content: backlinkPrompt({ title: String(target.title ?? ""), url, keyword: String(target.keyword ?? "") }, blocks.map((b) => String(b?.texte ?? ""))) }],
        maxTokens: 2_000,
        detail: `maillage retour vers « ${String(target.title ?? "").slice(0, 50)} »`,
        now,
      });
      const out = parseJsonResponse(r.text) as { bloc?: number | null; phrase_originale?: string; phrase_avec_lien?: string };
      const i = Number(out?.bloc) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= blocks.length) {
        done.push({ id: src.id, titre: src.title, resultat: "aucune phrase adaptée" });
        continue;
      }
      const edit = applyBacklink(String(blocks[i]?.texte ?? ""), String(out.phrase_originale ?? ""), String(out.phrase_avec_lien ?? ""), url);
      if (!edit.ok) {
        done.push({ id: src.id, titre: src.title, resultat: `refusé : ${edit.reason}` });
        continue;
      }
      const contenu = blocks.map((b, j) => (j === i ? { ...b, texte: edit.html } : b));
      const { previousAcf, modifiedIso } = await updateFields(Number(src.wpId), { acf: { contenu } }, (src.wpModified as string) ?? null);
      await payload.update({ collection: COLL, id: src.id as number, overrideAccess: true, context: ctx, data: { previousAcf, lastUpdateAt: now.toISOString(), wpModified: modifiedIso } as never });
      done.push({ id: src.id, titre: src.title, resultat: "lien ajouté" });
    } catch (e) {
      done.push({ id: src.id, titre: src.title, resultat: `erreur : ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) });
    }
  }
  await payload.update({ collection: COLL, id: target.id as number, overrideAccess: true, context: ctx, data: { backlinksPending: false, backlinks: done } as never });
  return { status: "fait", message: `maillage retour de « ${String(target.title)} » : ${done.filter((d) => d.resultat === "lien ajouté").length} lien(s) sur ${sources.length} article(s)` };
}

/** Les articles en ligne dont une échéance tombe dans les 7 jours et qui n'ont pas été mis à jour pour elle. Pure (testée). */
export function dueForDeadline(articles: Raw[], now: Date): { id: unknown; reason: string }[] {
  const out: { id: unknown; reason: string }[] = [];
  for (const a of articles) {
    if (a.status !== "publie") continue;
    const last = a.lastUpdateAt ? Date.parse(String(a.lastUpdateAt)) : 0;
    const due = (Array.isArray(a.deadlines) ? (a.deadlines as Raw[]) : []).find((d) => {
      const t = Date.parse(String(d.date ?? ""));
      return Number.isFinite(t) && t <= now.getTime() + 7 * DAY && last < t - 30 * DAY;
    });
    if (due) out.push({ id: a.id, reason: String(due.reason ?? "Échéance") });
  }
  return out;
}

/** Met en « À rafraîchir » les articles dont une échéance arrive (la mise à jour se fait ensuite seule). */
export async function queueDeadlineUpdates(payload: Payload, now = new Date()): Promise<number> {
  const docs = (await payload.find({ collection: COLL, where: { and: [{ status: { equals: "publie" } }, { "deadlines.date": { less_than_equal: new Date(now.getTime() + 7 * DAY).toISOString() } }] }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Raw[];
  const due = dueForDeadline(docs, now);
  for (const d of due) {
    await payload.update({
      collection: COLL,
      id: d.id as number,
      overrideAccess: true,
      context: ctx,
      data: { status: "a-rafraichir", refreshState: "validee", refreshReason: "echeance", refreshWhy: d.reason, refreshProposedBy: "Échéance de la fiche", refreshProposedAt: now.toISOString(), refreshDecidedAt: now.toISOString() } as never,
    });
  }
  return due.length;
}

/** Le bilan d'un article à 30 et 90 jours de sa publication (instantané des chiffres du lundi). Pur (testé). */
export function reviewSnapshots(a: Raw, stats: { gscClicks: number; gscImpressions: number; gscPosition: number | null; ga4Sessions: number; ga4AiSessions: number }, now: Date): Record<string, unknown> {
  const published = a.publishedAt ? Date.parse(String(a.publishedAt)) : NaN;
  if (!Number.isFinite(published)) return {};
  const snap = { le: now.toISOString().slice(0, 10), clicsGoogle: stats.gscClicks, impressions: stats.gscImpressions, position: stats.gscPosition, visites: stats.ga4Sessions, visitesIa: stats.ga4AiSessions };
  const age = (now.getTime() - published) / DAY;
  return {
    ...(age >= 30 && !a.review30 ? { review30: snap } : {}),
    ...(age >= 90 && !a.review90 ? { review90: snap } : {}),
  };
}

/** Les publications des 30 derniers jours, pour Cléo (réseaux, vidéo) et Linda (relations presse). */
export async function loadRecentPublications(payload: Payload, now = new Date()) {
  const docs = (
    await payload.find({
      collection: COLL,
      where: { and: [{ status: { in: ["publie", "a-rafraichir"] } }, { publishedAt: { greater_than: new Date(now.getTime() - 30 * DAY).toISOString() } }] },
      sort: "-publishedAt",
      limit: 10,
      depth: 1,
      overrideAccess: true,
      select: { title: true, wpLink: true, publishedAt: true, theme: true, keyword: true, draft: true, review30: true } as never,
    })
  ).docs as unknown as Raw[];
  return docs.map((d) => {
    const draft = (d.draft ?? {}) as { video?: { titre?: string; script?: string }; images?: { description_visuelle?: string }[] };
    return {
      titre: d.title,
      adresse: d.wpLink,
      publieLe: String(d.publishedAt ?? "").slice(0, 10),
      thematique: d.theme && typeof d.theme === "object" ? (d.theme as Raw).name : null,
      motCle: d.keyword,
      scriptVideo: draft.video?.script ? { titre: draft.video.titre, script: draft.video.script } : null,
      visuelsProposes: (draft.images ?? []).map((i) => i.description_visuelle).filter(Boolean),
      bilan30Jours: d.review30 ?? null,
    };
  });
}
