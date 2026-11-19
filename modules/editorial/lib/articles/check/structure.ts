/**
 * Structure de l'article (GEO) : TL;DR, capsules, titres, intertitres, fan-out, médias
 * (validation.py, l. 685-845, 996-1010, 1182-1215).
 */
import {
  CAPSULE_MAX_WORDS,
  CAPSULE_MIN_WORDS,
  FANOUT_MAX,
  FANOUT_MIN,
  H2_QUESTION_MIN_RATIO,
  VIDEO_MAX_WORDS,
  VIDEO_MIN_WORDS,
} from "./constants";
import { articleTexts, asStr, norm, stripTags, wordCount } from "./normalize";
import { cpSlice, findall, finditer, pyRe, pyRstrip, pyStrip, search, sub } from "./py";
import type { Article } from "./types";

export const STRONG_RE = pyRe(String.raw`<strong\b[^>]*>(.*?)</strong>`, "si");
const H2_RE = pyRe(String.raw`<h2\b[^>]*>(.*?)</h2>`, "si");
const WS_RE = pyRe(String.raw`\s+`);

const PRONOUN_START = ["il", "elle", "ils", "elles", "cela", "ceci", "celui-ci", "celle-ci"];
const PRONOUN_ANYWHERE = pyRe(String.raw`\b(ce dernier|cette derniere|ces derniers|ces dernieres|celui-ci|celle-ci|ceux-ci|celles-ci)\b`);

const STYLE_ATTR_RE = pyRe(String.raw`\s+style\s*=\s*("[^"]*"|'[^']*')`, "i");
const TLDR_SINGLE_QUOTES_RE = pyRe(String.raw`class\s*=\s*'tldr-box'`);

/** Retire tout attribut style (le front porte le CSS) et normalise la TL;DR. */
export function sanitizeHtml(html: string | null | undefined): string {
  return sub(TLDR_SINGLE_QUOTES_RE, 'class="tldr-box"', sub(STYLE_ATTR_RE, "", html ?? ""));
}

/** Modifie l'article en place (introduction, conclusion, blocs, réponses de FAQ) et le renvoie. */
export function sanitizeArticle<T extends Article>(article: T): T {
  for (const k of ["introduction", "conclusion"] as const) {
    if (typeof article[k] === "string") article[k] = sanitizeHtml(article[k]);
  }
  for (const b of article.contenu ?? []) if (b && typeof b.texte === "string") b.texte = sanitizeHtml(b.texte);
  for (const q of article.faq ?? []) if (q && typeof q.text === "string") q.text = sanitizeHtml(q.text);
  return article;
}

export function getH2s(article: Article): string[] {
  const h2s: string[] = [];
  for (const b of article.contenu ?? []) for (const h of findall(H2_RE, asStr(b?.texte))) h2s.push(pyStrip(sub(WS_RE, " ", stripTags(h))));
  return h2s;
}

// Positions de capsule : le <strong> qui ouvre le paragraphe suivant un H2, et celui qui ouvre la
// réponse d'une FAQ. Un autre <strong> (étiquette d'une puce, d'un tableau) n'est pas une capsule.
export const BODY_CAPSULE_RE = pyRe(String.raw`(</h2>\s*<p>\s*)<strong\b[^>]*>(.*?)</strong>`, "si");
const FAQ_CAPSULE_RE = pyRe(String.raw`^(\s*<p>\s*)<strong\b[^>]*>(.*?)</strong>`, "si");

function capsuleSpans(html: string, faq: boolean): Array<[number, number]> {
  return finditer(faq ? FAQ_CAPSULE_RE : BODY_CAPSULE_RE, html).map((m) => [m.index + m[1].length, m.index + m[0].length]);
}

/** [emplacement, html complet du strong, contenu interne] des seules capsules, contenu + FAQ. */
export function iterCapsules(article: Article): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  (article.contenu ?? []).forEach((b, i) => {
    for (const m of finditer(BODY_CAPSULE_RE, asStr(b?.texte))) out.push([`bloc ${i + 1}`, m[0].slice(m[1].length), m[2]]);
  });
  (article.faq ?? []).forEach((q, i) => {
    const m = search(FAQ_CAPSULE_RE, asStr(q?.text));
    if (m) out.push([`FAQ ${i + 1}`, m[0].slice(m[1].length), m[2]]);
  });
  return out;
}

