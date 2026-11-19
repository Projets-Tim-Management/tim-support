/**
 * Faits et sources : anti-invention phrase par phrase (validation.py, l. 123-683, 1280-1310).
 * Messages d'erreur identiques à Python : ils sont un contrat (tests et relance du modèle).
 */
import {
  CALC_CONSTANTS,
  CONVENTION_TEXT_DOMAINS,
  CONVENTION_TEXT_PATH,
  LEGAL_SOURCE_DOMAINS,
  OFFICIAL_SYNTHESIS_DOMAINS,
  ORGANISMES,
  SITE_DOMAIN,
  BRAND_ALLOWLIST,
} from "./constants";
import {
  articleTexts,
  asStr,
  compact,
  extractNumbers,
  hostIn,
  isHomepageUrl,
  norm,
  normUrl,
  NUM_SRC,
  splitSentences,
  stripTags,
} from "./normalize";
import { cpLen, cpSlice, escapeRe, findall, findallGroups, finditer, pyFixed, pyRe, pyRound, pySplit, pyStrip, search, sub, urlSplit } from "./py";
import type { Article, ArticleSource, Fait, Fragment } from "./types";

const WS_RE = pyRe(String.raw`\s+`);
const flatSpaces = (s: string) => pyStrip(sub(WS_RE, " ", s));

/** Hôte du site tim-management.co (liens internes). */
export function isSiteHost(host: string | null | undefined): boolean {
  // Correction décidée le 18/11/2026 : un lien est interne si l'hôte EST tim-management.co ou en est
  // un sous-domaine (« .tim-management.co »). Python acceptait tout hôte qui se terminait par
  // « tim-management.co » (faux-tim-management.co) ou qui le contenait (tim-management.co.example.com).
  const h = (host ?? "").toLowerCase();
  return h === SITE_DOMAIN || h.endsWith("." + SITE_DOMAIN);
}

// ── faits_sources / cas_client ────────────────────────────────────────────────

const BULLET_RE = pyRe(String.raw`^\s*[-•*]\s*`);

/**
 * Cellule faits_sources : une ligne « fait | source | url | année ». fait et source obligatoires ;
 * une URL de page d'accueil rend la ligne invalide. Retourne [faits, lignes invalides].
 */
export function parseFaitsSources(cell: string | null | undefined): [Fait[], string[]] {
  const faits: Fait[] = [];
  const invalides: string[] = [];
  for (const raw of (cell ?? "").replaceAll("\r", "\n").split("\n")) {
    const line = pyStrip(sub(BULLET_RE, "", raw));
    if (!line) continue;
    const parts = line.split("|").map((p) => pyStrip(p));
    if (parts.length < 2 || parts.length > 4 || !parts[0] || !parts[1]) {
      invalides.push(line);
      continue;
    }
    while (parts.length < 4) parts.push("");
    const [fait, source, url, annee] = parts;
    if (url && (!(url.startsWith("http://") || url.startsWith("https://")) || isHomepageUrl(url))) {
      invalides.push(line);
      continue;
    }
    faits.push({ fait, source, url, annee });
  }
  return [faits, invalides];
}

/** Source légale : URL sur un domaine de LEGAL_SOURCE_DOMAINS (le libellé ne compte pas). */
export function isLegalFact(f: Partial<Fait>): boolean {
  return hostIn(f.url, LEGAL_SOURCE_DOMAINS);
}

export function formatFaitsForPrompt(faits: Fait[]): string {
  if (!faits.length) return "(vide)";
  return faits
    .map((f, idx) => {
      const extra = [f.annee, f.url].filter((x) => x).join(", ");
      let line = `[${idx + 1}] ${f.fait} — Source : ${f.source}` + (extra ? ` (${extra})` : "");
      if (!isLegalFact(f) && LEGAL_PATTERNS.some(([rx]) => search(rx, f.fait))) {
        line +=
          " ⚠ Source non officielle : n'en cite PAS la référence légale (article, décret, " +
          "convention collective, arrêté) ; utilise seulement le reste du fait.";
      }
      return line;
    })
    .join("\n");
}

/** Sous-ensemble de faits en gardant leur numéro d'origine [n] : liste de [indice 0-based, fait]. */
export function formatFaitsForPromptSubset(indexed: Array<[number, Fait]>): string {
  return indexed.map(([i, f]) => formatFaitsForPrompt([f]).replace("[1]", () => `[${i + 1}]`)).join("\n");
}

/**
 * Champ ACF `sources` : uniquement des lignes de faits_sources. Fait sans URL (ou URL d'accueil) :
 * aucune ligne ; dédoublonnage sur l'URL, le premier libellé est gardé.
 */
