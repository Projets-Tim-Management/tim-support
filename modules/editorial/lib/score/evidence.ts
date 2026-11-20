import type { Payload } from "payload";

import { analysisKeyword, keywordKey } from "@/modules/editorial/lib/competitors/content";

/**
 * LA BOUCLE DE MESURE (étape 6 du module de note, 19/11/2026) : chaque critère des règles
 * croisé avec ce que le site observe, pour la revue mensuelle de Sergey.
 *
 * Pour chaque critère : les contenus en ligne qui le RESPECTENT contre ceux qui ne le
 * respectent PAS — clics Google des 28 derniers jours, position moyenne (Search Console),
 * visites venues d'une IA (GA4), citation dans la réponse IA de Google (DataForSEO).
 * Médianes, effectifs, et un verdict prudent :
 *  - moins de 8 contenus d'un côté : « trop peu pour comparer » ;
 *  - un écart du simple au double sur les clics (et d'au moins 5 clics), confirmé par la position : « écart
 *    grossier », qui justifie au mieux un TEST sur quelques articles (avant / après) ;
 *  - sinon : « pas d'écart net ».
 * Jamais de conclusion causale : ~130 contenus, des sujets et des âges différents.
 * La note par quartile et les variations de note dues à une nouvelle version des règles
 * complètent le tableau. Aucun appel extérieur.
 */

type Raw = Record<string, unknown>;
type Crit = { id: string; jauge: string; libelle: string; poids: number; preuve: string; statut: string; resultat: number | null };

export const MIN_GROUP = 8;
export const MIN_CLICK_GAP = 5;

export type Outcome = { clicks28: number; position: number | null; aiSessions: number; aiShown: boolean | null; aiCited: boolean | null };
export type ContentRow = { title: string; kind: "article" | "fiche"; seo: number | null; geo: number | null; coverage: number | null; criteria: Crit[]; outcome: Outcome };

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

function groupStats(rows: ContentRow[]) {
  const shown = rows.filter((r) => r.outcome.aiShown);
  return {
    contenus: rows.length,
    clics28jMedian: r1(median(rows.map((r) => r.outcome.clicks28))),
    positionMediane: r1(median(rows.map((r) => r.outcome.position).filter((x): x is number => x != null))),
    visitesIAMoyenne: rows.length ? r1(rows.reduce((a, r) => a + r.outcome.aiSessions, 0) / rows.length) : null,
    citeDansLaReponseIAdeGoogle: shown.length ? `${shown.filter((r) => r.outcome.aiCited).length}/${shown.length}` : "pas de réponse IA relevée",
  };
}

/** Le verdict prudent d'une comparaison. Pure (testée). */
export function verdictOf(a: ReturnType<typeof groupStats>, b: ReturnType<typeof groupStats>): string {
  if (a.contenus < MIN_GROUP || b.contenus < MIN_GROUP) return `trop peu de contenus pour comparer (${a.contenus} contre ${b.contenus} ; il en faut ${MIN_GROUP} de chaque côté)`;
  const ca = a.clics28jMedian ?? 0;
  const cb = b.clics28jMedian ?? 0;
  const pa = a.positionMediane;
  const pb = b.positionMediane;
  const better = (ca + 1) / (cb + 1);
  // Sur quelques clics, un « double » ne veut rien dire (2 contre 0) : il faut aussi 5 clics d'écart.
  if (Math.abs(ca - cb) < MIN_CLICK_GAP) return `pas d'écart net (médianes de ${ca} et ${cb} clics sur 28 jours : trop faibles pour lire quoi que ce soit)`;
  const posAgrees = (dir: 1 | -1) => pa == null || pb == null || (dir === 1 ? pa < pb : pa > pb);
  if (better >= 2 && posAgrees(1)) return "écart grossier EN FAVEUR du critère (corrélation, pas une preuve : à confirmer par un test avant / après)";
  if (better <= 0.5 && posAgrees(-1)) return "écart grossier CONTRE le critère (corrélation, pas une preuve : justifie de tester une variante sur quelques articles)";
  return "pas d'écart net";
}

/** Le tableau par critère. Pure (testée). */
export function criteriaEvidence(rows: ContentRow[]) {
  const ids = [...new Map(rows.flatMap((r) => r.criteria).map((c) => [c.id, c])).values()];
  return ids.map((c) => {
    const yes = rows.filter((r) => r.criteria.find((x) => x.id === c.id && x.resultat != null && x.resultat >= 1));
    const no = rows.filter((r) => r.criteria.find((x) => x.id === c.id && x.resultat != null && x.resultat < 1));
    const a = groupStats(yes);
    const b = groupStats(no);
    return { id: c.id, critere: c.libelle, jauge: c.jauge, poids: c.statut === "info" ? 0 : c.poids, niveauDePreuve: c.preuve, respecte: a, nonRespecte: b, verdict: verdictOf(a, b) };
  });
}