/** Retire les balises <strong> hors position de capsule (le texte est gardé). */
export function unwrapExtraStrong(html: string, faq = false): string {
  const src = html ?? "";
  const keep = capsuleSpans(src, faq);
  let out = "";
  let pos = 0;
  for (const m of finditer(STRONG_RE, src)) {
    if (keep.some(([a, b]) => a <= m.index && m.index < b)) continue;
    out += src.slice(pos, m.index) + m[1];
    pos = m.index + m[0].length;
  }
  return out + src.slice(pos);
}

/** Génération : la balise <strong> est réservée aux capsules, les autres sont retirées (en place). */
export function unwrapArticleStrong<T extends Article>(article: T): T {
  for (const b of article.contenu ?? []) if (b && typeof b.texte === "string") b.texte = unwrapExtraStrong(b.texte);
  for (const q of article.faq ?? []) if (q && typeof q.text === "string") q.text = unwrapExtraStrong(q.text, true);
  return article;
}

const LINK_RE = pyRe(String.raw`<a\b`, "i");

export function capsuleProblems(innerHtml: string): string[] {
  const problems: string[] = [];
  const wc = wordCount(innerHtml);
  if (!(CAPSULE_MIN_WORDS <= wc && wc <= CAPSULE_MAX_WORDS)) problems.push(`${wc} mots (attendu ${CAPSULE_MIN_WORDS}-${CAPSULE_MAX_WORDS})`);
  if (search(LINK_RE, innerHtml)) problems.push("contient un lien");
  const t = norm(stripTags(innerHtml));
  const first = t ? t.split(" ")[0] : "";
  if (PRONOUN_START.includes(first) || t.startsWith("ce dernier") || t.startsWith("cette derniere") || search(PRONOUN_ANYWHERE, t)) {
    problems.push("reprise pronominale au lieu de l'entité nommée");
  }
  return problems;
}

const H2_FOLLOWED_BY_CAPSULE_RE = pyRe(String.raw`</h2>\s*<p>\s*<strong\b`, "i");

export function checkCapsules(article: Article): string[] {
  const errors: string[] = [];
  for (const [where, , inner] of iterCapsules(article)) {
    for (const p of capsuleProblems(inner)) errors.push(`[${where}] Capsule <strong> : ${p} — « ${cpSlice(pyStrip(stripTags(inner)), 0, 90)}… »`);
  }
  (article.contenu ?? []).forEach((b, i) => {
    const html = asStr(b?.texte);
    if (finditer(H2_FOLLOWED_BY_CAPSULE_RE, html).length < finditer(H2_RE, html).length) {
      errors.push(`[bloc ${i + 1}] Chaque H2 doit être suivi immédiatement d'une capsule <p><strong>`);
    }
  });
  (article.faq ?? []).forEach((q, i) => {
    if (!search(FAQ_CAPSULE_RE, asStr(q?.text))) errors.push(`[FAQ ${i + 1}] Réponse sans capsule <strong>`);
  });
  return errors;
}

const H1_FORBIDDEN = [pyRe(String.raw`guide\s+(complet|ultime|pratique|d[ée]finitif)`, "i"), pyRe(String.raw`^\s*guide\b[^:?]*:`, "i")];
const H1_PREFIX_RE = pyRe(String.raw`^\s*guide(?:\s+\w+)?(?:\s+20\d\d)?\s*:\s*`, "i");

/** Retire un préfixe du type « Guide complet 2026 : » d'un H1 imposé. */
export function cleanH1(title: string | null | undefined): string {
  const t = pyStrip((title ?? "").replace(H1_PREFIX_RE, ""));
  if (!t) return t;
  const cps = Array.from(t);
  return cps[0].toUpperCase() + cps.slice(1).join("");
}

export function checkTitles(article: Article): string[] {
  const errors: string[] = [];
  const title = asStr(article.title);
  if (!pyStrip(title)) errors.push("H1 vide");
  if (H1_FORBIDDEN.some((rx) => search(rx, title))) {
    errors.push(`H1 : préfixe/formule interdit (« Guide complet 2026 : » et assimilés) — « ${title} »`);
  }
  const h2s = getH2s(article);
  if (!h2s.length) errors.push("Aucun H2 dans le contenu");
  else {
    const q = h2s.filter((h) => pyRstrip(h).endsWith("?")).length;
    if (q / h2s.length < H2_QUESTION_MIN_RATIO) errors.push(`H2 en question : ${q}/${h2s.length} (< ${Math.trunc(H2_QUESTION_MIN_RATIO * 100)} %)`);
  }
  return errors;
}

