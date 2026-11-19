/**
 * LA REPRISE D'UN ARTICLE DÉJÀ PUBLIÉ (« refresh ») : portage fidèle des fonctions pures de
 * tim-management (`refresh.py`, `generator.py` l. 573-799, `wordpress.post_to_article`).
 * Inventaire : docs/articles/inventaire-pipeline-python/process-et-prompts.md, § 4.
 *
 * Seules la TL;DR, les capsules du corps (le <strong> qui ouvre le paragraphe suivant un H2) et la
 * FAQ sont régénérées ; le reste du corps n'est jamais réécrit, seulement contrôlé
 * (`bodyViolations`, à corriger à la main). La date de mise à jour ne bouge jamais sans changement
 * réel (`hasRealChange`).
 *
 * Écart voulu avec Python : la marque s'écrit « TIM Management » (décision du 18/11/2026) ; le
 * prompt de reprise ne la nomme pas, il est donc repris mot pour mot. FAQ de 4 à 6 questions.
 *
 * Pur (testé) : ni réseau, ni Payload.
 */
import { createHash } from "node:crypto";

import {
  articleTexts,
  asStr,
  bodyCapsules,
  buildTldr,
  CAPSULE_MAX_WORDS,
  CAPSULE_MIN_WORDS,
  checkFacts,
  checkRefresh,
  formatFaitsForPrompt,
  norm,
  parseJsonResponse,
  sanitizeArticle,
  sanitizeHtml,
  stripTags,
} from "@/modules/editorial/lib/articles/check";
import type { Article, ArticleFaq, Fait, Fragment } from "@/modules/editorial/lib/articles/check";
import { findall, pyRe, pyStr, pyStrip, search, sub } from "@/modules/editorial/lib/articles/check/py";
import type { WpAcf, WpPost } from "@/modules/editorial/lib/articles/from-wp";
import { FACT_RULE, NO_EXTRAPOLATION_RULE, SYSTEM_PROMPT } from "@/modules/editorial/lib/articles/writer/prompt";

/** Résumé posé avec la date de mise à jour quand une reprise est appliquée. */
export const RESUME_MISE_A_JOUR = "Chiffres et FAQ actualisés";
/** Ancienneté minimale (en mois) d'un article pour le refresh mensuel. */
export const REFRESH_MONTHS = 6;

/** Encadré TL;DR produit par le pipeline (forme normalisée par sanitizeHtml). */
const TLDR_RE = pyRe(String.raw`<div class="tldr-box">.*?</div>`, "s");
/** Encadré TL;DR quelle que soit sa forme (anciens articles : class='…' + style). */
const ANY_TLDR_RE = pyRe(String.raw`<div\b[^>]*class\s*=\s*["'][^"']*\btldr-box\b[^"']*["'][^>]*>.*?</div>`, "si");
const LI_RE = pyRe(String.raw`<li\b[^>]*>(.*?)</li>`, "s");
/** Même motif que BODY_CAPSULE_RE (check/structure.ts) : les capsules remplacées sont celles que bodyCapsules lit. */
const CAPSULE_AFTER_H2_RE = pyRe(String.raw`(</h2>\s*<p>\s*)<strong\b[^>]*>(.*?)</strong>`, "si");

/** `html.escape(s, quote=False)`. */
function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

// ── TL;DR ─────────────────────────────────────────────────────────────────────

export function hasTldr(introduction: string | null | undefined): boolean {
  return search(ANY_TLDR_RE, introduction ?? "") !== null;
}

/** Place la TL;DR en tête de l'introduction, sans toucher au reste du HTML. */
export function insertTldr(introduction: string | null | undefined, tldrHtml: string): string {
  return tldrHtml + (introduction ?? "");
}

// ── Parties régénérées ────────────────────────────────────────────────────────

export type RefreshFaq = { titre: string; text: string };
export type RefreshParts = { tldr_points: string[]; capsules: string[]; faq: RefreshFaq[] };
export type RefreshResponse = RefreshParts & { faits_utilises: unknown[] };