export function buildSources(faits: Fait[], indices: Iterable<number>): Required<ArticleSource>[] {
  const out: Required<ArticleSource>[] = [];
  const seen = new Set<string>();
  for (const i of Array.from(new Set(indices)).sort((a, b) => a - b)) {
    if (!(i >= 0 && i < faits.length)) continue;
    const f = faits[i];
    const url = pyStrip(f.url ?? "");
    if (!url || isHomepageUrl(url) || seen.has(normUrl(url))) continue;
    seen.add(normUrl(url));
    out.push({ libelle: f.source, url, date: f.annee ?? "" });
  }
  return out;
}

// ── Garde-fou : chiffre cité ⇒ au moins une source précise ───────────────────

export const CITE_UN_CHIFFRE_RE = pyRe(String.raw`\d|\bselon\b|d['’]après|d&#8217;après|d&rsquo;après`, "i");

function bodyParts(article: Article, onlyDicts: boolean): string[] {
  const parts = [asStr(article.introduction)];
  for (const b of article.contenu ?? []) {
    if (onlyDicts && !(b && typeof b === "object" && !Array.isArray(b))) continue;
    parts.push(asStr(b?.texte));
  }
  parts.push(asStr(article.conclusion));
  return parts;
}

/** Corps lu par le test du front : introduction, blocs, conclusion. */
export function bodyText(article: Article): string {
  return bodyParts(article, true).map((p) => p.replace(/<[^>]+>/g, " ")).join(" ");
}

// Ni une année seule (« En 2026 »), ni un numéro d'étape ou de liste (« 1. », « 2) », « étape 3 »)
// ne sont des chiffres à sourcer.
const ANNEE_SEULE_RE = pyRe(String.raw`(?<![\d.,])\b(?:19|20)\d{2}\b(?!\s*(?:%|€|euros?\b|[.,]?\d))`, "i");
const NUMERO_ETAPE_RE = pyRe(String.raw`(?:(?<=>)|^)\s*\d{1,2}\s*[.)]\s|\b[ée]tapes?\s+(?:n°\s*)?\d{1,2}\b`, "i");

function texteASourcer(article: Article): string {
  let texte = bodyParts(article, true).map((p) => sub(NUMERO_ETAPE_RE, " ", p)).join(" ");
  texte = texte.replace(/<[^>]+>/g, " ");
  return sub(ANNEE_SEULE_RE, " ", texte);
}

/**
 * Garde-fou avant brouillon : si le corps cite un chiffre, `sources` doit contenir au moins une URL
 * précise (pas une page d'accueil). Année seule et numéro d'étape ne comptent pas.
 */
export function checkSources(article: Article): string[] {
  if (!search(CITE_UN_CHIFFRE_RE, texteASourcer(article))) return [];
  const precises = (article.sources ?? []).filter((s) => (s.url ?? "").startsWith("http") && !isHomepageUrl(s.url));
  if (precises.length) return [];
  return ["Sources : le corps cite un chiffre mais le repeater `sources` est vide ou ne contient que des pages d'accueil"];
}

// ── Chiffres conventionnels ──────────────────────────────────────────────────

const CONVENTION_RE = pyRe(
  String.raw`\bconventions?\s+collectives?\b|\bconventionnel(?:le)?s?\b|\baccords?\s+(?:national|nationaux|de\s+branche)\b|` +
    String.raw`\bavenants?\b|\bidcc\b`,
  "i",
);
// Quantités (heures, %, jours…) : exclut les numéros d'article, de décision et les années seules.
const QUANTITY_RE = pyRe(
  String.raw`(\d+(?:[.,]\d+)?)\s?(?:h\b|heures?\b|%|jours?\b|mois\b|ans\b|ann[ée]es\b|semaines?\b|salari[ée]s\b)`,
  "i",
);
const TOPIC_RE = pyRe(String.raw`^\s*\[([^\]]+)\]`);
// Formules de réserve (« sauf disposition conventionnelle contraire »…) : ne déclenchent pas la règle.
const RESERVE_RE = pyRe(
  String.raw`\b(?:sauf|[àa]\s+d[ée]faut\s+de)\s+(?:dispositions?|stipulations?|pr[ée]cisions?|accords?|clauses?)` +
    String.raw`(?:\s+(?:conventionnel(?:le)?s?|collectifs?|contractuel(?:le)?s?))?\s+contraires?\b`,
  "i",
);
const KALI_ID_RE = /kali(?:cont|arti|text|scta)\d+/i;

/** Sujet d'un fait, déclaré en tête : « [contingent bâtiment] 265 heures… » → « contingent batiment ». */
export function factTopic(f: Partial<Fait>): string {
  const m = search(TOPIC_RE, f.fait ?? "");
  return m ? norm(m[1]) : "";
}

