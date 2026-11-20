import { describe, expect, it } from "vitest";

import { applyCriterionChange } from "@/modules/editorial/lib/articles/rules-text";
import { parseRecommendations } from "@/modules/editorial/lib/articles/rules-review";
import { criteriaOf, DEFAULT_CRITERIA } from "@/modules/editorial/lib/score/criteria";
import { scoreContent, type ScoreInput } from "@/modules/editorial/lib/score/measure";
import { articleScoreInput, jobScoreInput } from "@/modules/editorial/lib/score/run";

const NOW = new Date("2026-11-19T10:00:00Z");
const words = (n: number, w = "chantier") => Array.from({ length: n }, () => w).join(" ");
const capsule = `<p><strong>${words(45, "mot")}</strong></p>`;
const section = (h: string, extra = "") => ({ acf_fc_layout: "texte", texte: `<h2>${h}</h2>${capsule}<p>${words(100, "texte")} ${extra}</p>` });
const crit = (r: ReturnType<typeof scoreContent>, id: string) => r.criteria.find((c) => c.id === id)!;

/** Un article en ligne complet : image optimisée, adresse propre, concurrents analysés. */
const good: ScoreInput = {
  kind: "article",
  stage: "en-ligne",
  keyword: "heures supplémentaires",
  seoTitle: "Heures supplémentaires dans le BTP : règles et calcul",
  seoDescription: "Comment calculer les heures supplémentaires dans le BTP : seuils, majorations et contingent, avec les textes officiels et un exemple chiffré pas à pas.",
  image: { alt: "Horloge stylisée pour un article sur les heures supplémentaires", mime: "image/webp", width: 1920, bytes: 40_000, file: "heures-supplementaires-btp.webp" },
  slug: "heures-supplementaires-btp",
  coverage: { status: "analyse", score: 80, target: 75, wordsMin: 300, wordsMax: 900, entities: 0.7, excess: 0 },
  updatedOn: "2026-11-01",
  now: NOW,
  article: {
    title: "Heures supplémentaires dans le BTP : comment les calculer ?",
    introduction: '<div class="tldr-box"><p>Points clés :</p><ul><li>Un</li><li>Deux</li><li>Trois</li></ul></div><p>Les heures supplémentaires sont les heures travaillées au-delà de 35 heures par semaine.</p>',
    contenu: [
      section("Comment compter ?", 'Selon Légifrance, la majoration est de 25 % pour les 8 premières heures. <a href="/pointage">pointage des heures</a>'),
      section("Quel taux ?", 'D\'après le Code du travail, le taux passe à 50 % au-delà. <a href="/plannings-ouvriers">planning des ouvriers</a> <a href="/feuilles-dheures-btp">feuilles d\'heures</a>'),
    ],
    conclusion: '<p>Pour aller plus loin, <a href="https://tim-management.co/contact">contactez-nous</a>.</p>',
    faq: [{ titre: "Question ?", text: capsule }],
    sources: [
      { libelle: "Légifrance", url: "https://www.legifrance.gouv.fr/a", date: "2026" },
      { libelle: "Service-public", url: "https://www.service-public.gouv.fr/b", date: "2026" },
      { libelle: "Code du travail numérique", url: "https://code.travail.gouv.fr/c", date: "2026" },
    ],
    methode: { assistance_ia: true, relu_par: "Charlie Piancatelli" } as never,
  },
};

