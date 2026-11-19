import type { Payload } from "payload";

import type { Article } from "@/modules/editorial/lib/articles/check";
import { criteriaOf, type Criterion } from "@/modules/editorial/lib/score/criteria";
import { scoreContent, type ScoreInput, type ScoreResult } from "@/modules/editorial/lib/score/measure";

/**
 * LE CALCUL DES NOTES SEO / GEO SUR TOUT LE TABLEAU (19/11/2026) : articles et
 * fiches métier, avec les critères de la VERSION EN VIGUEUR des règles. Aucun
 * appel extérieur : seulement le contenu synchronisé (ou rédigé). Relancé après
 * chaque synchronisation, à chaque nouvelle version des règles, et à la demande.
 * Une note n'est réécrite que si elle a changé.
 */

type Raw = Record<string, unknown>;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const filled = (v: unknown) => Object.keys(obj(v)).length > 0;

/** La copie ACF d'un article dans la forme des contrôles. Même règle que `wpPostToArticle`
 *  (writer/refresh.ts), recopiée ici : ce fichier est aussi chargé par le tiroir, DANS LE
 *  NAVIGATEUR, où refresh.ts (node:crypto) ne peut pas aller. */
function acfToArticle(acf: Raw, title: string): Article {
  return { title, introduction: (acf.introduction || "") as string, contenu: (acf.contenu || []) as Article["contenu"], conclusion: (acf.conclusion || "") as string, faq: (acf.faq || []) as Article["faq"], sources: (acf.sources || []) as Article["sources"] };
}

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Ce que le comparateur a enregistré sur un contenu (règles v3). Pure. */
export function coverageOfDoc(doc: Raw): ScoreInput["coverage"] {
  const status = doc.coverageStatus === "analyse" || doc.coverageStatus === "insuffisant" ? (doc.coverageStatus as "analyse" | "insuffisant") : null;
  return { status, score: num(doc.scoreCoverage), target: num(doc.coverageTarget), wordsMin: num(doc.coverageWordsMin), wordsMax: num(doc.coverageWordsMax), entities: num(doc.coverageEntities), excess: num(doc.coverageExcess) };
}

/** Un article du tableau dans la forme de la note : copie WordPress, sinon article rédigé. Pure (testée). */
export function articleScoreInput(doc: Raw, now: Date): ScoreInput {
  const fromWp = filled(doc.acf);
  const article: Article = fromWp ? acfToArticle(obj(doc.acf), String(doc.title ?? "")) : ({ ...(obj(doc.draft) as Article) } as Article);
  if (fromWp) article.methode = obj(obj(doc.acf).methode) as Article["methode"];
  const draft = obj(doc.draft);
  const updated = String(obj(doc.acf).date_mise_a_jour ?? "") || (doc.publishedAt as string) || null;
  return {
    kind: "article",
    article,
    keyword: String(doc.keyword || doc.wpFocusKeyword || ""),
    seoTitle: (fromWp ? doc.seoTitle : draft.yoast_title) as string,
    seoDescription: (fromWp ? doc.seoDescription : draft.yoast_description) as string,
    // En ligne (ou programmé dans WordPress) : ce qui manque compte comme manquant ; avant, « à venir ».
    stage: ["publie", "a-rafraichir", "programme", "depublie"].includes(String(doc.status)) ? "en-ligne" : "brouillon",
    image: doc.featuredImageUrl ? { alt: (doc.imageAlt as string) ?? null, mime: (doc.imageMime as string) ?? null, width: num(doc.imageWidth), bytes: num(doc.imageBytes), file: (doc.imageFile as string) ?? String(doc.featuredImageUrl) } : null,
    slug: (doc.slug as string) || null,
    coverage: coverageOfDoc(doc),
    updatedOn: updated && /^\d{8}$/.test(updated) ? `${updated.slice(0, 4)}-${updated.slice(4, 6)}-${updated.slice(6, 8)}` : updated,
    now,
  };
}