/** Fragments régénérés par le refresh (soumis à la validation stricte). */
export function refreshTexts(article: Article): Fragment[] {
  const m = search(TLDR_RE, asStr(article.introduction));
  const texts: Fragment[] = [["TL;DR", m ? m[0] : ""]];
  for (const c of bodyCapsules(article)) texts.push([c.where, c.inner]);
  (article.faq ?? []).forEach((q, i) => {
    texts.push([`FAQ ${i + 1} question`, asStr(q?.titre)]);
    texts.push([`FAQ ${i + 1} réponse`, asStr(q?.text)]);
  });
  return texts;
}

/** Inverse d'applyRefresh : TL;DR (points), capsules du corps (texte) et FAQ. */
export function extractRefreshParts(article: Article): RefreshParts {
  const m = search(TLDR_RE, asStr(article.introduction));
  return {
    tldr_points: m ? findall(LI_RE, m[0]).map((li) => pyStrip(stripTags(li))) : [],
    capsules: bodyCapsules(article).map((c) => pyStrip(stripTags(c.inner))),
    faq: (article.faq ?? []).map((q) => ({ ...(q ?? {}) }) as RefreshFaq),
  };
}

/**
 * Injecte TL;DR (remplacée, ou ajoutée en tête de l'introduction), capsules (dans l'ordre, après
 * chaque `</h2><p>`) et FAQ (remplacée) dans une copie nettoyée de l'article.
 */
export function applyRefresh<T extends Article>(article: T, parts: Partial<RefreshParts>): T {
  const next = sanitizeArticle(structuredClone(article));
  const tldr = buildTldr((parts.tldr_points ?? []).map(asStr));
  const intro = asStr(next.introduction);
  const single = new RegExp(TLDR_RE.source, TLDR_RE.flags.replace("g", ""));
  next.introduction = search(TLDR_RE, intro) ? intro.replace(single, () => tldr) : tldr + intro;

  const capsules = [...(parts.capsules ?? [])];
  const repl = (whole: string, head: string): string => {
    if (!capsules.length) return whole;
    const text = escapeHtml(pyStrip(stripTags(asStr(capsules.shift()))));
    return `${head}<strong>${text}</strong>`;
  };
  for (const b of next.contenu ?? []) {
    if (b && b.texte) b.texte = sub(CAPSULE_AFTER_H2_RE, repl, asStr(b.texte));
  }
  next.faq = (parts.faq ?? []).filter(isRecord).map((q) => ({ titre: asStr(q.titre), text: sanitizeHtml(asStr(q.text)) }));
  return next;
}

// ── Contrôles et décisions ────────────────────────────────────────────────────

/** Mois calendaires en arrière, jour borné à la fin du mois (31/08 − 6 mois = 28/02). Dates UTC. */
export function monthsAgo(d: Date, n: number): Date {
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1 - n;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(d.getUTCDate(), lastDay)));
}

/** `json.dumps(x, ensure_ascii=False, sort_keys=True)` (séparateurs par défaut « , » et « : »). */
function pyJsonDumps(x: unknown): string {
  if (x === null || x === undefined) return "null";
  if (typeof x === "string") return JSON.stringify(x);
  if (typeof x === "boolean") return x ? "true" : "false";
  if (typeof x === "number") return Number.isInteger(x) ? String(x) : pyStr(x);
  if (Array.isArray(x)) return `[${x.map(pyJsonDumps).join(", ")}]`;
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort((a, b) => {
      const ca = Array.from(a, (c) => c.codePointAt(0) as number);
      const cb = Array.from(b, (c) => c.codePointAt(0) as number);
      for (let i = 0; i < Math.min(ca.length, cb.length); i++) if (ca[i] !== cb[i]) return ca[i] - cb[i];
      return ca.length - cb.length;
    });
  return `{${keys.map((k) => `${JSON.stringify(k)}: ${pyJsonDumps(o[k])}`).join(", ")}}`;
}

