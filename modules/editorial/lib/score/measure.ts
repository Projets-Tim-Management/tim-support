import { checkBrand, checkCapsules, checkHeadings, checkPolicy, checkTldr, getH2s, internalLinks, keywordPresent, norm, splitSentences, stripTags, wordCount, type Article } from "@/modules/editorial/lib/articles/check";
import { reviewerName } from "@/modules/editorial/lib/articles/from-wp";
import type { ContentKind, Criterion } from "@/modules/editorial/lib/score/criteria";

/**
 * LA MESURE DE CHAQUE CRITÈRE — règles v3 (validées par la direction le 19/11/2026). Pure (testée).
 *
 * Chaque critère rend un ÉTAT, jamais un silence :
 *  - « rempli » (tous les points), « partiel » (une part), « manquant » (0) ;
 *  - « a-venir » (0) : l'élément se pose à une étape suivante (image, date, relecture) ;
 *  - « attente » (0) : une donnée n'est pas encore relevée (concurrents) → note PROVISOIRE ;
 *  - « sans-objet » : le critère ne s'applique pas ici (raison écrite) → sorti du calcul.
 * Une image absente compte donc 0 : plus aucun 100 % trompeur. Les seuils viennent des
 * paramètres du critère (règles versionnées) ; Sergey peut proposer de les durcir.
 */

const DAY = 86_400_000;

export type CriterionState = "rempli" | "partiel" | "manquant" | "a-venir" | "attente" | "sans-objet";

export type ScoreInput = {
  kind: ContentKind;
  /** Le contenu dans la forme du contrôle (article) ou converti (fiche). */
  article: Article;
  keyword: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** « brouillon » : pas encore en ligne (image, date et relecture viendront) ; « en-ligne » : publié. */
  stage?: "brouillon" | "en-ligne";
  /** L'image principale (null : aucune image). Dimensions et poids inconnus : null. */
  image?: { alt?: string | null; mime?: string | null; width?: number | null; bytes?: number | null; file?: string | null } | null;
  /** Le slug de la page (null : pas encore fixé). */
  slug?: string | null;
  /** Le comparateur : null = jamais analysé ; « insuffisant » = pas assez de vrais articles dans le top 10. */
  coverage?: { status: "analyse" | "insuffisant" | null; score?: number | null; target?: number | null; wordsMin?: number | null; wordsMax?: number | null; entities?: number | null; excess?: number | null } | null;
  /** Date visible de mise à jour (article : date_mise_a_jour ou publication ; fiche : chiffres). */
  updatedOn?: string | null;
  now: Date;
};

export type Measured = { state: CriterionState; value: number; detail: string; action?: string };

const P = (c: Criterion, k: string, d: number) => (c.params && typeof c.params[k] === "number" ? c.params[k] : d);
const plainBody = (a: Article) => [a.introduction ?? "", ...(a.contenu ?? []).map((b) => String(b?.texte ?? "")), a.conclusion ?? ""].join("\n");
const allText = (a: Article) => [plainBody(a), ...(a.faq ?? []).map((q) => `${q?.titre ?? ""} ${q?.text ?? ""}`)].join("\n");
const sourceUrls = (a: Article) => new Set((a.sources ?? []).map((s) => String(s?.url ?? "").trim()).filter((u) => /^https?:\/\/[^/]+\/./.test(u)));
const isYearOnly = (s: string) => !/\d/.test(s.replace(/(?<![\d.,])(19|20)\d{2}(?![\d%€])/g, ""));
const introAfterTldr = (intro: string) => intro.replace(/<div class="tldr-box">[\s\S]*?<\/div>/, "");
const kwWords = (k: string) => norm(k).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
/** Une valeur de 0 à 1 dans un état lisible. */
const graded = (v: number, detail: string, action?: string): Measured => ({ state: v >= 1 ? "rempli" : v > 0 ? "partiel" : "manquant", value: Math.max(0, Math.min(1, v)), detail, ...(v < 1 && action ? { action } : {}) });
const missing = (i: ScoreInput, detail: string, laterStep: string, action: string): Measured =>
  i.stage === "brouillon" ? { state: "a-venir", value: 0, detail: `${detail} (${laterStep}).`, action } : { state: "manquant", value: 0, detail: `${detail}.`, action };
const share = (k: string, text: string) => {
  const w = kwWords(k);
  if (!w.length) return 0;
  const t = norm(text);
  return w.filter((x) => t.includes(x.replace(/s$/, ""))).length / w.length;
};

