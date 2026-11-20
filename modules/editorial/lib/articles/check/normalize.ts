/**
 * Primitives de normalisation (validation.py, l. 62-127, 921, 1218-1238, 1313-1325).
 * Toutes les règles en dépendent : comportement identique à Python, caractère pour caractère.
 */
import { HTML5_ENTITIES, INVALID_CHARREFS, INVALID_CODEPOINT_RANGES } from "./html-entities";
import { finditer, pyRe, pySplit, pyStrip, search, stripChars, sub, urlSplit } from "./py";
import type { Article, Fragment } from "./types";

// ── html.unescape ────────────────────────────────────────────────────────────

const CHARREF_RE = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/gu;

function invalidCodepoint(n: number): boolean {
  return INVALID_CODEPOINT_RANGES.some(([a, b]) => n >= a && n <= b);
}

function replaceCharref(s: string): string {
  if (s[0] === "#") {
    const num = s[1] === "x" || s[1] === "X" ? parseInt(s.slice(2).replace(/;$/, ""), 16) : parseInt(s.slice(1).replace(/;$/, ""), 10);
    if (num in INVALID_CHARREFS) return INVALID_CHARREFS[num];
    if ((num >= 0xd800 && num <= 0xdfff) || num > 0x10ffff) return "�";
    if (invalidCodepoint(num)) return "";
    return String.fromCodePoint(num);
  }
  if (Object.prototype.hasOwnProperty.call(HTML5_ENTITIES, s)) return HTML5_ENTITIES[s];
  // le plus long préfixe connu (entités historiques sans « ; »), comme le standard
  const cps = Array.from(s);
  for (let x = cps.length - 1; x > 1; x--) {
    const head = cps.slice(0, x).join("");
    if (Object.prototype.hasOwnProperty.call(HTML5_ENTITIES, head)) return HTML5_ENTITIES[head] + cps.slice(x).join("");
  }
  return "&" + s;
}

/** `html.unescape` de Python : entités HTML5 nommées (2 231) et numériques, mêmes remplacements. */
export function unescape(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(CHARREF_RE, (_m, g: string) => replaceCharref(g));
}

// ── Texte ────────────────────────────────────────────────────────────────────

const TAG_RE = /<[^>]+>/g;

/** Balise → un espace, PUIS décodage des entités (l'ordre compte : `&lt;b&gt;` reste du texte). */
export function stripTags(html: string | null | undefined): string {
  return unescape((html ?? "").replace(TAG_RE, " "));
}

const WS_RE = pyRe(String.raw`\s+`);

/** Minuscules, sans accents (NFKD, marques retirées), apostrophes et espaces unifiés. */
export function norm(text: string | null | undefined): string {
  let t = unescape(text ?? "");
  t = t.replaceAll("’", "'").replaceAll("\u00a0", " ").replaceAll("\u202f", " ");
  t = t.normalize("NFKD").replace(/\p{M}/gu, "");
  return pyStrip(sub(WS_RE, " ", t)).toLowerCase();
}

const DASHES_RE = /[\u2010\u2011\u2012\u2013]/g;
const SPACE_DOT_RE = pyRe(String.raw`[\s.]`);

/** Forme compacte pour comparer des références : « Art. L. 3121-4 » → « artl3121-4 ». */
export function compact(text: string): string {
  let t = norm(text).replace(DASHES_RE, "-");
  t = sub(SPACE_DOT_RE, "", t);
  // singulier/pluriel indifférents : « conventions collectives » = « convention collective »
  return t.replace(/conventions?collectives?/g, "conventioncollective");
}

export const NUM_SRC = String.raw`\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?`;
const NUM_RE = pyRe(NUM_SRC);
const THOUSANDS_RE = /[ \u00a0\u202f]/g;

/** Nombres d'un texte, normalisés en chaînes (« 4,20 » → « 4.2 », « 1 800 » → « 1800 »). */
export function extractNumbers(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const m of finditer(NUM_RE, text ?? "")) {
    const n = m[0].replace(THOUSANDS_RE, "").replaceAll(",", ".");
    out.add(n.includes(".") ? stripChars(stripChars(n, "0", "right"), ".", "right") : n);
  }
  return out;
}

export function wordCount(textOrHtml: string | null | undefined): number {
  return pySplit(stripTags(textOrHtml)).length;
}

const CELL_END_RE = pyRe("</(td|th)>", "i");
const BLOCK_END_RE = pyRe(String.raw`<br\s*/?>|</(p|li|h[1-6]|div|tr)>`, "i");
const SENTENCE_SPLIT_RE = pyRe(String.raw`(?<=[.!?…])\s+(?=[A-ZÀ-ÝÉÈ«"(])`);
const ABBREV_END_RE = pyRe(String.raw`\b(M|Mme|Dr|art|Art|n°)\.$`);