/** Empreinte des faits et du cas client : 16 premiers caractères du sha256 (identique à Python). */
export function factsFingerprint(faits: Fait[], casClient: string | null | undefined): string {
  const payload = pyJsonDumps({ faits, cas_client: pyStrip(casClient ?? "") });
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}

/** Texte normalisé des parties régénérables (TL;DR, capsules, FAQ). */
export function refreshedText(article: Article): string {
  return norm(refreshTexts(article).map(([, h]) => stripTags(h)).join(" "));
}

export function hasRealChange(before: Article, after: Article): boolean {
  return refreshedText(before) !== refreshedText(after);
}

/**
 * Changement réel = faits_sources/cas_client modifiés depuis le dernier refresh appliqué, ou
 * TL;DR/capsules/FAQ actuelles non conformes (chiffre non sourcé, capsule hors plage…).
 */
export function needsRefresh(fingerprint: string, previousFingerprint: string | null | undefined, refreshErrors: string[]): boolean {
  return fingerprint !== previousFingerprint || refreshErrors.length > 0;
}

/** Faits non sourcés hors des parties régénérées : à corriger à la main dans WordPress. */
export function bodyViolations(article: Article, faits: Fait[], casClient = ""): string[] {
  const refreshed = [...new Set(refreshTexts(article).map(([, h]) => h))];
  const texts: Fragment[] = [];
  for (const [where, original] of articleTexts(article, false)) {
    if (where.startsWith("FAQ")) continue;
    let html = where === "introduction" ? sub(TLDR_RE, "", original) : original;
    for (const full of refreshed) if (full) html = html.replaceAll(full, "");
    texts.push([where, html]);
  }
  return checkFacts(texts, faits, casClient)[0];
}

/** Numéros [n] (1-based) renvoyés par le modèle → indices 0-based. */
export function factIndices(values: unknown): Set<number> {
  const out = new Set<number>();
  if (!Array.isArray(values)) return out;
  for (const v of values) {
    const s = pyStrip(pyStr(v));
    if (/^\d+$/.test(s)) out.add(Number.parseInt(s, 10) - 1);
  }
  return out;
}

export type RefreshCheck<T extends Article> = { errors: string[]; article: T | null; faits_utilises: Set<number> };

/**
 * Vérification après génération (regenerate_refresh_parts) : nombre de capsules identique, puis,
 * sur l'article réinjecté, checkFacts des seules parties régénérées et checkRefresh. Sans erreur,
 * `article` est l'article mis à jour et `faits_utilises` = faits détectés ∪ faits déclarés.
 * `parts` à null = réponse illisible (« JSON invalide »).
 */
export function checkRefreshParts<T extends Article>(
  article: T,
  parts: RefreshResponse | null,
  faits: Fait[],
  casClient = "",
): RefreshCheck<T> {
  if (!parts) return { errors: ["JSON invalide : aucun objet JSON exploitable dans la réponse"], article: null, faits_utilises: new Set() };
  const expected = bodyCapsules(article).length;
  if (parts.capsules.length !== expected) {
    return { errors: [`capsules : ${parts.capsules.length} reçues, ${expected} attendues`], article: null, faits_utilises: new Set() };
  }
  const next = applyRefresh(article, parts);
  const [factErrors, used] = checkFacts(refreshTexts(next), faits, casClient);
  const errors = [...factErrors, ...checkRefresh(next)];
  if (errors.length) return { errors, article: null, faits_utilises: new Set() };
  return { errors: [], article: next, faits_utilises: new Set([...used, ...factIndices(parts.faits_utilises)]) };
}

// ── Prompt ────────────────────────────────────────────────────────────────────

/** Le refresh utilise le system de génération d'article (`_call_claude`, system par défaut). */
export const REFRESH_SYSTEM = SYSTEM_PROMPT;
/** `max_tokens` de l'appel de reprise. */
export const REFRESH_MAX_TOKENS = 16000;