/** Fait dont la source est le texte d'une convention ou d'un accord collectif sur Légifrance. */
export function isConventionTextFact(f: Partial<Fait>): boolean {
  const url = pyStrip(f.url ?? "");
  if (!hostIn(url, CONVENTION_TEXT_DOMAINS)) return false;
  const u = urlSplit(url);
  return u.path.toLowerCase().startsWith(CONVENTION_TEXT_PATH) || KALI_ID_RE.test(`${u.path}?${u.query}`);
}

/** Synthèse officielle (Code du travail numérique, Service-Public, ministère) : domaine de l'URL. */
export function isOfficialSynthesisFact(f: Partial<Fait>): boolean {
  return hostIn(f.url, OFFICIAL_SYNTHESIS_DOMAINS);
}

function quantities(text: string | undefined): Set<string> {
  return new Set(findall(QUANTITY_RE, text ?? "").map((n) => n.replaceAll(",", ".")));
}

const sortedStr = (s: Iterable<string>) => Array.from(s).sort();

/**
 * Faits d'un même [sujet] dont le texte de la convention (Légifrance) et une synthèse officielle
 * donnent des chiffres différents : « À vérifier » avant génération.
 */
export function conventionDivergences(faits: Fait[]): string[] {
  const motifs: string[] = [];
  const topics = new Map<string, Fait[]>();
  for (const f of faits) {
    const t = factTopic(f);
    if (t) topics.set(t, [...(topics.get(t) ?? []), f]);
  }
  for (const [topic, group] of topics) {
    const texts = group.filter(isConventionTextFact);
    const syntheses = group.filter((f) => isOfficialSynthesisFact(f) && !isConventionTextFact(f));
    const textNums = new Set<string>();
    for (const f of texts) for (const n of quantities(f.fait)) textNums.add(n);
    for (const s of syntheses) {
      const nums = quantities(s.fait);
      const extra = Array.from(nums).filter((n) => !textNums.has(n));
      if (texts.length && nums.size && extra.length) {
        motifs.push(
          `Divergence sur « ${topic} » : ${s.source} donne ${sortedStr(extra).join(", ")} ` +
            `alors que le texte de la convention (Légifrance) donne ${sortedStr(textNums).join(", ") || "—"}. ` +
            "L'article doit rapporter les deux sources ; à trancher avant publication.",
        );
      }
    }
  }
  return motifs;
}

/**
 * Chiffres d'une phrase qui parle d'une convention collective : chacun doit figurer dans un fait
 * « texte de la convention » (Légifrance), ou une synthèse officielle en divergence déclarée (même
 * [sujet]). Retourne [chiffres non couverts, indices des faits utilisés].
 */
export function checkConventionFigures(sentence: string, faits: Fait[]): [Set<string>, Set<number>] {
  if (!search(CONVENTION_RE, sub(RESERVE_RE, " ", sentence))) return [new Set(), new Set()];
  const nums = quantities(sentence);
  if (!nums.size) return [new Set(), new Set()];
  const textTopics = new Set(faits.filter((f) => isConventionTextFact(f) && factTopic(f)).map(factTopic));
  const allowed: number[] = [];
  faits.forEach((f, i) => {
    if (isConventionTextFact(f) || (isOfficialSynthesisFact(f) && factTopic(f) && textTopics.has(factTopic(f)))) allowed.push(i);
  });
  const used = new Set<number>();
  const missing = new Set<string>();
  for (const n of nums) {
    const hits = allowed.filter((i) => quantities(faits[i].fait).has(n));
    if (hits.length) hits.forEach((h) => used.add(h));
    else missing.add(n);
  }
  return [missing, used];
}

// ── Montants en euros d'un exemple de calcul ─────────────────────────────────

// Un passage introduit comme hypothèse ou exemple peut contenir des montants non sourcés, à condition
// que chaque calcul « a × b = c € » soit juste. Le passage court jusqu'au prochain intertitre.
const HYPOTHESIS_START_RE = pyRe(String.raw`^\s*(?:hypoth[èe]se|exemple(?:\s+de\s+calcul)?|cas\s+pratique)\s*:`, "i");
const CALC_RE = pyRe(String.raw`(${NUM_SRC}(?:\s*[×x*+−-]\s*${NUM_SRC})+)\s*=\s*(${NUM_SRC})\s?(?:€|euros?\b)`, "i");
const CALC_TOKEN_RE = pyRe(`${NUM_SRC}|[×x*+−-]`);
const HEADING_RE = pyRe("<h[1-6][^>]*>(.*?)</h[1-6]>", "is");

function num(s: string): number {
  return parseFloat(s.replace(/[ \u00a0\u202f]/g, "").replaceAll(",", "."));
}

