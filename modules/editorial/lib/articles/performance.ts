/**
 * LE DIAGNOSTIC DE PERFORMANCE D'UN ARTICLE (décision du 19/11/2026).
 *
 * Chaque lundi, les chiffres de chaque article sont relevés (Search Console, GA4). Ce module en
 * tire un VERDICT factuel — pas un avis d'IA — avec le POURQUOI et QUOI AMÉLIORER :
 *
 *  - en observation : publié depuis moins de 4 semaines, ou chiffres pas encore relevés ;
 *  - à améliorer :
 *      · Google ne le montre presque pas (moins de 30 impressions par mois) → indexation, mot-clé ;
 *      · clics en baisse de plus de 30 % sur 28 jours → concurrent ou article qui vieillit ;
 *      · au-delà de la 20ᵉ place → contenu en dessous du top 10 ;
 *  - moyen :
 *      · 4ᵉ à 20ᵉ place, peu cliqué pour sa position → titre et description Google ;
 *      · 11ᵉ à 20ᵉ place (page 2) → compléter le contenu, liens internes ;
 *      · 4ᵉ à 10ᵉ place, bien cliqué → proche du top 3 ;
 *      · top 3 mais peu cliqué → la réponse IA de Google prend les clics (GEO) ;
 *  - performe : top 3 bien cliqué, ou au moins 50 clics sur les 28 derniers jours.
 *
 * « Peu cliqué » = moins de la moitié du taux de clic habituel à cette position (courbe moyenne
 * des études de taux de clic, ordre de grandeur, pas une vérité). Calculé à la lecture : aucun
 * stockage, toujours à jour des derniers chiffres. Pur (testé).
 */

/**
 * Ce que DataForSEO a relevé sur la requête de l'article (Éditorial › Requêtes suivies), sans
 * coût en plus : volume de recherche, notre position sur la requête EXACTE, la réponse IA de
 * Google (affichée ? sommes-nous cités ? qui l'est ?), le top 3.
 */
export type SerpContext = {
  keyword?: string | null;
  volume?: number | null;
  position?: number | null;
  checkedAt?: string | null;
  aiOverview?: boolean | null;
  aiCited?: boolean | null;
  aiDomains?: string[];
  top3?: { domaine: string; titre?: string }[];
};

import { tokenize } from "@/modules/editorial/lib/competitors/terms";

/**
 * Le mot-clé de l'article correspond-il à son sujet ? Moins de la moitié de ses mots porteurs
 * dans le titre = mot-clé hors sujet (souvent un mot-clé de thématique repris de WordPress,
 * « paie btp » sur un article « Repos compensateur »). Pur.
 */
// Mots du secteur présents partout : ils ne disent pas de quoi parle l'article.
const GENERIC = new Set(tokenize("btp chantier chantiers batiment bâtiment travaux public publics ouvrier ouvriers entreprise entreprises 2025 2026 2027").map((t) => t.stem));

type GscQuery = { requete: string; impressions: number; clics?: number; position?: number };

/**
 * Le mot-clé à proposer : parmi les requêtes Search Console de la page (relevées chaque lundi),
 * la plus vue qui parle du sujet (au moins un mot porteur du titre). Null sans données. Pur.
 */
export function suggestKeyword(queries: unknown, title: unknown): string | null {
  if (!Array.isArray(queries)) return null;
  const head = new Set(tokenize(String(title ?? "")).filter((t) => !t.stop && t.stem.length >= 3 && !GENERIC.has(t.stem)).map((t) => t.stem));
  const best = (queries as GscQuery[])
    .filter((q) => q?.requete && !/tim\s*management/i.test(q.requete) && tokenize(q.requete).some((t) => head.has(t.stem)))
    .sort((a, b) => b.impressions - a.impressions)[0];
  return best?.requete ?? null;
}

export function keywordOffTopic(keyword: unknown, title: unknown): boolean {
  const kw = [...new Set(tokenize(String(keyword ?? "")).filter((t) => !t.stop && t.stem.length >= 3 && !GENERIC.has(t.stem)).map((t) => t.stem))];
  if (kw.length === 0) return false;
  const head = new Set(tokenize(String(title ?? "")).map((t) => t.stem));
  return kw.filter((k) => head.has(k)).length / kw.length < 0.5;
}

export type PerfVerdict = "hors-ligne" | "observation" | "performe" | "moyen" | "a-ameliorer";
export type PerfReason = "baisse" | "position" | "format" | "autre";