/** Une fiche métier dans la forme de la note. Pure (testée). */
export function jobScoreInput(doc: Raw, now: Date): ScoreInput {
  const acf = obj(doc.acf);
  const list = (v: unknown) => (Array.isArray(v) ? (v as Raw[]).map((x) => String(x?.valeur ?? "")).filter(Boolean) : []);
  const stats = obj(acf.statistiques);
  const sal = obj(acf.salaires);
  const faqItems = Array.isArray(obj(acf.faq).items) ? (obj(acf.faq).items as Raw[]) : [];
  const figuresText = [
    ...(Array.isArray(stats.items) ? (stats.items as Raw[]).map((s) => `${s.label ?? ""} : ${s.valeur ?? ""}.`) : []),
    ...(Array.isArray(sal.medians) ? (sal.medians as Raw[]).map((m) => `Salaire médian ${m.label ?? ""} : ${m.valeur ?? ""} €.`) : []),
  ];
  const sourceUrl = String(obj(stats.source).url ?? obj(sal.source).url ?? "");
  const article: Article = {
    title: String(doc.title ?? ""),
    introduction: `<p>${esc(acf.definition)}</p>`,
    contenu: [{ texte: [...list(acf.points_cles), ...figuresText].map((t) => `<p>${esc(t)}</p>`).join("") }],
    conclusion: "",
    faq: faqItems.map((q) => ({ titre: String(q.question ?? ""), text: `<p><strong>${esc(q.reponse)}</strong></p>` })),
    sources: sourceUrl ? [{ libelle: "France Travail", url: sourceUrl, date: "" }] : [],
  };
  return { kind: "fiche", article, keyword: String(doc.wpFocusKeyword || doc.title || ""), seoTitle: (doc.seoTitle as string) ?? null, seoDescription: (doc.seoDescription as string) ?? null, stage: Number(doc.wpId) ? "en-ligne" : "brouillon", image: null, slug: (doc.slug as string) || null, coverage: coverageOfDoc(doc), updatedOn: (doc.figuresUpdatedAt as string) ?? null, now };
}

/**
 * La note d'avant une NOUVELLE version des règles est gardée (« precedent ») : la revue
 * mensuelle distingue une baisse due aux règles d'une baisse due au contenu. Pure (testée).
 */
export function withPrecedent(detail: Raw, d: Raw, version: number): Raw {
  const old = obj(d.scoreDetail);
  if (d.scoreRulesVersion != null && d.scoreRulesVersion !== version && (d.scoreSeo != null || d.scoreGeo != null)) return { ...detail, precedent: { version: d.scoreRulesVersion, seo: d.scoreSeo ?? null, geo: d.scoreGeo ?? null } };
  return old.precedent ? { ...detail, precedent: old.precedent } : detail;
}

export const summary = (r: ScoreResult) => ({
  seo: r.seo,
  geo: r.geo,
  alertes: r.alerts,
  // Règles v3 : une note qui attend une étape ou un relevé est « provisoire » ; combien de critères comptent.
  provisoire: r.provisional,
  comptes: r.counted,
  criteres: r.criteria.map((c) => ({ id: c.id, jauge: c.gauge, libelle: c.label, poids: c.weight, preuve: c.level, statut: c.status, resultat: c.value, points: c.points, detail: c.detail, mesure: c.measure, source: c.source ?? null, etat: c.state, action: c.action, seuils: c.params ?? null, applique: c.applies })),
});

export async function loadCriteria(payload: Payload): Promise<{ version: number; criteria: Criterion[] }> {
  const v = (await payload.find({ collection: "article-rule-versions" as never, sort: "-number", limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { number?: number; criteria?: unknown } | undefined;
  return { version: Number(v?.number ?? 0), criteria: criteriaOf(v) };
}

/** Recalcule les notes de tous les articles et fiches ; rend le nombre de notes changées. */
export async function scoreAll(payload: Payload, now = new Date()): Promise<{ version: number; articles: number; jobs: number; changed: number }> {
  const { version, criteria } = await loadCriteria(payload);
  let changed = 0;
  const run = async (collection: string, toInput: (d: Raw, now: Date) => ScoreInput) => {
    const docs = (await payload.find({ collection: collection as never, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Raw[];
    for (const d of docs) {
      if (collection === "articles" && !filled(d.acf) && !filled(d.draft)) continue;
      const r = withPrecedent(summary(scoreContent(toInput(d, now), criteria)), d, version) as ReturnType<typeof summary>;
      const same = d.scoreRulesVersion === version && JSON.stringify(d.scoreDetail ?? null) === JSON.stringify(r);
      if (same) continue;
      await payload.update({ collection: collection as never, id: d.id as number, overrideAccess: true, context: { fromWordPress: true }, data: { scoreSeo: r.seo, scoreGeo: r.geo, scoreDetail: r, scoreRulesVersion: version, scoredAt: now.toISOString() } as never });
      changed++;
    }
    return docs.length;
  };
  const articles = await run("articles", articleScoreInput);
  const jobs = await run("job-sheets", jobScoreInput);
  return { version, articles, jobs, changed };
}

/** Recalcule la note d'UN contenu (après une modification dans le tiroir). */
export async function scoreOne(payload: Payload, collection: "articles" | "job-sheets", id: number | string, now = new Date()) {
  const { version, criteria } = await loadCriteria(payload);
  const d = (await payload.findByID({ collection: collection as never, id, depth: 0, overrideAccess: true })) as unknown as Raw;
  const r = withPrecedent(summary(scoreContent((collection === "articles" ? articleScoreInput : jobScoreInput)(d, now), criteria)), d, version) as ReturnType<typeof summary>;
  await payload.update({ collection: collection as never, id, overrideAccess: true, context: { fromWordPress: true }, data: { scoreSeo: r.seo, scoreGeo: r.geo, scoreDetail: r, scoreRulesVersion: version, scoredAt: now.toISOString() } as never });
  return r;
}