/** La note par quartile : les contenus les mieux notés font-ils mieux ? Pure. */
export function quartiles(rows: ContentRow[], key: "seo" | "geo" | "coverage") {
  const s = rows.filter((r) => r[key] != null).sort((a, b) => Number(a[key]) - Number(b[key]));
  if (s.length < 4 * MIN_GROUP) return `trop peu de contenus notés (${s.length})`;
  const q = Math.ceil(s.length / 4);
  return [0, 1, 2, 3].map((i) => {
    const part = s.slice(i * q, (i + 1) * q);
    return { quartile: i + 1, note: `${part[0][key]} à ${part[part.length - 1][key]} %`, ...groupStats(part) };
  });
}

/** Le tableau complet pour la revue de Sergey (et l'écran de la direction). */
export async function loadRuleEvidence(payload: Payload) {
  const [articles, jobs, kws] = await Promise.all([
    payload.find({ collection: "articles" as never, where: { status: { in: ["publie", "a-rafraichir"] } }, pagination: false, depth: 0, overrideAccess: true, select: { title: true, keyword: true, wpFocusKeyword: true, scoreSeo: true, scoreGeo: true, scoreCoverage: true, scoreDetail: true, gscClicks28: true, gscPosition: true, ga4AiSessions: true } as never }),
    payload.find({ collection: "job-sheets" as never, where: { wpId: { greater_than: 0 } }, pagination: false, depth: 0, overrideAccess: true, select: { title: true, scoreSeo: true, scoreGeo: true, scoreCoverage: true, scoreDetail: true, gscClicks28: true, gscPosition: true, ga4AiSessions: true } as never }),
    payload.find({ collection: "seo-keywords" as never, where: { checkedAt: { exists: true } }, pagination: false, depth: 0, overrideAccess: true, select: { keywordKey: true, aiOverview: true, aiCited: true } as never }).catch(() => ({ docs: [] })),
  ]);
  const ai = new Map((kws.docs as unknown as Raw[]).map((k) => [String(k.keywordKey), k]));
  const toRow = (d: Raw, kind: "article" | "fiche"): ContentRow => {
    const k = ai.get(keywordKey(analysisKeyword(kind === "article" ? "articles" : "job-sheets", d)));
    return {
      title: String(d.title ?? ""),
      kind,
      seo: (d.scoreSeo as number) ?? null,
      geo: (d.scoreGeo as number) ?? null,
      coverage: (d.scoreCoverage as number) ?? null,
      criteria: ((d.scoreDetail as { criteres?: Crit[] } | null)?.criteres ?? []) as Crit[],
      outcome: { clicks28: Number(d.gscClicks28 ?? 0), position: d.gscPosition == null ? null : Number(d.gscPosition), aiSessions: Number(d.ga4AiSessions ?? 0), aiShown: k ? Boolean(k.aiOverview) : null, aiCited: k ? Boolean(k.aiCited) : null },
    };
  };
  const rows = [...(articles.docs as unknown as Raw[]).map((d) => toRow(d, "article")), ...(jobs.docs as unknown as Raw[]).map((d) => toRow(d, "fiche"))];
  const arts = rows.filter((r) => r.kind === "article");
  const byCrit = criteriaEvidence(arts);
  const changes = [...(articles.docs as unknown as Raw[]), ...(jobs.docs as unknown as Raw[])]
    .map((d) => ({ d, p: (d.scoreDetail as { precedent?: { version: number; seo: number | null; geo: number | null } } | null)?.precedent }))
    .filter((x) => x.p && (x.p.seo !== x.d.scoreSeo || x.p.geo !== x.d.scoreGeo))
    .slice(0, 20)
    .map(({ d, p }) => ({ contenu: d.title, avant: `SEO ${p?.seo ?? "—"} / GEO ${p?.geo ?? "—"} (règles v${p?.version})`, apres: `SEO ${d.scoreSeo ?? "—"} / GEO ${d.scoreGeo ?? "—"}` }));
  return {
    avertissement: `Corrélations sur ${arts.length} articles en ligne (et ${rows.length - arts.length} fiches à part) : aucune conclusion causale. Les sujets, l'âge et l'autorité des pages diffèrent. Au mieux, un écart grossier justifie de TESTER une variante sur quelques articles et de comparer avant / après sur plusieurs semaines. Les citations IA viennent de la réponse IA de Google sur les requêtes suivies ; les citations Copilot (Bing) n'ont pas encore d'API.`,
    articles: arts.length,
    fiches: rows.length - arts.length,
    parCritere: byCrit,
    focusFaqEtH2EnQuestion: byCrit.filter((c) => c.id === "GEO-09" || c.id === "GEO-10"),
    noteParQuartile: { seo: quartiles(arts, "seo"), geo: quartiles(arts, "geo"), couvertureConcurrents: quartiles(arts, "coverage") },
    variationsDuesAuxRegles: changes,
  };
}
