/**
 * LA COUVERTURE DU SUJET PAR RAPPORT AUX PAGES CLASSÉES (étape 4 du module de note, 19/11/2026).
 *
 * Méthode (rapport « Outils optimisation contenu SEO GEO », jauge Couverture) :
 *  - corpus = le top 10 de google.fr, sans forums, vidéos, PDF, réseaux sociaux
 *    ni pages de moins de 300 mots ; AU MOINS 3 DOMAINES distincts, sinon
 *    « corpus insuffisant » (jamais un 0 trompeur) ;
 *  - termes = n-grammes de 1 à 3 mots, racine légère du français, sans mots vides
 *    en bord ; un terme est RECOMMANDÉ s'il apparaît dans au moins 35 % des pages
 *    (et 2 pages au moins) ;
 *  - fourchette = du 1er au 3e quartile des occurrences pour 1 000 mots, calculé
 *    sur les seules pages qui emploient le terme ;
 *  - note = 85 % termes + 15 % questions « Autres questions posées » (les entités
 *    viendront à l'étape 5 : 60 / 25 / 15). Un terme rapporte son plein poids dans
 *    la fourchette, la moitié s'il est insuffisant, rien s'il est absent, et
 *    COÛTE s'il est en excès (au-delà de 1,5 × le haut de la fourchette).
 *  - la cible n'est pas 100 : la médiane des concurrents + 10 points.
 *
 * Les seuils (35 %, quartiles, poids) sont des HYPOTHÈSES à calibrer : aucun
 * éditeur ne publie les siens. C'est une mesure de ressemblance au top 10, pas une
 * prévision de classement.
 *
 * Pur : aucun accès réseau ni base ; chargé aussi dans le navigateur (tiroir).
 */

export const MIN_WORDS = 300;
export const MIN_DOMAINS = 3;
export const MIN_SHARE = 0.35;
export const MAX_TERMS = 60;
export const EXCESS_FACTOR = 1.5;
export const TARGET_MARGIN = 10;