describe("note v3 : un élément manquant compte 0", () => {
  it("un article complet obtient une note définitive, tous critères comptés", () => {
    const r = scoreContent(good, DEFAULT_CRITERIA);
    expect(r.seo).toBeGreaterThanOrEqual(85);
    expect(r.provisional.seo).toBe(false);
    expect(r.counted.seo[0]).toBe(r.counted.seo[1]);
    expect(crit(r, "SEO-06").state).toBe("rempli");
  });
  it("sans image, un article EN LIGNE perd les points de l'image (plus de 100 %)", () => {
    const r = scoreContent({ ...good, image: null }, DEFAULT_CRITERIA);
    for (const id of ["SEO-04", "SEO-05", "SEO-06"]) {
      expect(crit(r, id).state).toBe("manquant");
      expect(crit(r, id).points).toBe(0);
    }
    expect(r.seo as number).toBeLessThanOrEqual(80);
  });
  it("sans image, un BROUILLON compte 0 « à venir » et sa note est provisoire", () => {
    const r = scoreContent({ ...good, stage: "brouillon", image: null, slug: null, updatedOn: null, article: { ...good.article, methode: {} as never } }, DEFAULT_CRITERIA);
    expect(crit(r, "SEO-04").state).toBe("a-venir");
    expect(crit(r, "SEO-04").action).toMatch(/Claude Design/);
    expect(crit(r, "SEO-11").state).toBe("a-venir");
    expect(crit(r, "GEO-06").state).toBe("a-venir");
    expect(crit(r, "GEO-08").state).toBe("a-venir");
    expect(r.provisional.seo).toBe(true);
    expect(r.seo as number).toBeLessThan(80);
  });
  it("image mal optimisée : 700 px, JPEG, nom générique → partiel, avec ce qu'il faut revoir", () => {
    const r = scoreContent({ ...good, image: { alt: "image de chantier", mime: "image/jpeg", width: 700, bytes: 400_000, file: "IMG_1234.jpg" } }, DEFAULT_CRITERIA);
    expect(crit(r, "SEO-06").state).toBe("manquant");
    expect(crit(r, "SEO-06").detail).toMatch(/1200 px/);
    expect(crit(r, "SEO-05").state).toBe("partiel");
  });
  it("concurrents jamais analysés : 0, « en attente », note provisoire", () => {
    const r = scoreContent({ ...good, coverage: null }, DEFAULT_CRITERIA);
    expect(crit(r, "SEO-09").state).toBe("attente");
    expect(crit(r, "SEO-09").points).toBe(0);
    expect(r.provisional.seo).toBe(true);
  });
  it("top 10 fait d'outils : « sans objet », sorti du calcul avec sa raison", () => {
    const r = scoreContent({ ...good, coverage: { status: "insuffisant" } }, DEFAULT_CRITERIA);
    expect(crit(r, "SEO-09").state).toBe("sans-objet");
    expect(crit(r, "SEO-09").points).toBeNull();
    expect(crit(r, "SEO-09").detail).toMatch(/pas assez de vrais articles/);
    expect(r.counted.seo[0]).toBe(r.counted.seo[1] - 2);
  });
  it("bourrage, marque mal écrite, aucune source : la note baisse et une alerte apparaît", () => {
    const stuffed = scoreContent({ ...good, article: { ...good.article, introduction: `<p>Tim Management garantit des heures supplémentaires justes. ${Array.from({ length: 30 }, () => "heures supplémentaires").join(" ")}</p>`, sources: [] } }, DEFAULT_CRITERIA);
    expect(crit(stuffed, "SEO-10").value).toBe(0);
    expect(crit(stuffed, "GEO-01").value).toBe(0);
    expect(stuffed.alerts.length).toBeGreaterThan(0);
  });
  it("FAQ et H2 en question : affichés, poids 0, sans effet sur la note", () => {
    const a = scoreContent({ ...good, article: { ...good.article, faq: [] } }, DEFAULT_CRITERIA);
    expect(crit(a, "GEO-11").points).toBeNull();
    expect(a.geo).toBe(scoreContent(good, DEFAULT_CRITERIA).geo);
  });
  it("les poids comptés font 100 par jauge", () => {
    const sum = (g: string) => DEFAULT_CRITERIA.filter((c) => c.gauge === g && c.status === "active").reduce((a, c) => a + c.weight, 0);
    expect(sum("seo")).toBe(100);
    expect(sum("geo")).toBe(100);
  });
});