/** Évalue « 5 × 15 × 1,25 » ou « 560 + 160 + 48 » (× prioritaire sur +/−, de gauche à droite). */
export function evalCalc(expr: string): number {
  let total = 0;
  let term: number | null = null;
  let op = "+";
  for (const t of findall(CALC_TOKEN_RE, expr)) {
    if ("×x*".includes(t)) op = "*";
    else if ("+−-".includes(t)) {
      total += term !== null ? term : 0;
      term = null;
      op = "−-".includes(t) ? "-" : "+";
    } else {
      const n = num(t);
      if (term === null) term = op === "-" ? -n : n;
      else term *= n;
    }
  }
  return total + (term || 0);
}

/**
 * Montants en euros admis dans les passages d'hypothèse ou d'exemple de calcul.
 * Retourne [{phrase: montants admis}, erreurs de calcul].
 */
export function hypothesisAmounts(html: string): [Map<string, Set<number>>, string[]] {
  const headings = new Set(findall(HEADING_RE, html ?? "").map((h) => flatSpaces(stripTags(h))));
  const accepted = new Map<string, Set<number>>();
  const errors: string[] = [];
  let active = false;
  let inputs: number[] = [];
  let results: number[] = [];
  for (const sent of splitSentences(html)) {
    const flat = flatSpaces(sent);
    if (headings.has(flat)) {
      active = false;
      inputs = [];
      results = [];
      continue;
    }
    if (search(HYPOTHESIS_START_RE, flat)) {
      active = true;
      const calcValues = new Set(finditer(CALC_RE, flat).map((m) => num(m[2])));
      for (const a of joinNumbers(finditer(EURO_RE, flat))) if (!calcValues.has(parseFloat(a))) inputs.push(parseFloat(a));
    }
    if (!active) continue;
    const previous = [...results];
    for (const m of finditer(CALC_RE, flat)) {
      const expected = evalCalc(m[1]);
      const stated = num(m[2]);
      if (Math.abs(expected - stated) <= 0.005) results.push(stated);
      else errors.push(`Calcul faux dans un exemple : ${m[0]} (attendu ${pyFixed(expected, 2)})`);
    }
    // Total admis : somme des résultats des lignes précédentes (« soit 768 € »).
    const ok = new Set<number>([...inputs, ...results]);
    if (previous.length) ok.add(pyRound(previous.reduce((s, x) => s + x, 0), 2));
    accepted.set(sent, ok);
  }
  return [accepted, errors];
}

// ── Détection des affirmations à sourcer ──────────────────────────────────────

const EURO_RE = pyRe(String.raw`(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?)\s?(?:€|euros?\b|EUR\b)`, "i");
const PERCENT_RE = pyRe(String.raw`(\d+(?:[.,]\d+)?)\s?(?:%|pour ?cents?\b)`, "i");

function factHaystack(f: Partial<Fait>): string {
  return `${f.fait ?? ""} ${f.source ?? ""} ${f.annee ?? ""}`;
}

/** Égalité à l'arrondi près (± 0,50 €) : « 1 823 € » pour 1 823,03 €. */
const close = (a: number, b: number) => Math.abs(a - b) <= 0.5;

function euroDirect(x: number, words: Set<string>, factNums: Set<string>[], factWords: Set<string>[]): number[] {
  const out: number[] = [];
  factNums.forEach((nums, i) => {
    if (intersects(factWords[i], words) && Array.from(nums).some((n) => close(x, parseFloat(n)))) out.push(i);
  });
  return out;
}

/** Calcul simple à partir de faits sourcés : × taux, × ou ÷ constante usuelle, ± autre montant. */
function euroDerived(x: number, amounts: number[], rates: number[]): boolean {
  for (let i = 0; i < amounts.length; i++) {
    const e = amounts[i];
    if (rates.some((p) => close(x, (e * p) / 100))) return true;
    if (CALC_CONSTANTS.filter((c) => c !== 100.0).some((c) => close(x, e * c) || close(x, e / c))) return true;
    if (amounts.some((f, j) => j !== i && (close(x, e + f) || close(x, Math.abs(e - f))))) return true;
  }
  return false;
}

/** Nombres capturés, sans les recoller entre eux (« 48 060 € … 220 € » ≠ 48 060 220). */
function joinNumbers(matches: RegExpExecArray[]): Set<string> {
  const out = new Set<string>();
  for (const m of matches) for (const n of extractNumbers(m[1])) out.add(n);
  return out;
}

const intersects = (a: Set<string>, b: Set<string>) => Array.from(a).some((x) => b.has(x));

