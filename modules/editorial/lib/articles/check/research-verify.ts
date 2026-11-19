/**
 * Recherche automatique des faits : contrôles faits par le code sur les candidats du modèle
 * (research.py, l. 43-45, 113-190). Aucun appel réseau ici : les pages lues sont fournies.
 */
import { MAX_FAITS, RESEARCH_DOMAINS } from "./constants";
import { isCompetitorUrl } from "./links";
import { extractNumbers, isHomepageUrl, norm, normUrl, stripTags } from "./normalize";
import { pyRe, pyStr, pyStrip, sub, urlSplit } from "./py";
import type { Fait } from "./types";

/** Domaines de recherche et de lecture : RESEARCH_DOMAINS + domaines ajoutés pour la ligne (sans doublon). */
export function researchDomains(extra: readonly string[] = []): string[] {
  return Array.from(new Set([...RESEARCH_DOMAINS, ...extra]));
}

type Block = { type?: string; content?: unknown; [k: string]: unknown };

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

/** {url normalisée: texte} des pages lues avec succès (un PDF en base64 n'a pas de texte vérifiable). */
export function fetchedPages(blocks: Block[]): Record<string, string> {
  const pages: Record<string, string> = {};
  for (const b of blocks) {
    if (b.type !== "web_fetch_tool_result") continue;
    const res = obj(b.content);
    if (res.type !== "web_fetch_result") continue;
    const source = obj(obj(res.content).source);
    const text = source.type === "text" ? ((source.data as string | undefined) ?? "") : "";
    pages[normUrl((res.url as string | undefined) ?? "")] = text;
  }
  return pages;
}

const MD_LINK_RE = pyRe(String.raw`!?\[([^\]]*)\]\([^)]*\)`);
// `(?m)^` de Python : début de texte ou après « \n » seulement (pas \r ni U+2028 comme le `m` de JS).
const MD_LINE_MARK_RE = pyRe(String.raw`(?:^|(?<=\n))\s*(?:[-*+]|\d+[.)]|#+|>)\s+`);
const MD_INLINE_RE = pyRe(String.raw`\*\*|__|` + "`" + String.raw`|\|`);
const WS_RE = pyRe(String.raw`\s+`);
const SPACE_BEFORE_PUNCT_RE = pyRe(String.raw` ([.,;:!?)])`);

/** Forme de comparaison d'un extrait : sans Markdown ni accents ni ponctuation typographique. */
export function flat(text: string | null | undefined): string {
  let t = sub(MD_LINK_RE, (_m, g1) => g1, text ?? "");
  t = sub(MD_LINE_MARK_RE, " ", t);
  t = sub(MD_INLINE_RE, " ", t);
  t = norm(stripTags(t));
  t = t.replace(/[\u2010-\u2015]/g, "-").replaceAll("«", '"').replaceAll("»", '"').replaceAll("“", '"').replaceAll("”", '"');
  t = sub(WS_RE, " ", t);
  return pyStrip(sub(SPACE_BEFORE_PUNCT_RE, (_m, g1) => g1, t));
}

const YEAR_RE = /^(19|20)\d\d$/;

/** [faits retenus, rejets [fait, raison]]. Contrôles faits par le code, jamais par le modèle. */
export function verifyFacts(candidates: unknown[], pages: Record<string, string>, extraDomains: readonly string[] = []): [Fait[], Array<[string, string]>] {
  const kept: Fait[] = [];
  const rejected: Array<[string, string]> = [];
  const allowed = researchDomains(extraDomains);
  const has = (k: string) => Object.prototype.hasOwnProperty.call(pages, k);
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const c = raw as Record<string, unknown>;
    const fait = pyStrip(sub(WS_RE, " ", pyStr(c.fait)).replaceAll("|", "/"));
    const source = pyStrip(sub(WS_RE, " ", pyStr(c.source)).replaceAll("|", "/"));
    const url = pyStrip(pyStr(c.url));
    const extrait = pyStrip(pyStr(c.extrait));
    let annee = pyStrip(pyStr(c.annee));
    annee = YEAR_RE.test(annee) ? annee : "";
    const host = (urlSplit(url).hostname ?? "").toLowerCase();
    const key = normUrl(url);
    if (!fait || !source || !url.startsWith("http")) rejected.push([fait, "champ manquant"]);
    else if (isHomepageUrl(url)) rejected.push([fait, "page d'accueil"]);
    else if (isCompetitorUrl(url)) rejected.push([fait, `site d'un concurrent : ${host}`]);
    else if (!allowed.some((d) => host === d || host.endsWith("." + d))) rejected.push([fait, `domaine non autorisé : ${host}`]);
    else if (!has(key)) rejected.push([fait, "URL non lue pendant la recherche"]);
    else if (!pages[key]) rejected.push([fait, "page sans texte vérifiable (PDF)"]);
    else if (Array.from(flat(extrait)).length < 40 || !flat(pages[key]).includes(flat(extrait))) {
      rejected.push([fait, "extrait introuvable mot pour mot dans la page"]);
    } else {
      const inExtrait = extractNumbers(extrait);
      const missing = Array.from(extractNumbers(fait)).filter((n) => !inExtrait.has(n));
      if (missing.length) rejected.push([fait, `nombre(s) absent(s) de l'extrait : ${missing.sort().join(", ")}`]);
      else kept.push({ fait, source, url, annee });
    }
  }
  return [kept.slice(0, MAX_FAITS), rejected];
}

/** Cellule faits_sources : une ligne « fait | source | url | année » par fait (sans « | » final). */
export function formatCell(faits: Fait[]): string {
  return faits.map((f) => [f.fait, f.source, f.url ?? "", f.annee ?? ""].join(" | ").replace(/[ |]+$/, "")).join("\n");
}