describe("Sergey fait évoluer la grille (règles v3)", () => {
  it("durcir un seuil change la note", () => {
    const stale = { ...good, updatedOn: "2026-09-01" };
    const out = applyCriterionChange(DEFAULT_CRITERIA as never, { id: "GEO-06", params: { days: 60 } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.summary).toMatch(/days 90 → 60/);
    expect(crit(scoreContent(stale, out.criteria as never), "GEO-06").value).toBe(0.5);
    expect(crit(scoreContent(stale, DEFAULT_CRITERIA), "GEO-06").value).toBe(1);
  });
  it("refuse un critère, un seuil ou un poids qui n'existent pas", () => {
    expect(applyCriterionChange(DEFAULT_CRITERIA as never, { id: "SEO-99", weight: 5 }).ok).toBe(false);
    expect(applyCriterionChange(DEFAULT_CRITERIA as never, { id: "GEO-06", params: { inconnu: 3 } }).ok).toBe(false);
    expect(applyCriterionChange(DEFAULT_CRITERIA as never, { id: "GEO-06", weight: 90 }).ok).toBe(false);
    expect(applyCriterionChange(DEFAULT_CRITERIA as never, { id: "GEO-06" }).ok).toBe(false);
  });
  it("un nouveau critère entre pour information, « à développer », et ne compte pas", () => {
    const out = applyCriterionChange(DEFAULT_CRITERIA as never, { id: "NEW-01", create: { gauge: "geo", label: "Tableau de données", measure: "Au moins un tableau HTML." } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const added = (out.criteria as typeof DEFAULT_CRITERIA).find((c) => c.id === "NEW-01")!;
    expect(added).toMatchObject({ status: "info", weight: 0 });
    expect(added.measure).toMatch(/^À développer/);
    expect(applyCriterionChange(out.criteria, { id: "NEW-01", status: "active" }).ok).toBe(false);
    const r = scoreContent(good, out.criteria as never);
    expect(r.geo).toBe(scoreContent(good, DEFAULT_CRITERIA).geo);
  });
  it("lit une recommandation de grille dans la réponse de Sergey", () => {
    const reply = `<synthese>Durcir la fraîcheur.</synthese><recommandations>${JSON.stringify([{ titre: "Fraîcheur à 60 jours", partie: "F", type: "critere", critere: { id: "geo-06", seuils: { days: 60 } }, pourquoi: "…", effet: "…", preuves: [{ url: "https://developers.google.com/search/x", source: "Google", date: "2026-11-01", niveau: "officiel", citation: "…" }] }])}</recommandations>`;
    const r = parseRecommendations(reply)!.findings[0];
    expect(r.kind).toBe("critere");
    expect(r.criterionChange).toEqual({ id: "GEO-06", params: { days: 60 } });
  });
  it("criteriaOf garde les seuils d'une version", () => {
    expect(criteriaOf({ criteria: DEFAULT_CRITERIA })[0].params).toEqual({ titleMin: 30, titleMax: 60, descMin: 120, descMax: 155 });
    expect(criteriaOf({})).toBe(DEFAULT_CRITERIA);
  });
});

describe("contenus du tableau dans la forme de la note", () => {
  it("article synchronisé : image, adresse, comparateur, étape", () => {
    const i = articleScoreInput({ title: "T", status: "publie", slug: "t-x", featuredImageUrl: "https://cms/x.webp", imageAlt: "a", imageMime: "image/webp", imageWidth: 700, imageBytes: 80000, imageFile: "2026/08/x.webp", coverageStatus: "insuffisant", acf: { introduction: "<p>x</p>", date_mise_a_jour: "20261101", methode: { relu_par: "Charlie" } } }, NOW);
    expect(i.updatedOn).toBe("2026-11-01");
    expect(i.stage).toBe("en-ligne");
    expect(i.image).toMatchObject({ width: 700, bytes: 80000 });
    expect(i.coverage?.status).toBe("insuffisant");
  });
  it("article rédigé, pas encore validé : brouillon, sans image", () => {
    const i = articleScoreInput({ title: "T", status: "a-relire", draft: { title: "T", introduction: "<p>x</p>" } }, NOW);
    expect(i.stage).toBe("brouillon");
    expect(i.image).toBeNull();
  });
  it("fiche métier : méta Yoast lue, source France Travail", () => {
    const i = jobScoreInput(
      {
        title: "Charpentier",
        wpId: 7,
        seoTitle: "Charpentier : métier, salaire, formation",
        figuresUpdatedAt: "2026-09-23",
        acf: { definition: "Le charpentier est…", points_cles: [{ valeur: "Salaire médian de 2 427 €" }], statistiques: { source: { url: "https://dataemploi.francetravail.fr/x" }, items: [{ label: "Offres", valeur: "18 580" }] }, faq: { items: [{ question: "Q ?", reponse: "R" }] } },
      },
      NOW,
    );
    expect(i.kind).toBe("fiche");
    expect(i.seoTitle).toBe("Charpentier : métier, salaire, formation");
    expect(i.article.sources?.[0]?.url).toBe("https://dataemploi.francetravail.fr/x");
    const r = scoreContent(i, DEFAULT_CRITERIA);
    expect(r.criteria.every((c) => c.applies.includes("fiche"))).toBe(true);
    expect(r.criteria.find((c) => c.id === "SEO-04")).toBeUndefined();
  });
});