// selon / d'après insensibles à la casse, mais la MAJUSCULE qui suit reste sensible (« selon l'Insee »
// est une attribution, « selon la taille » non) : `(?i:…)` local traduit en classes explicites par pyRe.
const ATTRIBUTION_RE = pyRe(
  String.raw`(?:(?i:selon|d['’]apr[eè]s)\s+(?:(?i:le|la|les|l['’]|une?|des|du|son|sa|leur)\s*)?` +
    String.raw`(?:[A-ZÀ-Ý]|(?i:[ée]tudes?|enqu[êe]tes?|barom[èe]tres?|sondages?|rapports?|chiffres|statistiques|donn[ée]es)))` +
    String.raw`|(?i:\(?\bsources?\s*:)` +
    String.raw`|(?i:\bbarom[èe]tres?\b|\bsondages?\b)` +
    String.raw`|(?i:\b(?:une|l['’]|cette|la\s+derni[èe]re|d['’]apr[èe]s\s+une|selon\s+une)\s+(?:[ée]tude|enqu[êe]te)\b` +
    String.raw`(?!\s+de\s+(?:sol|faisabilit|prix|terrain|chantier|march)))`,
);

const ORGANISME_RES: Array<[string, RegExp]> = ORGANISMES.map((o) => [o, pyRe(String.raw`(?<![\w-])` + escapeRe(norm(o)) + String.raw`(?![\w-])`)]);

type LegalPattern = [RegExp, (m: RegExpExecArray) => string];
const LEGAL_PATTERNS: LegalPattern[] = [
  // (regex, jeton à retrouver dans une ligne Légifrance/service-public)
  [pyRe(String.raw`\barticles?\s+([LRD])\s?\.?\s?(\d+(?:[-\u2011]\d+)*)`, "i"), (m) => `${m[1].toLowerCase()}${m[2].replaceAll("\u2011", "-")}`],
  [pyRe(String.raw`\bd[ée]cret\s+(?:n\s?[°o]\s*)?(\d{2,4}-\d+)`, "i"), (m) => m[1]],
  [pyRe(String.raw`\bd[ée]cret\b`, "i"), () => "decret"],
  [pyRe(String.raw`\bloi\s+n\s?[°o]\s*(\d{2,4}-\d+)`, "i"), (m) => m[1]],
  [pyRe(String.raw`\bconventions?\s+collectives?\b`, "i"), () => "conventioncollective"],
  [pyRe(String.raw`\barr[êe]t[ée]\s+du\s+\d`, "i"), () => "arrete"],
];

/**
 * Jeton légal retrouvé dans la forme compacte d'un fait légal.
 * Correction décidée le 18/11/2026 : un jeton qui finit par un chiffre (numéro d'article, de décret,
 * de loi) doit correspondre EXACTEMENT : il ne peut pas être suivi d'un chiffre ni de « -chiffre »
 * (« l3171-4 » n'est plus satisfait par un fait qui cite « L3171-45 » ni « L3171-4-1 »). Python faisait
 * une simple recherche de sous-chaîne.
 */
export function legalTokenIn(token: string, hay: string): boolean {
  if (!/\d$/.test(token)) return hay.includes(token);
  return new RegExp(escapeRe(token) + String.raw`(?!\d|-\d)`, "u").test(hay);
}

const CAP = String.raw`[A-ZÀ-Ý][\w'’-]+`;
const ENTITY_PATTERNS: RegExp[] = [
  // Formes juridiques : « SARL Rivoira », « Rivoira SAS »
  pyRe(String.raw`\b(?:SARL|SAS|SASU|EURL|SCOP|SNC)\s+${CAP}(?:\s+${CAP})*`),
  pyRe(String.raw`\b${CAP}(?:\s+${CAP})*\s+(?:SARL|SAS|SASU|EURL|SCOP)\b`),
  // Raison sociale type « Maçonnerie Rivoira », « Constructions Martin »
  pyRe(
    String.raw`\b(?:Maçonnerie|Menuiserie|Plomberie|[ÉE]lectricit[ée]|Charpente|Couverture|Peinture|` +
      String.raw`Terrassement|Constructions?|R[ée]novation|[ÉE]tablissements|Ets|Groupe|Entreprise)\s+${CAP}(?:\s+${CAP})*`,
  ),
  // « l'entreprise Rivoira », « chez Martin BTP », « la société Dupont »
  pyRe(String.raw`(?i:\bl['’]entreprise|\bla\s+soci[ée]t[ée]|\ble\s+groupe|\bchez|\bl['’]artisan|\ble\s+cabinet)\s+${CAP}(?:\s+${CAP})*`),
  // Personnes : « M. Dupont », « Mme Martin »
  pyRe(String.raw`\b(?:M\.|Mme|Monsieur|Madame)\s+${CAP}(?:\s+${CAP})?`),
  // « Jean Dupont, gérant … »
  pyRe(
    String.raw`\b${CAP}\s+${CAP},\s+(?i:dirigeant|dirigeante|g[ée]rant|g[ée]rante|conducteur|conductrice|chef|` +
      String.raw`directeur|directrice|fondateur|fondatrice|responsable|pr[ée]sident|pr[ée]sidente|artisan)`,
  ),
];

