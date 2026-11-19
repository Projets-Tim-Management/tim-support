/**
 * Contrôles purs de la reprise d'articles publiés (generator.py, l. 573-733) : TL;DR sans fait nouveau,
 * forme des parties régénérées (TL;DR, capsules du corps, FAQ).
 */
import { checkFacts } from "./facts";
import { asStr, extractNumbers, stripTags } from "./normalize";
import { finditer, pyRe, pyStrip, search, sub } from "./py";
import { BODY_CAPSULE_RE, capsuleProblems, checkTldr, STRONG_RE } from "./structure";
import type { Article, Fait } from "./types";

const WS_RE = pyRe(String.raw`\s+`);
const H2_RE = pyRe(String.raw`<h2\b[^>]*>(.*?)</h2>`, "si");

/** `html.escape(s, quote=False)`. */
function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function buildTldr(points: string[]): string {
  const items = points.map((p) => `<li>${escapeHtml(pyStrip(stripTags(p)))}</li>`).join("");
  return `<div class="tldr-box"><p>Points clés :</p><ul>${items}</ul></div>`;
}

/** Texte brut de l'article : H1, introduction, blocs, conclusion, FAQ. */
export function articlePlainText(article: Article): string {
  const parts = [asStr(article.title), asStr(article.introduction)];
  for (const b of article.contenu ?? []) parts.push(asStr(b?.texte));
  parts.push(asStr(article.conclusion));
  for (const q of article.faq ?? []) parts.push(asStr(q?.titre) + " " + asStr(q?.text));
  return pyStrip(sub(WS_RE, " ", stripTags(parts.join(" "))));
}

/**
 * TL;DR de reprise : format 3-5 points, aucun fait non sourcé (même s'il figure déjà dans le corps)
 * et aucun nombre absent du contenu existant.
 */
export function checkTldrNoNewFacts(tldrHtml: string, article: Article, faits: Fait[]): string[] {
  const errors = checkTldr({ introduction: tldrHtml });
  const [factErrors] = checkFacts([["TL;DR", tldrHtml]], faits, "");
  errors.push(...factErrors);
  const known = extractNumbers(articlePlainText(article));
  const newNumbers = Array.from(extractNumbers(stripTags(tldrHtml))).filter((n) => !known.has(n));
  if (newNumbers.length) errors.push(`TL;DR : nombre(s) absent(s) du contenu existant : ${newNumbers.sort().join(", ")}`);
  return errors;
}

function sectionContext(html: string, pos: number, fallback: string): string {
  const h2s = finditer(H2_RE, html.slice(0, pos));
  return h2s.length ? pyStrip(stripTags(h2s[h2s.length - 1][1])) : fallback;
}

/** Capsules du corps = <strong> ouvrant le paragraphe qui suit immédiatement un H2. */
export function bodyCapsules(article: Article): Array<{ where: string; section: string; inner: string }> {
  const out: Array<{ where: string; section: string; inner: string }> = [];
  (article.contenu ?? []).forEach((b, i) => {
    const html = asStr(b?.texte);
    for (const m of finditer(BODY_CAPSULE_RE, html)) {
      out.push({ where: `bloc ${i + 1}`, section: sectionContext(html, m.index + m[1].length, ""), inner: m[2] });
    }
  });
  return out;
}

/** Règles de forme sur les seules parties régénérées (TL;DR, capsules du corps, FAQ 4-6). */
export function checkRefresh(article: Article): string[] {
  const errors = checkTldr(article);
  for (const c of bodyCapsules(article)) for (const p of capsuleProblems(c.inner)) errors.push(`[${c.where}] Capsule : ${p}`);
  const faq = article.faq ?? [];
  faq.forEach((q, i) => {
    const m = search(STRONG_RE, asStr(q?.text));
    if (!m) errors.push(`[FAQ ${i + 1}] Réponse sans capsule <strong>`);
    else errors.push(...capsuleProblems(m[1]).map((p) => `[FAQ ${i + 1}] Capsule : ${p}`));
  });
  if (!(4 <= faq.length && faq.length <= 6)) errors.push(`FAQ : ${faq.length} questions (attendu 4-6)`);
  return errors;
}