export type Diagnosis = {
  verdict: PerfVerdict;
  label: string;
  /** Pourquoi, en une phrase avec les chiffres. */
  why: string;
  /** Quoi faire. */
  action: string;
  /** Le mot-clé proposé (requête Search Console), quand celui de la fiche est hors sujet. */
  suggestedKeyword?: string | null;
  /** La raison de mise à jour correspondante (Paige), quand une mise à jour est la réponse. */
  refreshReason?: PerfReason;
  facts: { ageDays: number | null; impressionsPerMonth: number | null; ctr: number | null; expectedCtr: number | null; position: number | null; clicks28: number | null; clicks28Prev: number | null; aiVisits: number | null; volume?: number | null; exactPosition?: number | null; aiOverview?: boolean | null; aiCited?: boolean | null };
};

export const PERF_LABEL: Record<PerfVerdict, string> = {
  "hors-ligne": "Pas en ligne",
  observation: "En observation",
  performe: "Performe",
  moyen: "Moyen",
  "a-ameliorer": "À améliorer",
};

const DAY = 86_400_000;
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0).replace(".", ",")} %`;

/** Taux de clic habituel à une position (ordre de grandeur). Pur. */
export function expectedCtr(position: number): number {
  if (position <= 1.5) return 0.25;
  if (position <= 2.5) return 0.15;
  if (position <= 3.5) return 0.1;
  if (position <= 5.5) return 0.06;
  if (position <= 10.5) return 0.03;
  if (position <= 20.5) return 0.012;
  return 0.005;
}

export function diagnose(a: Record<string, unknown>, now = new Date(), serp?: SerpContext | null): Diagnosis {
  const published = a.publishedAt ? Date.parse(String(a.publishedAt)) : NaN;
  const online = a.status === "publie" || a.status === "a-rafraichir";
  const ageDays = Number.isFinite(published) ? Math.floor((now.getTime() - published) / DAY) : null;
  const clicks = num(a.gscClicks);
  const impressions = num(a.gscImpressions);
  const position = num(a.gscPosition);
  const clicks28 = num(a.gscClicks28);
  const clicks28Prev = num(a.gscClicks28Prev);
  const aiVisits = num(a.ga4AiSessions);
  const months = ageDays != null ? Math.max(1, Math.min(16, ageDays / 30)) : null;
  const impressionsPerMonth = impressions != null && months ? Math.round(impressions / months) : null;
  const ctr = clicks != null && impressions ? clicks / impressions : null;
  const exp = position != null ? expectedCtr(position) : null;
  const facts = { ageDays, impressionsPerMonth, ctr, expectedCtr: exp, position, clicks28, clicks28Prev, aiVisits, volume: serp?.volume ?? null, exactPosition: serp?.checkedAt ? (serp.position ?? null) : null, aiOverview: serp?.checkedAt ? (serp.aiOverview ?? null) : null, aiCited: serp?.checkedAt ? (serp.aiCited ?? null) : null };
  const out = (verdict: PerfVerdict, why: string, action: string, refreshReason?: PerfReason): Diagnosis => ({ verdict, label: PERF_LABEL[verdict], why: why.charAt(0).toUpperCase() + why.slice(1), action, ...(refreshReason ? { refreshReason } : {}), facts });
  // Les verdicts sur un article en ligne jugé : le défaut de mot-clé passe en premier.
  const judged = (verdict: PerfVerdict, why: string, action: string, refreshReason?: PerfReason): Diagnosis => ({ ...out(verdict, `${why}${offTxt}${queriesTxt}`, `${offAction.trim()}${offAction ? " Puis : " : ""}${offAction ? action.charAt(0).toLowerCase() + action.slice(1) : action}`, refreshReason), ...(offTopic ? { suggestedKeyword: suggested } : {}) });
  const ai = aiVisits && aiVisits >= 5 ? ` ${aiVisits} visites viennent d'une IA (ChatGPT, Perplexity…).` : "";
  // DataForSEO (requête exacte), quand elle a été relevée.
  const vol = serp?.volume ?? null;
  const volTxt = vol != null ? ` La requête « ${serp?.keyword ?? a.keyword} » : ${vol.toLocaleString("fr-FR")} recherches par mois.` : "";
  const checked = Boolean(serp?.checkedAt);
  const exactTxt = checked ? (serp?.position != null ? ` Sur la requête exacte, nous sommes ${serp.position}ᵉ (DataForSEO).` : " Sur la requête exacte, nous ne sommes pas dans le top 20 (DataForSEO).") : "";
  const top3Txt = checked && serp?.top3?.length ? ` Le top 3 : ${serp.top3.map((t) => t.domaine).join(", ")}.` : "";
  const aiTxt = checked && serp?.aiOverview ? (serp.aiCited ? " La réponse IA de Google nous cite." : ` La réponse IA de Google s'affiche et cite ${serp.aiDomains?.length ? serp.aiDomains.slice(0, 3).join(", ") : "d'autres sites"}, pas nous.`) : "";
  const cov = num(a.scoreCoverage);
  const covTarget = num(a.coverageTarget);
  const covTxt = cov != null && covTarget != null && cov < covTarget ? ` Couverture face au top 10 : ${cov} % pour une cible de ${covTarget} %.` : "";
  const geoGap = checked && serp?.aiOverview && !serp.aiCited ? " Et viser une citation dans la réponse IA de Google : réponse directe en tête, chiffres sourcés, FAQ en questions." : "";
  const unchecked = !checked && vol == null ? " (Requête pas encore relevée par DataForSEO : verdict d'après la Search Console seule.)" : "";
  // Mot-clé hors sujet : les chiffres DataForSEO portent sur une autre requête que celle de l'article.
  const offTopic = keywordOffTopic(a.keyword ?? a.wpFocusKeyword, a.title);
  const offTxt = offTopic ? ` Attention : le mot-clé de la fiche (« ${String(a.keyword ?? a.wpFocusKeyword)} ») ne correspond pas au sujet de l'article ; Google et les IA le classent sur d'autres requêtes.` : "";
  const suggested = suggestKeyword(a.gscQueries, a.title);
  const offAction = offTopic
    ? suggested
      ? ` D'abord : prendre « ${suggested} » comme mot-clé (la requête Google qui amène le plus cette page sur son sujet) et le mettre dans le titre SEO, la description et l'introduction.`
      : " D'abord : choisir le vrai mot-clé de l'article (la requête principale que les gens tapent pour ce sujet) et le mettre dans le titre SEO, la description et l'introduction."
    : "";
  // Les requêtes réelles de la page (Search Console, 90 jours).
  const qs = Array.isArray(a.gscQueries) ? (a.gscQueries as GscQuery[]).slice(0, 3) : [];
  const queriesTxt = qs.length ? ` Requêtes qui amènent la page : ${qs.map((q) => `« ${q.requete} » (${q.impressions} impr.)`).join(", ")}.` : "";
  const posTxt = position != null ? `position moyenne ${position.toFixed(1).replace(".", ",")}` : "";

  if (!online || ageDays == null) return out("hors-ligne", "Pas encore en ligne.", "—");
  if (ageDays < 28) return out("observation", `Publié il y a ${ageDays} jour${ageDays > 1 ? "s" : ""} : trop tôt pour juger (Google met plusieurs semaines à classer une page).`, "Rien : premier verdict à 4 semaines.");
  if (impressions == null) return out("observation", "Chiffres Google pas encore relevés (relevé chaque lundi).", "Rien : verdict au prochain relevé.");

  // 1. Google ne le montre presque pas.
  if ((impressionsPerMonth ?? 0) < 30) {
    if (vol != null && vol < 50)
      return judged("a-ameliorer", `Google ne le montre presque pas (${impressionsPerMonth ?? 0} impressions par mois) parce que le mot-clé n'est presque pas recherché.${volTxt}${ai}`, "Recentrer l'article sur une requête que les gens tapent vraiment (onglet Requêtes suivies : volumes) : changer le mot-clé, le titre, la description et les intertitres en conséquence.", "position");
    if (vol != null)
      return judged("a-ameliorer", `Le mot-clé est recherché mais Google ne nous montre presque pas (${impressionsPerMonth ?? 0} impressions par mois).${volTxt}${exactTxt}${top3Txt}${covTxt}${ai}`, "Vérifier dans la Search Console que la page est indexée ; si elle l'est, le contenu ne suffit pas face au top 3 : compléter les termes, questions et organismes qui manquent (onglets du tiroir) et ajouter des liens internes.", "position");
    return judged("a-ameliorer", `Google ne le montre presque pas : ${impressionsPerMonth ?? 0} impressions par mois.${ai}${unchecked}`, "Vérifier dans la Search Console que la page est indexée ; sinon le mot-clé n'est presque pas recherché : le recentrer sur une requête que les gens tapent (onglet Requêtes suivies).", "position");
  }

  // 2. Clics en baisse.
  if (clicks28 != null && clicks28Prev != null && clicks28Prev >= 10 && clicks28 < clicks28Prev * 0.7)
    return judged("a-ameliorer", `Clics en baisse : ${clicks28} sur les 28 derniers jours contre ${clicks28Prev} les 28 jours d'avant (${Math.round((1 - clicks28 / clicks28Prev) * 100)} % de moins).${exactTxt}${top3Txt}${aiTxt}${ai}`, `Mettre à jour : regarder dans l'onglet Concurrents qui est passé devant, rafraîchir les chiffres et les dates, compléter ce qui manque.${geoGap}`, "baisse");

  // 3. Trop loin dans les résultats.
  if (position != null && position > 20)
    return judged("a-ameliorer", `Montré par Google mais loin : ${posTxt} (au-delà de la 2ᵉ page).${volTxt}${exactTxt}${top3Txt}${covTxt}${ai}`, `Le contenu est en dessous du top 10 : compléter les termes, questions et organismes qui manquent (onglets Mots-clés, Questions, Entités) et ajouter des liens internes depuis des articles proches.${geoGap}`, "position");

  const lowCtr = ctr != null && exp != null && ctr < exp * 0.5;
  if (position != null && position <= 3.5) {
    if (lowCtr) {
      const base = `Dans le top 3 (${posTxt}) mais peu cliqué : ${pct(ctr ?? 0)} de clics pour ${pct(exp ?? 0)} habituellement à cette place.`;
      if (checked && serp?.aiOverview === false)
        return judged("moyen", `${base} Pas de réponse IA sur cette requête : c'est donc le titre et la description qui n'attirent pas.${volTxt}${ai}`, "Réécrire le titre et la description Google (bouton « Modifier » de l'aperçu Google) : la promesse concrète, le mot-clé au début, l'année si le sujet bouge.", "autre");
      return judged("moyen", `${base}${checked ? aiTxt : " La réponse IA de Google ou un encadré prend probablement les clics."}${volTxt}${ai}`, "Renforcer le GEO pour être cité dans la réponse IA : réponse directe en tête, FAQ en questions, sources officielles précises.", "format");
    }
    return judged("performe", `Top 3 (${posTxt}), ${pct(ctr ?? 0)} de clics${clicks28 != null ? `, ${clicks28} clics sur 28 jours` : ""}.${volTxt}${aiTxt}${ai}`, `Rien d'urgent : garder les chiffres à jour.${geoGap}`);
  }
  if (clicks28 != null && clicks28 >= 50) return judged("performe", `${clicks28} clics Google sur les 28 derniers jours (${posTxt}).${volTxt}${exactTxt}${top3Txt}${aiTxt}${ai}`, `Rien d'urgent : garder les chiffres à jour ; viser le top 3 en complétant le contenu.${geoGap}`);
  if (lowCtr)
    return judged("moyen", `${posTxt} mais peu cliqué : ${pct(ctr ?? 0)} de clics pour ${pct(exp ?? 0)} habituellement à cette place.${volTxt}${aiTxt}${ai}`, "Réécrire le titre et la description Google (bouton « Modifier » de l'aperçu Google) : la promesse concrète, le mot-clé au début, l'année si le sujet bouge.", "autre");
  if (position != null && position > 10.5)
    return judged("moyen", `En 2ᵉ page de Google (${posTxt}) : presque personne ne va la voir.${volTxt}${exactTxt}${top3Txt}${covTxt}${ai}`, `Compléter le contenu face au top 10 (onglets Mots-clés, Questions, Entités) et ajouter des liens internes depuis des articles proches.${geoGap}`, "position");
  return judged("moyen", `Proche du top 3 (${posTxt}), ${pct(ctr ?? 0)} de clics.${volTxt}${exactTxt}${top3Txt}${covTxt}${aiTxt}${ai}`, `Pour gagner les dernières places : compléter ce que couvrent les 3 premiers, ajouter une FAQ, des liens internes.${geoGap}`, "position");
}

type KwDoc = { keyword?: string; keywordKey?: string; volume?: number | null; position?: number | null; checkedAt?: string | null; aiOverview?: boolean | null; aiCited?: boolean | null; aiSources?: { domain?: string }[] | null; top10?: { rang?: number; domaine?: string; titre?: string }[] | null };

/** Le contexte DataForSEO d'une requête suivie (document `seo-keywords`). Pur. */
export function serpContextOf(k: KwDoc | null | undefined): SerpContext | null {
  if (!k) return null;
  return {
    keyword: k.keyword ?? null,
    volume: k.volume ?? null,
    position: k.position ?? null,
    checkedAt: k.checkedAt ?? null,
    aiOverview: k.aiOverview ?? null,
    aiCited: k.aiCited ?? null,
    aiDomains: [...new Set((k.aiSources ?? []).map((x) => String(x?.domain ?? "")).filter(Boolean))],
    top3: (k.top10 ?? []).slice(0, 3).map((t) => ({ domaine: String(t.domaine ?? ""), titre: t.titre })),
  };
}