const TESTIMONIAL_RE = pyRe(
  String.raw`\b(temoigne|temoignent|temoignage|nous confie|confie-t-(?:il|elle)|raconte-t-(?:il|elle)|` +
    String.raw`explique-t-(?:il|elle)|souligne-t-(?:il|elle)|selon son (?:dirigeant|gerant|president))\b`,
);

const ENTITY_TRIGGER_RE = pyRe(String.raw`^(l'entreprise|la societe|le groupe|chez|l'artisan|le cabinet|m\.|mme|monsieur|madame)\s+`);

function entityAllowed(entity: string, casClientN: string, faits: Fait[]): boolean {
  let e = norm(entity);
  // On retire le déclencheur (« chez », « l'entreprise »…) pour ne comparer que le nom.
  e = e.replace(ENTITY_TRIGGER_RE, "");
  e = pyStrip(e.split(",")[0]);
  if (BRAND_ALLOWLIST.some((b) => e.includes(b))) return true;
  if (e && casClientN.includes(e)) return true;
  return faits.some((f) => Boolean(e) && norm(f.source ?? "").includes(e));
}

/**
 * Mots vides du contexte des chiffres.
 * Correction décidée le 18/11/2026 : `_content_words` utilise CETTE liste, prévue pour lui (selon,
 * taux, mois de l'année, annee, plus, cette, fait, peut…). En Python, une seconde définition de
 * `_STOPWORDS` (celle de la cannibalisation, voir seo.ts) l'écrasait : « taux » ou « selon » suffisaient
 * alors à rattacher un chiffre à un fait.
 */
const CONTENT_STOPWORDS = new Set([
  "les", "des", "une", "est", "par", "sur", "aux", "ces", "son", "ses", "qui", "que", "pas", "mais",
  "dans", "pour", "avec", "sans", "plus", "sous", "leur", "leurs", "sont", "tous", "tout", "toute",
  "toutes", "elle", "donc", "dont", "meme", "tres", "aussi", "cette", "ainsi", "depuis", "contre",
  "entre", "moins", "apres", "avant", "chaque", "selon", "partir", "fait", "etre", "avoir", "peut",
  "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre",
  "novembre", "decembre", "annee", "taux",
]);
const WORD_ALIASES: Record<string, string> = { "federation francaise du batiment": "ffb" };

/** Mots de contexte : ≥ 3 lettres, hors mots vides, singulier approximatif, alias FFB. */
export function contentWords(text: string): Set<string> {
  const t = norm(text);
  const raw = new Set((t.match(/[a-z]+/g) ?? []).filter((w) => w.length >= 3 && !CONTENT_STOPWORDS.has(w)));
  // singulier approximatif (« réduits » = « réduit », « salaires » = « salaire »)
  const words = new Set(Array.from(raw).map((w) => (w.length > 4 && "sx".includes(w[w.length - 1]) ? w.slice(0, -1) : w)));
  for (const [phrase, alias] of Object.entries(WORD_ALIASES)) if (t.includes(phrase)) words.add(alias);
  return words;
}

/**
 * Chaque nombre doit figurer dans une ligne de faits_sources qui partage au moins un mot de contexte
 * avec la phrase. Retourne les lignes utilisées (triées), ou [] sinon.
 */
