/**
 * CONTRÔLE DE CANNIBALISATION — obligatoire avant toute idée d'article
 * (décision de Charlie, 18/11/2026 : « je préfère qu'on mette à jour un article
 * plutôt qu'on crée un doublon »).
 *
 * Repris du pipeline Python (validation.py, `topic_tokens` et `_overlaps`) :
 * on garde les mots porteurs d'un sujet (sans accents, sans mots vides, sans
 * les mots que partage tout le site comme « BTP » ou « chantier », au
 * singulier), et deux sujets se recouvrent s'ils ont au moins 2 mots porteurs
 * en commun, et au moins les 2/3 des mots du plus court — ou s'ils ont
 * exactement les mêmes mots porteurs (un seul mot chacun compris).
 *
 * Pur (testé).
 */

const STOPWORDS = new Set(
  "les des une un le la du de d l et ou en au aux a pour par sur sous avec sans dans que qui quoi quel quelle quels quelles comment combien pourquoi est sont ce ces cet cette son sa ses leur leurs vos votre nos notre mon ma mes ton ta tes il elle ils elles on se ne pas plus moins tout tous toute toutes faut faire fait etre avoir peut doit entre vers chez apres avant pendant depuis selon contre comme mais donc car si quand ainsi aussi tres bien bon bonne quoi lequel laquelle lesquels dont ni y".split(
    " ",
  ),
);

/**
 * Mots communs à TOUT le site : ils ne distinguent pas un sujet d'un autre.
 * Volontairement court (plus court que celui du pipeline Python, qui écartait
 * aussi « pointage », « feuille », « heure ») : en cas de doute, mieux vaut
 * reconnaître un doublon et proposer une reprise que publier deux articles
 * sur le même sujet.
 */