const TLDR_RE = pyRe('<div class="tldr-box">(.*?)</div>', "s");
const LI_RE = pyRe(String.raw`<li\b`, "i");
const STYLE_IN_INTRO_RE = pyRe(String.raw`\sstyle\s*=`, "i");

export function checkTldr(article: Article): string[] {
  const intro = asStr(article.introduction);
  const errors: string[] = [];
  const m = search(TLDR_RE, intro);
  if (!m) errors.push('Introduction : bloc <div class="tldr-box"> absent');
  else {
    const n = finditer(LI_RE, m[1]).length;
    if (!(3 <= n && n <= 5)) errors.push(`TL;DR : ${n} points (attendu 3-5)`);
  }
  if (search(STYLE_IN_INTRO_RE, intro)) errors.push("Introduction : attribut style interdit");
  return errors;
}

const H1_TAG_RE = pyRe(String.raw`<h1\b`, "i");
const HEADING_LEVEL_RE = pyRe(String.raw`<h([2-6])\b`, "i");

/** Un seul H1 (le titre) ; le contenu commence par un H2 et ne saute aucun niveau. */
export function checkHeadings(article: Article): string[] {
  const errors: string[] = [];
  for (const [where, html] of articleTexts(article, false)) {
    if (where !== "H1" && search(H1_TAG_RE, html)) errors.push(`[${where}] Balise <h1> interdite (le H1 est le titre de l'article)`);
  }
  const body = (article.contenu ?? []).map((b) => asStr(b?.texte)).join("");
  const levels = findall(HEADING_LEVEL_RE, body).map(Number);
  if (levels.length && levels[0] !== 2) errors.push(`Contenu : le premier intertitre est un H${levels[0]} (H2 attendu)`);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      errors.push(`Contenu : saut de niveau H${levels[i - 1]} -> H${levels[i]}`);
      break;
    }
  }
  return errors;
}

const isDict = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);

export function checkFanout(article: Article): string[] {
  const sq = article.sous_requetes ?? [];
  const errors: string[] = [];
  if (!(FANOUT_MIN <= sq.length && sq.length <= FANOUT_MAX)) errors.push(`sous_requetes : ${sq.length} (attendu ${FANOUT_MIN}-${FANOUT_MAX})`);
  const h2n = new Set(getH2s(article).map(norm));
  for (const item of sq) {
    const h2 = isDict(item) ? norm(asStr(item.h2)) : "";
    if (!h2n.has(h2)) {
      const req = isDict(item) ? ("requete" in item ? asStr(item.requete) : "?") : asStr(item);
      errors.push(`Sous-requête « ${req} » non couverte par un H2 existant`);
    }
  }
  return errors;
}

/** Propositions images/vidéo : avertissements seulement (tâches manuelles). */
export function checkMediaProposals(article: Article): string[] {
  const warnings: string[] = [];
  const images = article.images ?? [];
  if (!(2 <= images.length && images.length <= 3)) warnings.push(`images : ${images.length} proposition(s) (attendu 2-3)`);
  const h2n = new Set(getH2s(article).map(norm));
  images.forEach((img, i) => {
    if (!isDict(img) || !img.description_visuelle || !img.alt) warnings.push(`image ${i + 1} : description_visuelle/alt manquant`);
    else if (!h2n.has(norm(asStr(img.position_apres_h2)))) warnings.push(`image ${i + 1} : position_apres_h2 ne correspond à aucun H2`);
  });
  const video = article.video ?? {};
  if (!video.titre || !video.script) warnings.push("video : titre ou script manquant");
  else {
    const wc = wordCount(video.script);
    if (!(VIDEO_MIN_WORDS <= wc && wc <= VIDEO_MAX_WORDS)) {
      warnings.push(`video : script de ${wc} mots (≈60-90 s attendu, ${VIDEO_MIN_WORDS}-${VIDEO_MAX_WORDS} mots)`);
    }
  }
  return warnings;
}