function coverNumbers(claimNums: Set<string>, sentenceN: string, factNums: Set<string>[], factWords: Set<string>[]): number[] {
  const words = contentWords(sentenceN);
  const used = new Set<number>();
  for (const n of claimNums) {
    const hits = factNums.map((nums, i) => (nums.has(n) && intersects(factWords[i], words) ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) return [];
    hits.forEach((h) => used.add(h));
  }
  return Array.from(used).sort((a, b) => a - b);
}

const ANCHOR_RE = pyRe(String.raw`<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>(.*?)</a>`, "is");

/**
 * Vérifie que chaque affirmation sourcée/chiffrée, organisme, référence légale, entreprise, personne
 * ou témoignage est couvert par faits_sources / cas_client. Un montant qui n'est qu'un calcul simple
 * à partir de faits sourcés va dans `warnings` (non bloquant). Retourne [erreurs, indices utilisés].
 */
export function checkFacts(texts: Fragment[], faits: Fait[], casClient = "", warnings?: string[]): [string[], Set<number>] {
  const errors: string[] = [];
  const used = new Set<number>();
  const add = (xs: Iterable<number>) => {
    for (const x of xs) used.add(x);
  };
  const casN = norm(casClient);
  const factNums = faits.map((f) => extractNumbers(factHaystack(f)));
  const factHayN = faits.map((f) => norm(factHaystack(f)));
  const factWords = faits.map((f) => contentWords(`${f.fait ?? ""} ${f.source ?? ""}`));
  const factTexts = faits.map(factHaystack);
  const calcAmounts = Array.from(new Set(factTexts.flatMap((t) => Array.from(joinNumbers(finditer(EURO_RE, t))).map(parseFloat)))).sort((a, b) => a - b);
  const calcRates = Array.from(new Set(factTexts.flatMap((t) => Array.from(joinNumbers(finditer(PERCENT_RE, t))).map(parseFloat)))).sort((a, b) => a - b);
  const legalIdx = faits.map((f, i) => (isLegalFact(f) ? i : -1)).filter((i) => i >= 0);
  const legalHay = new Map(legalIdx.map((i) => [i, compact(`${faits[i].fait} ${faits[i].source} ${faits[i].url ?? ""}`)]));

  for (const [where, htmlRaw] of texts) {
    const html = htmlRaw ?? "";
    // Texte des liens internes : un intitulé d'article du site n'affirme rien, il est ignoré par la
    // règle des références légales. Le texte d'un lien externe reste une citation contrôlée.
    const anchorsAll = findallGroups(ANCHOR_RE, html)
      // Correction décidée le 18/11/2026 : lien interne = hôte tim-management.co ou sous-domaine
      // (Python : « tim-management.co » contenu dans l'hôte).
      .filter(([href]) => href.startsWith("/") || isSiteHost(urlSplit(href).hostname))
      .map(([, t]) => flatSpaces(stripTags(t)));
    const anchors = Array.from(new Set(anchorsAll.filter((a) => a))).sort((a, b) => cpLen(b) - cpLen(a));
    const [hypOk, calcErrors] = hypothesisAmounts(html);
    errors.push(...calcErrors.map((e) => `[${where}] ${e}`));
    for (const sent of splitSentences(html)) {
      const sN = norm(sent);
      const excerpt = cpLen(sent) <= 160 ? sent : cpSlice(sent, 0, 157) + "…";

      // 1. Références légales → ligne Légifrance/service-public correspondante
      let sentHorsLiens = sub(WS_RE, " ", sent);
      for (const a of anchors) sentHorsLiens = sentHorsLiens.replaceAll(a, " ");
      let legalTokens: string[] = [];
      for (const [rx, tok] of LEGAL_PATTERNS) legalTokens.push(...finditer(rx, sentHorsLiens).map((m) => compact(tok(m))));
      // « décret » générique inutile si un n° de décret est déjà extrait
      if (legalTokens.some((t) => /^\d/.test(t))) legalTokens = legalTokens.filter((t) => t !== "decret");
      for (const t of new Set(legalTokens)) {
        const hits = legalIdx.filter((i) => legalTokenIn(t, legalHay.get(i) as string));
        if (hits.length) add(hits);
        else errors.push(`[${where}] Référence légale sans ligne Légifrance/service-public correspondante dans faits_sources : « ${excerpt} »`);
      }

      // 2. Organismes nommés
      const orgs = ORGANISME_RES.filter(([, rx]) => search(rx, sN)).map(([o]) => o);
      // « FFB » et « Fédération française du bâtiment » : même organisme
      let orgOk = true;
      for (const o of orgs) {
        const oN = norm(o);
        const rx = pyRe(String.raw`(?<![\w-])` + escapeRe(oN) + String.raw`(?![\w-])`);
        let hits = factHayN.map((h, i) => (search(rx, h) ? i : -1)).filter((i) => i >= 0);
        if (!hits.length && (oN === "ffb" || oN === "federation francaise du batiment")) {
          const alt = oN === "ffb" ? "federation francaise du batiment" : "ffb";
          hits = factHayN.map((h, i) => (h.includes(alt) ? i : -1)).filter((i) => i >= 0);
        }
        if (hits.length) add(hits);
        else {
          orgOk = false;
          errors.push(`[${where}] Organisme « ${o} » cité sans ligne faits_sources : « ${excerpt} »`);
        }
      }

      // 3. Chiffres : % ou nombre accompagné d'une attribution
      const percents = joinNumbers(finditer(PERCENT_RE, sent));
      const attributed = Boolean(search(ATTRIBUTION_RE, sent));
      const euros = joinNumbers(finditer(EURO_RE, sent));
      const claimNums = new Set(percents);
      if (attributed) for (const n of extractNumbers(sent)) if (!euros.has(n)) claimNums.add(n);

      // 3 bis. Montants en euros
      const words = contentWords(sN);
      for (const amount of sortedStr(euros)) {
        const x = parseFloat(amount);
        if (Array.from(hypOk.get(sent) ?? []).some((a) => Math.abs(x - a) <= 0.005)) continue; // exemple de calcul vérifié
        const hits = euroDirect(x, words, factNums, factWords);
        if (hits.length) add(hits);
        else if (euroDerived(x, calcAmounts, calcRates)) {
          warnings?.push(`[${where}] Montant calculé à partir de faits sourcés, à vérifier (${amount} €) : « ${excerpt} »`);
        } else errors.push(`[${where}] Montant en euros absent de faits_sources (${amount} €) : « ${excerpt} »`);
      }
      if (claimNums.size) {
        const supporting = coverNumbers(claimNums, sN, factNums, factWords);
        if (supporting.length) add(supporting);
        else if (orgOk) errors.push(`[${where}] Chiffre absent de faits_sources (${sortedStr(claimNums).join(", ")}) : « ${excerpt} »`);
      } else if (attributed && !orgs.length && !legalTokens.length) {
        // Attribution vague (« selon une étude… ») : doit nommer une source fournie
        const tokens = new Set(pySplit(sN));
        const hits = faits.map((f, i) => (pySplit(norm(f.source)).some((w) => cpLen(w) >= 3 && tokens.has(w)) ? i : -1)).filter((i) => i >= 0);
        if (hits.length) add(hits);
        else errors.push(`[${where}] Attribution sans source fournie dans faits_sources : « ${excerpt} »`);
      }

      // 3 ter. Chiffres propres à une convention collective → texte de la convention (Légifrance)
      const [convMissing, convUsed] = checkConventionFigures(sent, faits);
      add(convUsed);
      if (convMissing.size) {
        errors.push(`[${where}] Chiffre conventionnel sans le texte de la convention sur Légifrance (${sortedStr(convMissing).join(", ")}) : « ${excerpt} »`);
      }

      // 4. Entreprises / personnes → cas_client
      for (const rx of ENTITY_PATTERNS) {
        for (const m of finditer(rx, sent)) {
          if (!entityAllowed(m[0], casN, faits)) {
            errors.push(`[${where}] Entreprise/personne « ${pyStrip(m[0])} » absente de CAS CLIENT : « ${excerpt} »`);
          }
        }
      }

      // 5. Témoignage sans cas client
      if (!casN && search(TESTIMONIAL_RE, sN)) errors.push(`[${where}] Témoignage alors que CAS CLIENT est vide : « ${excerpt} »`);
    }
  }
  return [Array.from(new Set(errors)), used];
}

// ── Usage des faits (relance) ────────────────────────────────────────────────

/** Libellé principal : « Service-Public Entreprendre, fiche F2302 » → « service-public entreprendre ». */
function sourceLabel(source: string): string {
  return pyStrip(norm(source.split(",")[0]));
}

const HREF_RE = pyRe(String.raw`href\s*=\s*["']([^"']+)["']`);

/**
 * {indice: [raisons]} des faits utilisés, y compris sans chiffre : détecté par la validation, déclaré
 * par le modèle, libellé de la source cité, URL présente dans `sources` ou dans un lien.
 */
export function factUsage(article: Article, faits: Fait[], detected: Iterable<number> = [], declared: Iterable<number> = []): Record<number, string[]> {
  const fragments = articleTexts(article);
  const text = norm(fragments.map(([, h]) => stripTags(h)).join(" "));
  const hrefs = findall(HREF_RE, fragments.map(([, h]) => h).join(" ")).join(" ");
  const sourceUrls = new Set((article.sources ?? []).filter((s) => s.url).map((s) => normUrl(s.url)));
  const det = new Set(detected);
  const dec = new Set(declared);
  const usage: Record<number, string[]> = {};
  faits.forEach((f, i) => {
    const reasons: string[] = [];
    if (det.has(i)) reasons.push("chiffre/référence");
    if (dec.has(i)) reasons.push("déclaré par le modèle");
    const label = sourceLabel(f.source ?? "");
    if (cpLen(label) >= 4 && search(pyRe(String.raw`(?<![\w-])` + escapeRe(label) + String.raw`(?![\w-])`), text)) reasons.push("source citée");
    const url = normUrl(f.url);
    if (url && (sourceUrls.has(url) || hrefs.toLowerCase().includes(url))) reasons.push("URL dans sources");
    if (reasons.length) usage[i] = reasons;
  });
  return usage;
}

/** Indices (0-based) des faits qu'aucun critère de factUsage ne retrouve dans l'article. */
export function unusedFacts(article: Article, report: { faits_utilises?: Iterable<number>; faits_declares?: Iterable<number> }, faits: Fait[]): number[] {
  const usage = factUsage(article, faits, report.faits_utilises ?? [], report.faits_declares ?? []);
  return faits.map((_, i) => i).filter((i) => !(i in usage));
}