const SITE_GENERIC = new Set(["btp", "batiment", "chantier", "guide", "regle", "meilleur", "top", "tim", "management", "entreprise", "complet", "pratique", "modele", "exemple", "gratuit", "gratuitement"]);

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Les mots porteurs d'un sujet. `generic: false` écarte aussi les mots communs à tout le site. */
export function topicTokens(text: string, generic = false): Set<string> {
  const out = new Set<string>();
  for (const raw of norm(text).match(/[a-z0-9]+/g) ?? []) {
    let w = raw;
    if (w.length >= 4 && /[sx]$/.test(w)) w = w.slice(0, -1);
    // Mots vides et mots communs au site : reconnus AVANT la racine (« chantier », pas « chanti »).
    if (w.length < 3 || STOPWORDS.has(w) || /^20\d\d$/.test(w)) continue;
    if (!generic && SITE_GENERIC.has(w)) continue;
    // Racine légère, appliquée des deux côtés : « calculer », « calcule » → « calcul » ;
    // « mensuelle » → « mensuell ». Assez pour rapprocher un verbe de son nom.
    if (w.length >= 7 && /er$/.test(w)) w = w.slice(0, -2);
    else if (w.length >= 6 && /e$/.test(w)) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

/** Deux ensembles de mots porteurs se recouvrent-ils ? Au moins 2 mots communs, et au moins 2/3 du plus court. */
export function overlaps(a: Set<string>, b: Set<string>): boolean {
  if (a.size && a.size === b.size && [...a].every((w) => b.has(w))) return true;
  if (a.size < 2 || b.size < 2) return false;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common >= 2 && common * 3 >= 2 * Math.min(a.size, b.size);
}

export type BoardEntry = { id: number | string; title?: string | null; keyword?: string | null; wpFocusKeyword?: string | null; slug?: string | null; status?: string | null; gscClicks?: number | null };

const keyOf = (s: string) => [...topicTokens(s)].sort().join(" ");

/**
 * Les mots-clés qui ne DISTINGUENT pas un article : partagés par plusieurs
 * articles du tableau (le 18/11/2026, 7 articles avaient « Feuilles d'heures »
 * pour mot-clé Yoast — une catégorie plus qu'un mot-clé).
 */
function sharedKeywords(board: BoardEntry[]): Set<string> {
  const count = new Map<string, number>();
  for (const a of board) {
    for (const k of new Set([a.keyword, a.wpFocusKeyword].filter((s): s is string => Boolean(s && s.trim())).map(keyOf))) {
      if (k) count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  return new Set([...count].filter(([, n]) => n >= 2).map(([k]) => k));
}

/** Les sujets d'un article du tableau : son titre, son slug, et son mot-clé s'il lui est propre. */
const subjectsOf = (a: BoardEntry, shared: Set<string>) =>
  [...[a.keyword, a.wpFocusKeyword].filter((s): s is string => Boolean(s && s.trim()) && !shared.has(keyOf(s as string))), a.title, a.slug?.replace(/-/g, " ")].filter((s): s is string => Boolean(s && s.trim()));

/** Proximité de deux sujets : part des mots du plus court que l'autre contient (0 si pas de recouvrement). */
function closeness(a: Set<string>, b: Set<string>): number {
  if (!overlaps(a, b)) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / Math.min(a.size, b.size) + common / 100;
}

const ONLINE = new Set(["publie", "a-rafraichir"]);

/**
 * L'article du tableau dont le sujet est le PLUS PROCHE de celui d'une idée
 * (mot-clé ou titre), ou null. À égalité, un article en ligne passe devant,
 * puis celui qui a le plus de clics Google (celui que Google associe déjà au
 * sujet) : c'est lui qu'on reprend. Les idées arrêtées ne comptent pas, sauf
 * `includeStopped` (pour vérifier qu'une idée arrêtée ne revient pas).
 */
export function findCannibal(idea: { keyword?: string | null; title?: string | null }, board: BoardEntry[], o: { includeStopped?: boolean } = {}): BoardEntry | null {
  const ideaSets = [idea.keyword, idea.title].filter((s): s is string => Boolean(s && s.trim())).map((s) => topicTokens(s));
  if (!ideaSets.some((s) => s.size >= 1)) return null;
  const shared = sharedKeywords(board);
  let best: { a: BoardEntry; score: number } | null = null;
  for (const a of board) {
    if (a.status === "arretee" && !o.includeStopped) continue;
    let score = 0;
    for (const subject of subjectsOf(a, shared)) {
      const t = topicTokens(subject);
      for (const s of ideaSets) score = Math.max(score, closeness(s, t));
    }
    if (!score) continue;
    if (ONLINE.has(String(a.status))) score += 0.001;
    score += Math.min(Number(a.gscClicks) || 0, 99_999) / 1e9;
    if (!best || score > best.score) best = { a, score };
  }
  return best?.a ?? null;
}

/**
 * Deuxième contrôle, par Search Console : si une requête proche du mot-clé de
 * l'idée mène DÉJÀ à un de nos articles (au moins 20 impressions), c'est cet
 * article qu'il faut reprendre — même quand les mots diffèrent (« coefficient
 * BTP » arrive sur la grille de salaire). `rows` : lignes requête × page.
 */
export function findCannibalBySearch(
  keyword: string | null | undefined,
  rows: { keys: string[]; impressions: number }[],
  board: (BoardEntry & { path?: string | null })[],
): BoardEntry | null {
  const k = topicTokens(keyword ?? "");
  if (!k.size) return null;
  const byPath = new Map(board.filter((a) => a.path && a.status !== "arretee").map((a) => [a.path as string, a]));
  const weight = new Map<BoardEntry, number>();
  for (const r of rows) {
    if (r.impressions < 20) continue;
    const q = topicTokens(r.keys[0] ?? "");
    if (!overlaps(k, q)) continue;
    const a = byPath.get(r.keys[1] ?? "");
    if (a) weight.set(a, (weight.get(a) ?? 0) + r.impressions);
  }
  let best: BoardEntry | null = null;
  let max = 0;
  for (const [a, w] of weight) if (w > max) [best, max] = [a, w];
  return best;
}