/** Le comparateur : pas encore relevé (attente), sans objet (top 10 fait d'outils), ou les données. */
function compState(i: ScoreInput): Measured | null {
  const c = i.coverage;
  if (!c || !c.status) return { state: "attente", value: 0, detail: "Concurrents pas encore analysés.", action: "Lancer « Analyser les concurrents » (ou attendre le relevé automatique)." };
  if (c.status === "insuffisant") return { state: "sans-objet", value: 0, detail: "Sans objet : le top 10 n'a pas assez de vrais articles pour comparer (outils, forums, vidéos)." };
  return null;
}

export const MEASURES: Record<string, (i: ScoreInput, c: Criterion) => Measured> = {
  "SEO-01": (i, c) => {
    const t = (i.seoTitle ?? "").trim().length;
    const d = (i.seoDescription ?? "").trim().length;
    if (!t && !d) return { state: "manquant", value: 0, detail: "Ni titre SEO ni méta description.", action: "Écrire le titre SEO et la méta description (aperçu Google)." };
    const okT = t >= P(c, "titleMin", 30) && t <= P(c, "titleMax", 60);
    const okD = d >= P(c, "descMin", 120) && d <= P(c, "descMax", 155);
    return graded((Number(okT) + Number(okD)) / 2, `Titre SEO ${t} car. (${P(c, "titleMin", 30)}–${P(c, "titleMax", 60)}), description ${d} car. (${P(c, "descMin", 120)}–${P(c, "descMax", 155)}).`, "Ajuster la longueur du titre SEO ou de la description.");
  },
  "SEO-02": (i) => {
    if (!i.keyword.trim()) return { state: "manquant", value: 0, detail: "Pas de mot-clé visé.", action: "Renseigner le mot-clé visé." };
    const first100 = stripTags(plainBody(i.article)).trim().split(/\s+/).slice(0, 100).join(" ");
    const places = { H1: keywordPresent(i.keyword, String(i.article.title ?? "")), "titre SEO": Boolean(i.seoTitle) && keywordPresent(i.keyword, i.seoTitle ?? ""), description: Boolean(i.seoDescription) && keywordPresent(i.keyword, i.seoDescription ?? ""), "100 premiers mots": keywordPresent(i.keyword, first100) };
    const exact = Boolean(i.seoTitle) && norm(i.seoTitle ?? "") === norm(i.keyword);
    const got = Object.values(places).filter(Boolean).length;
    const absent = Object.entries(places).filter(([, v]) => !v).map(([k]) => k);
    return graded(got / 4 - (exact ? 0.25 : 0), `Mot-clé ${absent.length ? `absent de : ${absent.join(", ")}` : "présent partout"}${exact ? " ; titre SEO réduit au mot-clé exact" : ""}.`, absent.length ? `Placer le mot-clé dans : ${absent.join(", ")}.` : "Allonger le titre SEO au-delà du mot-clé exact.");
  },
  "SEO-03": (i, c) => {
    const n = internalLinks(i.article).length;
    const min = P(c, "min", 3);
    const max = P(c, "max", 5);
    return graded(n >= min && n <= max ? 1 : n > max ? 0.7 : n === 0 ? 0 : n / min, `${n} lien(s) interne(s) (cible ${min} à ${max}).`, n > max ? "Retirer les liens internes les moins utiles." : "Ajouter des liens vers les pages proches (onglet Liens).");
  },
  "SEO-04": (i) => (i.image ? { state: "rempli", value: 1, detail: "Image principale posée." } : missing(i, "Aucune image principale", "à créer dans Claude Design après « Valider le texte »", "Copier le prompt de l'image (bloc Image principale), créer l'image dans Claude Design, puis la déposer.")),
  "SEO-05": (i, c) => {
    if (!i.image) return missing(i, "Pas d'image, donc pas de texte alternatif", "vient avec l'image", "Déposer l'image avec le texte alternatif donné par Claude Design.");
    const alt = (i.image.alt ?? "").trim();
    if (!alt) return { state: "manquant", value: 0, detail: "Texte alternatif vide.", action: "Écrire un texte alternatif qui décrit l'image et reprend le mot-clé." };
    const checks = { court: alt.length <= P(c, "max", 125), "avec le mot-clé": share(i.keyword, alt) >= 0.5, "sans « image de »": !/^(image|photo|illustration|visuel)\s+(de|d['’])/i.test(alt) };
    const ko = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return graded(Object.values(checks).filter(Boolean).length / 3, `« ${alt.slice(0, 80)}${alt.length > 80 ? "…" : ""} » (${alt.length} car.)${ko.length ? ` — à revoir : ${ko.join(", ")}` : ""}.`, "Réécrire le texte alternatif.");
  },
  "SEO-06": (i, c) => {
    if (!i.image) return missing(i, "Pas d'image", "vient avec l'image", "Déposer l'image de Claude Design (WebP 1920 × 1080, moins de 200 Ko).");
    const { mime, bytes, width, file } = i.image;
    if (bytes == null || width == null) return { state: "attente", value: 0, detail: "Poids et dimensions de l'image pas encore relevés.", action: "Synchroniser avec WordPress." };
    const name = String(file ?? "").split("/").pop() ?? "";
    const checks = { "format WebP/AVIF": /webp|avif/i.test(String(mime ?? name)), [`${P(c, "maxKb", 200)} Ko au plus`]: bytes <= P(c, "maxKb", 200) * 1024, [`${P(c, "minWidth", 1200)} px de large`]: width >= P(c, "minWidth", 1200), "nom descriptif": /^[a-z0-9]+(-[a-z0-9]+){1,}\.[a-z0-9]+$/.test(name) && !/^(img|dsc|image|photo)[-_]?\d/i.test(name) };
    const ko = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return graded(Object.values(checks).filter(Boolean).length / 4, `${String(mime ?? "?").replace("image/", "")}, ${Math.round(bytes / 1024)} Ko, ${width} px, « ${name} »${ko.length ? ` — à revoir : ${ko.join(", ")}` : ""}.`, "Recréer l'image dans Claude Design (charte : WebP 1920 × 1080) et la redéposer.");
  },
  "SEO-07": (i) => {
    const errors = checkHeadings(i.article);
    return graded(errors.length ? 0 : 1, errors.length ? errors[0] : "Hiérarchie des titres valide.", "Corriger la hiérarchie des titres.");
  },
  "SEO-08": (i) => {
    const s = compState(i);
    if (s) return s;
    const { wordsMin, wordsMax } = i.coverage ?? {};
    const n = wordCount(allText(i.article));
    if (wordsMin == null || wordsMax == null) return { state: "attente", value: 0, detail: "Fourchette du top 10 pas encore calculée.", action: "Réanalyser les concurrents." };
    const v = n >= wordsMin && n <= wordsMax ? 1 : n >= wordsMin * 0.8 && n <= wordsMax * 1.2 ? 0.5 : 0;
    return graded(v, `${n} mots ; top 10 entre ${wordsMin} et ${wordsMax}.`, n < wordsMin ? "Compléter le texte là où il manque des notions." : "Resserrer le texte.");
  },
  "SEO-09": (i) => {
    const s = compState(i);
    if (s) return s;
    const { score, target } = i.coverage ?? {};
    if (score == null) return { state: "attente", value: 0, detail: "Couverture pas encore calculée.", action: "Réanalyser les concurrents." };
    return graded(target ? score / target : score / 100, `Couverture ${score} %${target != null ? ` ; cible ${target} %` : ""}.`, "Ajouter les mots-clés, entités et questions manquants (panneau Mots-clés).");
  },
  "SEO-10": (i, c) => {
    const kw = norm(i.keyword).trim();
    if (!kw) return { state: "manquant", value: 0, detail: "Pas de mot-clé visé.", action: "Renseigner le mot-clé visé." };
    const text = norm(stripTags(allText(i.article)));
    const words = Math.max(1, text.split(/\s+/).filter(Boolean).length);
    const hits = text.split(kw).length - 1;
    const density = (hits * kw.split(/\s+/).length * 100) / words;
    const max = P(c, "density", 2.5);
    const excess = Number(i.coverage?.excess ?? 0);
    const v = (density <= max ? 1 : density <= max * 1.6 ? 0.5 : 0) - (excess > 0 ? 0.5 : 0);
    return graded(v, `Mot-clé exact : ${hits} fois, ${density.toFixed(1)} % des mots (plafond ${max} %)${excess ? ` ; ${excess} terme(s) au-delà de la fourchette du top 10` : ""}.`, "Remplacer des répétitions par des synonymes.");
  },
  "SEO-11": (i, c) => {
    const slug = String(i.slug ?? "").trim();
    if (!slug) return missing(i, "Adresse pas encore fixée", "posée à « Valider le texte », d'après le mot-clé", "Valider le texte : l'adresse se crée d'après le mot-clé.");
    const words = slug.split("-").filter(Boolean);
    const checks = { courte: slug.length <= P(c, "maxChars", 60) && words.length <= P(c, "maxWords", 6), "avec le mot-clé": share(i.keyword, slug.replace(/-/g, " ")) >= 0.5, "sans date": !/(^|-)(19|20)\d{2}(-|$)/.test(slug) };
    const ko = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return graded(Object.values(checks).filter(Boolean).length / 3, `/${slug} (${slug.length} car., ${words.length} mots)${ko.length ? ` — à revoir : ${ko.join(", ")}` : ""}.`, "Raccourcir l'adresse (une redirection 301 sera nécessaire si la page est en ligne).");
  },
  "SEO-12": (i) => {
    const errors = [...checkBrand(i.article), ...checkPolicy(i.article, { sales: true }).errors.filter((e) => /Promesse|démo|démonstration/i.test(e))];
    return graded(errors.length ? 0 : 1, errors.length ? errors.slice(0, 3).join(" ; ") : "Marque correcte, aucune promesse.", "Corriger la marque (« TIM Management ») ou retirer la promesse.");
  },
  "GEO-01": (i, c) => {
    const words = Math.max(1, wordCount(plainBody(i.article)));
    const figures = splitSentences(plainBody(i.article)).filter((s) => /\d/.test(s) && !isYearOnly(s)).length;
    const per1000 = (figures * 1000) / words;
    const sourced = sourceUrls(i.article).size > 0;
    const target = P(c, "per1000", 5);
    return graded(sourced ? per1000 / target : 0, `${figures} phrase(s) chiffrée(s), ${per1000.toFixed(1)} pour 1 000 mots (cible ${target})${sourced ? "" : ", aucune source précise"}.`, sourced ? "Ajouter des chiffres tirés de sources officielles." : "Citer les sources des chiffres.");
  },
  "GEO-02": (i, c) => {
    const n = sourceUrls(i.article).size;
    const min = P(c, "min", 3);
    return graded(n / min, `${n} source(s) précise(s) distincte(s) (cible ${min}).`, "Ajouter des sources officielles précises (page exacte).");
  },
  "GEO-03": (i) => {
    const intro = String(i.article.introduction ?? "");
    const tldrOk = i.kind === "fiche" ? true : checkTldr(i.article).length === 0;
    const first = stripTags(introAfterTldr(intro)).trim().split(/\s+/).slice(0, 60).join(" ");
    const definition = /\b(est|sont|désigne|désignent|correspond|correspondent|consiste|consistent|regroupe|recouvre)\b/i.test(first);
    return graded((Number(tldrOk) + Number(definition)) / 2, `${i.kind === "fiche" ? "" : `TL;DR ${tldrOk ? "conforme" : "absente ou hors norme"} ; `}phrase de définition ${definition ? "présente" : "absente"} dans les 60 premiers mots.`, "Commencer par une réponse directe : TL;DR puis « X est… ».");
  },
  "GEO-04": (i) => {
    const errors = checkCapsules(i.article);
    const h2 = getH2s(i.article).length + (i.article.faq ?? []).length || 1;
    return graded(1 - errors.length / h2, errors.length ? `${errors.length} capsule(s) hors norme : ${errors[0]}` : "Toutes les capsules sont conformes.", "Ramener chaque capsule entre 40 et 60 mots.");
  },
  "GEO-05": (i, c) => {
    const sections = (i.article.contenu ?? []).map((b) => wordCount(String(b?.texte ?? ""))).filter((n) => n > 0);
    if (!sections.length) return { state: "manquant", value: 0, detail: "Aucune section.", action: "Structurer le texte en sections sous des H2." };
    const avg = sections.reduce((a, b) => a + b, 0) / sections.length;
    const min = P(c, "min", 120);
    const max = P(c, "max", 180);
    return graded(avg >= min && avg <= max ? 1 : avg >= min * 0.66 && avg <= max * 1.66 ? 0.5 : 0, `Sections de ${Math.round(avg)} mots en moyenne (cible ${min} à ${max}).`, avg > max ? "Découper les sections trop longues." : "Étoffer les sections trop courtes.");
  },
  "GEO-06": (i, c) => {
    if (!i.updatedOn) return missing(i, "Aucune date de mise à jour visible", "posée à « Valider le texte »", "Valider le texte : la date se pose à ce moment.");
    const age = (i.now.getTime() - Date.parse(i.updatedOn)) / DAY;
    if (!Number.isFinite(age)) return { state: "manquant", value: 0, detail: "Date illisible.", action: "Corriger la date de mise à jour." };
    const fresh = i.kind === "fiche" ? P(c, "daysFiche", 365) : P(c, "days", 90);
    return graded(age <= fresh ? 1 : age <= fresh * 4 ? 0.5 : 0, `Mis à jour il y a ${Math.round(age)} jour(s) (cible ${fresh}).`, "Mettre à jour l'article (l'équipe le fait toute seule à l'échéance).");
  },
  "GEO-07": (i, c) => {
    const n = splitSentences(plainBody(i.article)).filter((s) => /\b(selon|d['’]apr[eè]s)\b/i.test(s)).length;
    const min = P(c, "min", 2);
    return graded(n / min, `${n} phrase(s) attribuée(s) à une source (cible ${min}).`, "Attribuer les faits à leur source (« selon l'URSSAF… »).");
  },
  "GEO-08": (i) => {
    const who = reviewerName(((i.article.methode ?? {}) as { relu_par?: unknown }).relu_par);
    return who ? { state: "rempli", value: 1, detail: `Relu par ${who}.` } : missing(i, "« Relu par » vide", "rempli à « Valider le texte »", "Valider le texte : « relu par » se remplit à ce moment.");
  },
  "GEO-09": (i, c) => {
    const s = compState(i);
    if (s) return s;
    const e = i.coverage?.entities;
    if (e == null) return { state: "sans-objet", value: 0, detail: "Sans objet : aucune entité commune aux pages du top 10." };
    const full = P(c, "full", 0.6);
    return graded(e / full, `${Math.round(e * 100)} % des entités du top 10 citées (plein dès ${Math.round(full * 100)} %).`, "Citer les organismes et textes de référence manquants (onglet Entités), avec une source.");
  },
  "GEO-10": (i) => {
    const h2 = getH2s(i.article);
    const q = h2.filter((h) => h.trim().endsWith("?")).length;
    return { state: h2.length ? (q / h2.length >= 0.6 ? "rempli" : "partiel") : "sans-objet", value: h2.length ? q / h2.length : 0, detail: `${q} H2 en question sur ${h2.length}.` };
  },
  "GEO-11": (i) => {
    const n = (i.article.faq ?? []).filter(Boolean).length;
    return { state: n ? "rempli" : "manquant", value: n ? 1 : 0, detail: `${n} question(s) de FAQ.` };
  },
};

export type CriterionResult = Criterion & { value: number | null; detail: string; points: number | null; state: CriterionState; action: string | null };
export type ScoreResult = { seo: number | null; geo: number | null; criteria: CriterionResult[]; alerts: string[]; provisional: { seo: boolean; geo: boolean }; counted: { seo: [number, number]; geo: [number, number] } };

/** La note d'un contenu selon des critères donnés. Pure (testée). */
export function scoreContent(input: ScoreInput, criteria: Criterion[]): ScoreResult {
  const results: CriterionResult[] = criteria
    .filter((c) => c.applies.includes(input.kind))
    .map((c) => {
      const m = MEASURES[c.id]?.(input, c) ?? { state: "sans-objet" as const, value: 0, detail: "Critère inconnu de ce moteur (à développer)." };
      const counted = c.status === "active" && c.weight > 0 && m.state !== "sans-objet";
      return { ...c, value: m.state === "sans-objet" ? null : m.value, detail: m.detail, state: m.state, action: m.action ?? null, points: counted ? Math.round(m.value * c.weight * 10) / 10 : null };
    });
  const active = (g: "seo" | "geo") => results.filter((r) => r.gauge === g && r.status === "active" && r.weight > 0);
  const gauge = (g: "seo" | "geo") => {
    const counted = active(g).filter((r) => r.state !== "sans-objet");
    const max = counted.reduce((a, r) => a + r.weight, 0);
    return max ? Math.round((counted.reduce((a, r) => a + (r.points ?? 0), 0) / max) * 100) : null;
  };
  const pending = (g: "seo" | "geo") => active(g).some((r) => r.state === "a-venir" || r.state === "attente");
  const count = (g: "seo" | "geo"): [number, number] => [active(g).filter((r) => r.state !== "sans-objet").length, active(g).length];
  const alerts = [...checkBrand(input.article), ...checkPolicy(input.article, { sales: true }).errors.filter((e) => /Promesse|démo|démonstration/i.test(e))];
  return { seo: gauge("seo"), geo: gauge("geo"), criteria: results, alerts, provisional: { seo: pending("seo"), geo: pending("geo") }, counted: { seo: count("seo"), geo: count("geo") } };
}