/** Découpe un fragment HTML en phrases (les blocs li/p/h* forment des coupures). */
export function splitSentences(html: string | null | undefined): string[] {
  // Une ligne de tableau forme une seule phrase (le libellé donne le contexte des cellules)
  let h = sub(CELL_END_RE, " ; ", html ?? "");
  h = sub(BLOCK_END_RE, "\n", h);
  const text = stripTags(h).replaceAll("\u00a0", " ").replaceAll("\u202f", " ");
  const sentences: string[] = [];
  for (const chunk of text.split("\n")) {
    const parts = pyStrip(chunk).split(new RegExp(SENTENCE_SPLIT_RE.source, "u"));
    let buf = "";
    for (const p of parts) {
      buf = buf ? pyStrip(`${buf} ${p}`) : p;
      // "M. Dupont", "art. L…", "n°. …" ne terminent pas une phrase
      if (search(ABBREV_END_RE, buf)) continue;
      if (pyStrip(buf)) sentences.push(pyStrip(sub(WS_RE, " ", buf)));
      buf = "";
    }
    if (pyStrip(buf)) sentences.push(pyStrip(sub(WS_RE, " ", buf)));
  }
  return sentences;
}

// ── URL ──────────────────────────────────────────────────────────────────────

/** Page d'accueil (chemin vide ou « / ») : jamais une source, ni un lien sortant. */
export function isHomepageUrl(url: string | null | undefined): boolean {
  return stripChars(urlSplit(pyStrip(url ?? "")).path, "/") === "";
}

/** trim → coupe au « # » → sans « / » final → toute l'URL en minuscules (chemin compris). */
export function normUrl(u: string | null | undefined): string {
  return stripChars(pyStrip(u ?? "").split("#")[0], "/", "right").toLowerCase();
}

/** Domaine de l'URL égal à l'un des domaines, ou sous-domaine de l'un d'eux. */
export function hostIn(url: string | null | undefined, domains: readonly string[]): boolean {
  const host = (urlSplit(pyStrip(url ?? "")).hostname ?? "").toLowerCase();
  return Boolean(host) && domains.some((d) => host === d || host.endsWith("." + d));
}

// ── Réponse JSON du modèle ───────────────────────────────────────────────────

const FENCE_RE = pyRe("```(?:json)?\\s*(.*?)```", "s");

/** Extrait l'objet JSON d'une réponse (tolère fences markdown et texte parasite). */
export function parseJsonResponse(rawInput: string | null | undefined): unknown {
  let raw = pyStrip(rawInput ?? "");
  const fence = search(FENCE_RE, raw);
  if (fence) raw = pyStrip(fence[1]);
  if (!raw.startsWith("{")) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Aucun objet JSON dans la réponse");
    raw = raw.slice(start, end + 1);
  }
  return JSON.parse(raw);
}

// ── Fragments d'un article ───────────────────────────────────────────────────

const asStr = (x: unknown): string => (typeof x === "string" ? x : x == null ? "" : String(x));

/** Tous les fragments soumis à la vérification des faits (ordre et libellés de Python). */
export function articleTexts(article: Article, includeMedia = true): Fragment[] {
  const texts: Fragment[] = [
    ["H1", asStr(article.title)],
    ["yoast_title", asStr(article.yoast_title)],
    ["yoast_description", asStr(article.yoast_description)],
    ["introduction", asStr(article.introduction)],
  ];
  (article.contenu ?? []).forEach((b, i) => texts.push([`bloc ${i + 1}`, asStr(b?.texte)]));
  texts.push(["conclusion", asStr(article.conclusion)]);
  (article.faq ?? []).forEach((q, i) => {
    texts.push([`FAQ ${i + 1} question`, asStr(q?.titre)]);
    texts.push([`FAQ ${i + 1} réponse`, asStr(q?.text)]);
  });
  if (includeMedia) {
    const video = article.video ?? {};
    texts.push(["vidéo titre", asStr(video.titre)]);
    texts.push(["vidéo script", asStr(video.script)]);
    (article.images ?? []).forEach((img, i) => {
      if (img && typeof img === "object" && !Array.isArray(img)) {
        const o = img as Record<string, unknown>;
        texts.push([`image ${i + 1}`, `${asStr(o.description_visuelle)}. ${asStr(o.alt)}`]);
      }
    });
  }
  return texts;
}

export { asStr };