/** Le prompt de regenerate_refresh_parts, mot pour mot. */
export function refreshPrompt(article: Article, keyword: string, faits: Fait[], casClient = ""): string {
  const capsules = bodyCapsules(article).map((c) => ({ section: c.section, texte: pyStrip(stripTags(c.inner)) }));
  const tldr = search(TLDR_RE, sanitizeHtml(asStr(article.introduction)));
  const faq = (article.faq ?? []).map((q: ArticleFaq) => ({ titre: asStr(q?.titre), text: pyStrip(stripTags(asStr(q?.text))) }));

  return `Actualise un article publié sur "${keyword}" : régénère UNIQUEMENT la TL;DR, les capsules et la FAQ.

${FACT_RULE} ${NO_EXTRAPOLATION_RULE}
Supprime de ces éléments tout chiffre, organisme, référence légale ou entreprise qui ne figure pas dans FAITS VÉRIFIÉS / CAS CLIENT.

FAITS VÉRIFIÉS :
${formatFaitsForPrompt(faits)}

CAS CLIENT :
${pyStrip(casClient ?? "") || "(vide)"}

TL;DR ACTUELLE :
${tldr ? pyStrip(stripTags(tldr[0])) : "(absente)"}

CAPSULES ACTUELLES (dans l'ordre) :
${JSON.stringify(capsules, null, 1)}

FAQ ACTUELLE :
${JSON.stringify(faq, null, 1)}

Contraintes :
- "tldr_points" : 3 à 5 points autonomes (texte brut).
- "capsules" : EXACTEMENT ${capsules.length} textes, dans le même ordre, chacun de ${CAPSULE_MIN_WORDS} à ${CAPSULE_MAX_WORDS} mots, autonome, sans lien ni HTML, entité nommée en toutes lettres (jamais « il », « ce dernier »). Garde le sujet de chaque section.
- "faq" : 4 à 6 questions ; chaque "text" commence par <p><strong>capsule de ${CAPSULE_MIN_WORDS} à ${CAPSULE_MAX_WORDS} mots</strong></p>.
- "faits_utilises" : numéros [n] des FAITS VÉRIFIÉS utilisés.

Format JSON strict :
{"tldr_points": ["…"], "capsules": ["…"], "faq": [{"titre": "… ?", "text": "<p><strong>…</strong></p>"}], "faits_utilises": []}`;
}

/** Réponse du modèle → parties régénérées, ou null si la réponse n'est pas un objet JSON. */
export function parseRefreshResponse(text: string | null | undefined): RefreshResponse | null {
  let raw: unknown;
  try {
    raw = parseJsonResponse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  return {
    tldr_points: list(raw.tldr_points).map(asStr),
    capsules: list(raw.capsules).map(asStr),
    faq: list(raw.faq)
      .filter(isRecord)
      .map((q) => ({ titre: asStr(q.titre), text: asStr(q.text) })),
    faits_utilises: list(raw.faits_utilises),
  };
}

// ── WordPress ─────────────────────────────────────────────────────────────────

/** Article du pipeline depuis l'ACF d'un post REST (context=edit), comme `post_to_article`. */
export function wpPostToArticle(acf: WpAcf | unknown[] | null | undefined, title: WpPost["title"] | string | null | undefined): Article {
  const a: Record<string, unknown> = isRecord(acf) ? acf : {};
  const t: unknown = title || {};
  const titleText = isRecord(t) ? asStr(t.raw) || asStr(t.rendered) : String(t);
  const orEmpty = <D>(x: unknown, d: D): D => (x ? (x as D) : d);
  return {
    title: titleText,
    introduction: orEmpty(a.introduction, ""),
    contenu: orEmpty(a.contenu, []),
    conclusion: orEmpty(a.conclusion, ""),
    faq: orEmpty(a.faq, []),
    sources: orEmpty(a.sources, []),
  };
}

/**
 * Date d'un champ ACF date_picker (date_mise_a_jour, methode.relu_le) : Y-m-d. Accepte une Date
 * (jour UTC), « YYYY-MM-DD » ou « YYYYMMDD » ; vide reste vide ; autre forme : erreur.
 */
export function acfDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = pyStrip(String(value));
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);
  if (!m) throw new Error(`Date ACF invalide : '${s}' (attendu Y-m-d)`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}