// Mots vides du français (articles, prépositions, pronoms, auxiliaires, mots de liaison).
const STOP = new Set(
  (
    "a à au aux avec ce ces cet cette ceci cela ça celle celles celui ceux chaque comme dans de des du elle elles en entre est et été être eu fait faire il ils je la le les leur leurs lui ma mais me même mes moi mon ne ni nos notre nous on ont ou où par pas peu plus pour qu que quel quelle quelles quels qui sa sans se ses si son sont sous sur ta te tes toi ton tous tout toute toutes très tu un une vos votre vous y " +
    "afin ainsi alors aussi autre autres avant après avoir bien car certains certaines chez cependant donc dont encore également etc ici jusqu lors lorsque moins non oui parce pendant peut peuvent plusieurs puis quand selon seul seule seulement soit tant toujours trop vers via voici voilà " +
    "c d j l m n s t qu' l' d' c' n' s' j' m' t' " +
    "est sont était étaient sera seront serait avait ont a ai as avons avez fait font peut doit doivent faut "
  )
    .split(/\s+/)
    .filter(Boolean),
);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Mots en -aux / -s invariables (« taux » n'est pas le pluriel de « tau »).
const INVARIABLE = new Set(["taux", "temps", "corps", "fois", "repos", "cas", "prix", "choix", "dos", "bois", "poids", "frais", "mois", "relais", "permis", "devis", "compris", "sans", "plus", "moins", "tous", "vers", "chez", "pas", "puis", "dans", "sous", "lors", "alors", "jamais", "toujours"]);

/** Racine légère : minuscules, sans accents, pluriel retiré (« chantiers » = « chantier »). Pure. */
export function stem(word: string): string {
  let w = fold(word);
  if (INVARIABLE.has(w)) return w;
  if (w.length > 4 && w.endsWith("eaux")) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith("aux")) return `${w.slice(0, -3)}al`;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

/** `brk` : le mot ouvre une nouvelle phrase ou un nouveau segment (un terme ne la traverse pas). */
type Tok = { surface: string; stem: string; stop: boolean; brk: boolean };

/** Les mots d'un texte (les chiffres seuls et les mots d'une lettre sont ignorés). Pure. */
export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  let brk = true;
  for (const m of text.toLowerCase().matchAll(/[a-zà-öø-ÿœæ]+(?:-[a-zà-öø-ÿœæ]+)*|[.!?;:…()\[\]«»"|\n•·–—]/gi)) {
    const surface = m[0];
    if (!/[a-zà-öø-ÿœæ]/i.test(surface)) {
      brk = true;
      continue;
    }
    const f = fold(surface);
    out.push({ surface, stem: stem(surface), stop: STOP.has(surface) || STOP.has(f) || surface.length < 2, brk });
    brk = false;
  }
  return out;
}

export function wordCount(text: string): number {
  return tokenize(text).length;
}

type Count = { count: number; surfaces: Map<string, number> };

/** Occurrences des n-grammes de 1 à 3 mots, sans mot vide en début ni en fin. Pure. */
export function countTerms(text: string): Map<string, Count> {
  const toks = tokenize(text);
  const out = new Map<string, Count>();
  for (let i = 0; i < toks.length; i++) {
    for (let n = 1; n <= 3 && i + n <= toks.length; n++) {
      const g = toks.slice(i, i + n);
      if (g.slice(1).some((t) => t.brk)) break;
      if (g[0].stop || g[n - 1].stop) continue;
      if (n === 1 && g[0].stem.length < 3) continue;
      const key = g.map((t) => t.stem).join(" ");
      const surface = g.map((t) => t.surface).join(" ");
      const c: Count = out.get(key) ?? { count: 0, surfaces: new Map<string, number>() };
      c.count++;
      c.surfaces.set(surface, (c.surfaces.get(surface) ?? 0) + 1);
      out.set(key, c);
    }
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const median = (xs: number[]) => quantile([...xs].sort((a, b) => a - b), 0.5);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// ── Entités (étape 5) ────────────────────────────────────────────────────────
// Sans outil de reconnaissance d'entités côté serveur : les SIGLES (CAPEB, ETAM, IDCC, CAP…)
// et les NOMS PROPRES de plusieurs mots (« Convention collective nationale », « Code du
// travail », « France Travail ») hors début de phrase. Le seuil de 35 % des pages fait le tri.

/** Version du calcul du corpus : un changement de méthode recalcule les corpus depuis les pages gardées. */
export const CORPUS_VERSION = 5;

const NOT_ENTITY = new Set(["pdf", "faq", "ttc", "ht", "ok", "etc", "nb", "ps", "url", "www", "http", "https", "html", "seo", "le", "la", "les", "un", "une", "de", "et", "en", "au", "ce", "si", "il", "on", "nous", "vous", "je"]);
const HEADS = /^(Code|Convention|Caisse|Caisses|Chambre|Ministère|Fédération|Confédération|Direction|Institut|Conseil|Union|Agence|Haute|Organisme|Office)$/;
const LINK = new Set(["de", "du", "des", "d", "la", "le", "l", "et", "en", "à", "pour", "sur"]);

/** Les entités citées dans un texte : clé (sans accents, minuscules) → forme la plus courante. Pure (testée). */
export function extractEntities(text: string, exclude: string[] = []): Map<string, string> {
  const out = new Map<string, Map<string, number>>();
  const add = (surface: string) => {
    const key = fold(surface).replace(/\s+/g, " ").trim();
    if (!key || key.length < 2 || NOT_ENTITY.has(key) || exclude.some((x) => key === x || key.includes(x))) return;
    const m = out.get(key) ?? new Map<string, number>();
    m.set(surface, (m.get(surface) ?? 0) + 1);
    out.set(key, m);
  };
  // Sigles : 2 à 8 capitales (chiffres permis après la 1re), hors phrases entières en capitales.
  for (const line of text.split(/\n+/)) {
    const caps = line.match(/\b[A-ZÀ-Ý]{2,}\b/g) ?? [];
    const words = line.match(/\b[\p{L}]{2,}\b/gu) ?? [];
    if (words.length && caps.length / words.length > 0.5) continue;
    for (const m of line.matchAll(/\b[A-Z][A-Z0-9]{1,7}\b/g)) if (!/^[IVXLC]+$/.test(m[0])) add(m[0]);
  }
  // Noms propres de 2 mots ou plus, hors début de phrase : « Code du travail », « France Travail ».
  for (const sentence of text.split(/(?<=[.!?:;])\s+|\n+/)) {
    const toks = sentence.split(/\s+/).map((w) => w.replace(/^[«"(“]+|[»")”,.;:!?]+$/g, ""));
    for (let i = 0; i < toks.length; i++) {
      if (!/^[A-ZÀ-Ý][a-zà-ÿ]{2,}/.test(toks[i])) continue;
      // En début de phrase, la majuscule ne dit rien : il faut un 2e mot en majuscule (« France Travail »).
      if (i === 0 && (STOP.has(toks[0].toLowerCase()) || !/^[A-ZÀ-Ý]/.test(toks[1] ?? ""))) continue;
      const head = HEADS.test(toks[i]);
      const parts = [toks[i]];
      let lower = 0;
      let j = i + 1;
      while (j < toks.length && parts.length < 6) {
        const w = toks[j];
        const next = toks[j + 1] ?? "";
        if (/^[A-ZÀ-Ý][\p{L}-]+/u.test(w) || /^\d{1,4}$/.test(w)) parts.push(w);
        else if (LINK.has(w.toLowerCase()) && (/^[A-ZÀ-Ý]/.test(next) || (head && lower === 0 && /^[a-zà-ÿ]{3,}/.test(next)))) parts.push(w);
        // Après un mot d'institution, 2 noms communs au plus en font partie : « Code du travail »,
        // « Convention collective nationale » (pas la suite de la phrase).
        else if (head && lower < 2 && /^[a-zà-ÿ]{3,}$/.test(w) && !STOP.has(w)) {
          parts.push(w);
          lower++;
          if (LINK.has(parts[parts.length - 2]?.toLowerCase() ?? "")) break;
        } else break;
        j++;
      }
      while (parts.length && LINK.has(parts[parts.length - 1].toLowerCase())) parts.pop();
      if (parts.length >= 2) add(parts.join(" "));
      i = Math.max(i, j - 1);
    }
  }
  return new Map([...out.entries()].map(([k, m]) => [k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
}

/**
 * Une page parle-t-elle de la requête ? Au moins la moitié des mots porteurs de la requête
 * (racines, sans mots vides) dans son titre ou ses 300 premiers mots (19/11/2026 : des pages
 * « centimètres par heure » entraient dans le corpus de « convertir heures en centièmes »).
 * Pure (testée).
 */
export function isOnTopic(keyword: string, title: string, text: string): boolean {
  const kw = new Set(tokenize(keyword).filter((t) => !t.stop && t.stem.length >= 3).map((t) => t.stem));
  if (!kw.size) return true;
  const head = new Set(tokenize(`${title} ${text.split(/\s+/).slice(0, 300).join(" ")}`).map((t) => t.stem));
  let hit = 0;
  for (const s of kw) if (head.has(s)) hit++;
  return hit / kw.size >= 0.5;
}

export type CorpusPage = { url: string; domain: string; text: string; words?: number; h2s?: string[] };
export type CorpusTerm = { key: string; label: string; pages: number; share: number; min: number; max: number; weight: number };
export type CorpusEntity = { key: string; label: string; pages: number; share: number };
export type Corpus = {
  version?: number;
  entities?: CorpusEntity[];
  insufficient: string | null;
  pages: number;
  domains: number;
  medianWords: number | null;
  /** La fourchette de longueur du top 10 (1er et 3e quartiles des pages gardées), pour la note v3. */
  wordsMin?: number | null;
  wordsMax?: number | null;
  medianH2: number | null;
  terms: CorpusTerm[];
  questions: string[];
};

/** Le corpus des pages classées : termes recommandés et leurs fourchettes. Pure (testée). */
export function buildCorpus(pages: CorpusPage[], questions: string[] = []): Corpus {
  const valid = pages.filter((p) => (p.words ?? wordCount(p.text)) >= MIN_WORDS);
  const domains = new Set(valid.map((p) => p.domain)).size;
  const base = { pages: valid.length, domains, questions: questions.slice(0, 12) };
  if (domains < MIN_DOMAINS) return { ...base, insufficient: `Corpus insuffisant : ${domains} domaine${domains > 1 ? "s" : ""} exploitable${domains > 1 ? "s" : ""} (il en faut ${MIN_DOMAINS}).`, medianWords: null, medianH2: null, terms: [] };
  const counted = valid.map((p) => ({ words: p.words ?? wordCount(p.text), terms: countTerms(p.text) }));
  const stats = new Map<string, { per1000: number[]; surfaces: Map<string, number> }>();
  for (const page of counted) {
    for (const [key, c] of page.terms) {
      const s = stats.get(key) ?? { per1000: [] as number[], surfaces: new Map<string, number>() };
      s.per1000.push((c.count / page.words) * 1000);
      for (const [sf, n] of c.surfaces) s.surfaces.set(sf, (s.surfaces.get(sf) ?? 0) + n);
      stats.set(key, s);
    }
  }
  const minPages = Math.max(2, Math.ceil(valid.length * MIN_SHARE));
  let terms: CorpusTerm[] = [...stats.entries()]
    .filter(([, s]) => s.per1000.length >= minPages)
    .map(([key, s]) => {
      const sorted = [...s.per1000].sort((a, b) => a - b);
      const n = key.split(" ").length;
      const share = s.per1000.length / valid.length;
      const label = [...s.surfaces.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { key, label, pages: s.per1000.length, share: round(share), min: round(quantile(sorted, 0.25)), max: round(quantile(sorted, 0.75)), weight: round(share * (n === 1 ? 1 : n === 2 ? 1.25 : 1.5)) };
    });
  // Un terme court presque toujours employé DANS un plus long, aussi répandu, est redondant
  // (« supplémentaire » quand « heures supplémentaires » est dans 9 pages sur 10).
  const all = terms;
  terms = all.filter((t) => !all.some((l) => l.key !== t.key && ` ${l.key} `.includes(` ${t.key} `) && l.pages >= t.pages * 0.9));
  terms.sort((a, b) => b.weight - a.weight || b.pages - a.pages);
  terms = terms.slice(0, MAX_TERMS);
  // Entités citées par au moins 35 % des pages (2 au moins), hors noms des sites concurrents.
  const brands = [...new Set(valid.map((p) => fold(p.domain.split(".").slice(-2, -1)[0] ?? "").replace(/-/g, " ")))].filter((b) => b.length >= 4);
  const entStats = new Map<string, { pages: number; labels: Map<string, number> }>();
  for (const p of valid) {
    for (const [key, label] of extractEntities(p.text, brands)) {
      const e = entStats.get(key) ?? { pages: 0, labels: new Map<string, number>() };
      e.pages++;
      e.labels.set(label, (e.labels.get(label) ?? 0) + 1);
      entStats.set(key, e);
    }
  }
  const entities: CorpusEntity[] = [...entStats.entries()]
    .filter(([, e]) => e.pages >= minPages)
    .map(([key, e]) => ({ key, label: [...e.labels.entries()].sort((a, b) => b[1] - a[1])[0][0], pages: e.pages, share: round(e.pages / valid.length) }))
    .sort((a, b) => b.pages - a.pages)
    .slice(0, 25);
  return {
    ...base,
    version: CORPUS_VERSION,
    entities,
    insufficient: null,
    medianWords: Math.round(median(counted.map((c) => c.words))),
    wordsMin: Math.round(quantile([...counted.map((c) => c.words)].sort((a, b) => a - b), 0.25)),
    wordsMax: Math.round(quantile([...counted.map((c) => c.words)].sort((a, b) => a - b), 0.75)),
    medianH2: valid.some((p) => p.h2s) ? Math.round(median(valid.map((p) => p.h2s?.length ?? 0))) : null,
    terms,
  };
}

export type TermState = "absent" | "insuffisant" | "ok" | "exces";
export type TermResult = { key: string; label: string; count: number; minCount: number; maxCount: number; state: TermState; share: number };
export type Coverage = { score: number | null; terms: TermResult[]; entities: { label: string; share: number; present: boolean }[]; questions: { question: string; covered: boolean }[]; risk: number; riskLevel: "aucun" | "modere" | "eleve"; words: number; insufficient: string | null };

/** Le risque de sur-optimisation, à part (la couverture ne le compense pas). Pure. */
export const riskLevel = (risk: number): Coverage["riskLevel"] => (risk <= 0 ? "aucun" : risk < 1 ? "modere" : "eleve");

/** La part d'une question « Autres questions posées » traitée par le texte (titres et FAQ). Pure. */
export function questionCovered(question: string, headings: string[]): boolean {
  const q = new Set(tokenize(question).filter((t) => !t.stop).map((t) => t.stem));
  if (!q.size) return false;
  return headings.some((h) => {
    const hs = new Set(tokenize(h).filter((t) => !t.stop).map((t) => t.stem));
    let hit = 0;
    for (const s of q) if (hs.has(s)) hit++;
    return hit / q.size >= 0.6;
  });
}

/**
 * La couverture d'un texte par rapport au corpus. `headings` = H2, H3 et questions de FAQ
 * du texte (pour les questions posées). Pure (testée).
 */
export function coverage(text: string, corpus: Corpus, headings: string[] = []): Coverage {
  const words = wordCount(text);
  if (corpus.insufficient || !corpus.terms.length) return { score: null, terms: [], entities: [], questions: [], risk: 0, riskLevel: "aucun", words, insufficient: corpus.insufficient ?? "Aucun terme commun aux pages classées." };
  const counts = countTerms(text);
  let got = 0;
  let total = 0;
  let risk = 0;
  const terms: TermResult[] = corpus.terms.map((t) => {
    const count = counts.get(t.key)?.count ?? 0;
    const minCount = Math.max(1, Math.round((t.min * words) / 1000));
    const maxCount = Math.max(minCount, Math.round((t.max * words) / 1000));
    const state: TermState = count === 0 ? "absent" : count < minCount ? "insuffisant" : count > Math.max(maxCount * EXCESS_FACTOR, maxCount + 2) ? "exces" : "ok";
    const value = state === "ok" ? 1 : state === "insuffisant" ? 0.5 : state === "exces" ? -0.5 : 0;
    if (state === "exces") risk += t.weight;
    got += value * t.weight;
    total += t.weight;
    return { key: t.key, label: t.label, count, minCount, maxCount, state, share: t.share };
  });
  const questions = corpus.questions.map((q) => ({ question: q, covered: questionCovered(q, headings) }));
  const folded = ` ${fold(text).replace(/[^a-z0-9]+/g, " ")} `;
  const entities = (corpus.entities ?? []).map((e) => ({ label: e.label, share: e.share, present: folded.includes(` ${e.key.replace(/[^a-z0-9]+/g, " ").trim()} `) }));
  // 60 % termes, 25 % entités, 15 % questions ; une partie absente du corpus est retirée du calcul.
  const parts: [number, number][] = [[0.6, total ? Math.max(0, got) / total : 0]];
  if (entities.length) parts.push([0.25, entities.filter((e) => e.present).length / entities.length]);
  if (questions.length) parts.push([0.15, questions.filter((q) => q.covered).length / questions.length]);
  const weight = parts.reduce((a, [w]) => a + w, 0);
  const score = parts.reduce((a, [w, v]) => a + w * v, 0) / weight;
  const r = Math.round(risk * 10) / 10;
  return { score: Math.round(score * 100), terms, entities, questions, risk: r, riskLevel: riskLevel(r), words, insufficient: null };
}

/** La cible : la médiane des concurrents + 10 points (jamais 100 : sur-optimisation). Pure. */
export function coverageTarget(competitorScores: number[]): number | null {
  if (!competitorScores.length) return null;
  return Math.min(95, Math.round(median(competitorScores)) + TARGET_MARGIN);
}

/** La note de chaque concurrent, calculée SANS sa propre page dans le corpus quand c'est possible (repère honnête). Pure. */
export function competitorScores(pages: CorpusPage[], questions: string[] = []): (number | null)[] {
  return pages.map((p, i) => {
    if ((p.words ?? wordCount(p.text)) < MIN_WORDS) return null;
    // Sans sa propre page ; si le corpus restant tombe sous 3 domaines, sur le corpus complet.
    const others = buildCorpus(
      pages.filter((_, j) => j !== i),
      questions,
    );
    return coverage(p.text, others.insufficient ? buildCorpus(pages, questions) : others, p.h2s ?? []).score;
  });
}

// ── Ressemblance avec un concurrent (étape 5) ────────────────────────────────

/** Seuils de ressemblance (part des suites de 5 mots de NOTRE texte présentes chez UN concurrent). */
export const COPY_WARN = 0.08;
export const COPY_BLOCK = 0.15;

/** Les suites de 5 mots d'un texte, en empreintes (32 bits). Pure (testée). */
export function shingles(text: string): Set<number> {
  const words = fold(text).match(/[a-z0-9]+/g) ?? [];
  const out = new Set<number>();
  for (let i = 0; i + 5 <= words.length; i++) {
    let h = 2166136261;
    for (const ch of words.slice(i, i + 5).join(" ")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    out.add(h >>> 0);
  }
  return out;
}

/** La part de notre texte reprise d'une page (0 à 1). Pure (testée). */
export function copyRatio(ours: Set<number>, theirs: Set<number>): number {
  if (ours.size < 20) return 0;
  let common = 0;
  for (const h of ours) if (theirs.has(h)) common++;
  return common / ours.size;
}
