import { describe, expect, it } from "vitest";

import { acfDate, articleDataFromWp, wordpressFields, type WpPost } from "@/modules/editorial/lib/articles/from-wp";
import { buildArticleInsights } from "@/modules/editorial/lib/articles/insights";
import { buildArticleStats, pathKey } from "@/modules/editorial/lib/articles/stats";
import { statusFromWordPress } from "@/modules/editorial/lib/articles/statuses";
import { guessThemeNumber, THEME_SEEDS } from "@/modules/editorial/lib/articles/themes";

const THEME_IDS = Object.fromEntries(THEME_SEEDS.map((t) => [t.number, 100 + t.number]));

const post = (over: Partial<WpPost> = {}): WpPost => ({
  id: 7087,
  slug: "conservation-des-feuilles-dheures-btp-combien-dannees-legalement",
  status: "publish",
  link: "https://tim-management.co/actualite/conservation-des-feuilles-dheures-btp-combien-dannees-legalement",
  date_gmt: "2026-09-20T08:00:00",
  modified_gmt: "2026-10-12T14:30:00",
  author: 1,
  categories: [60],
  title: { raw: "Conservation des feuilles d&rsquo;heures BTP : combien d&rsquo;années ?" },
  seo_meta: { title: "Conservation feuilles d'heures BTP", metadesc: "Durée légale…", focuskw: "conservation feuille d'heures" },
  acf: {
    introduction: '<div class="tldr-box"><p>Points clés :</p><ul><li>Un</li><li>Deux</li><li>Trois</li></ul></div><p>Intro de cinq mots.</p>',
    contenu: [{ acf_fc_layout: "texte", texte: "<h2>Combien de temps ?</h2><p><strong>Un an.</strong></p>" }],
    conclusion: "<p>Fin.</p>",
    faq: [{ titre: "Question ?", text: "<p><strong>Réponse.</strong></p>" }],
    sources: [{ libelle: "Légifrance, D3171-16", url: "https://www.legifrance.gouv.fr/x", date: "2026" }, { libelle: "Sans adresse" }],
    methode: { assistance_ia: true, relu_par: "Charlie", relu_le: "20261012" },
    date_mise_a_jour: "2026-10-12",
  },
  ...over,
});

describe("statut d'un article d'après WordPress", () => {
  it("nouvel article : en ligne → Publié, programmé → Programmé, brouillon → À vérifier, doublon retiré → Dépublié", () => {
    expect(statusFromWordPress(null, "publish")).toBe("publie");
    expect(statusFromWordPress(null, "future")).toBe("programme");
    expect(statusFromWordPress(null, "draft")).toBe("a-verifier");
    expect(statusFromWordPress(null, "draft", true)).toBe("depublie");
    expect(statusFromWordPress(null, "private")).toBe("depublie");
  });
  it("WordPress fait foi pour l'en ligne, sans effacer un « À rafraîchir » en attente", () => {
    expect(statusFromWordPress("programme", "publish")).toBe("publie");
    expect(statusFromWordPress("a-rafraichir", "publish")).toBe("a-rafraichir");
    expect(statusFromWordPress("publie", "draft")).toBe("depublie");
    expect(statusFromWordPress("a-rafraichir", "draft")).toBe("depublie");
  });
  it("un brouillon qui avance dans le tableau garde son statut", () => {
    expect(statusFromWordPress("redaction", "draft")).toBe("redaction");
    expect(statusFromWordPress("pret", "draft")).toBe("pret");
  });
});

describe("thématique proposée à l'import", () => {
  it("par la catégorie WordPress", () => {
    expect(guessThemeNumber({ categories: [62], slug: "prime-de-fin-dannee-regles" })).toBe(2);
    expect(guessThemeNumber({ categories: [61], slug: "kpi-chantier-les-indicateurs-a-suivre" })).toBe(4);
  });
  it("le sujet l'emporte quand il est net : matériel → Stock, choix d'un logiciel → vente", () => {
    expect(guessThemeNumber({ categories: [61], slug: "gestion-de-materiel-sur-chantiers-quels-sont-les-enjeux-et-les-solutions" })).toBe(5);
    expect(guessThemeNumber({ categories: [59], slug: "top-4-des-meilleurs-logiciels-de-planning-chantier" })).toBe(7);
    expect(guessThemeNumber({ categories: [58], slug: "les-logiciels-de-pointage-dans-le-secteur-du-batiment" })).toBe(7);
  });
  it("« vs » seul ne fait pas un comparatif de logiciels", () => {
    expect(guessThemeNumber({ categories: [58], slug: "pointage-chantier-vs-pointage-interventions-sav-depannage-la-difference" })).toBe(1);
  });
  it("sans catégorie : des mots du titre ; sinon rien (rangement à la main)", () => {
    expect(guessThemeNumber({ slug: "calcul-des-conges-payes-dans-le-secteur-du-btp" })).toBe(2);
    expect(guessThemeNumber({ slug: "nouveautes-de-la-rentree" })).toBeNull();
  });
});

describe("d'un article WordPress à une fiche du tableau", () => {
  it("reprend titre décodé, SEO, compteurs et méthode", () => {
    const f = wordpressFields(post());
    expect(f.title).toBe("Conservation des feuilles d’heures BTP : combien d’années ?");
    expect(f.wpModified).toBe("2026-10-12T14:30:00.000Z");
    expect(f.publishedAt).toBe("2026-09-20T08:00:00.000Z");
    expect(f.hasTldr).toBe(true);
    expect(f.faqCount).toBe(1);
    expect(f.sourcesCount).toBe(1);
    expect(f.assistanceIa).toBe(true);
    expect(f.reviewedOn).toBe("2026-10-12");
    expect(f.wordCount).toBeGreaterThan(10);
  });
  it("ACF vide renvoyé en tableau par WordPress : aucun plantage", () => {
    const f = wordpressFields(post({ acf: [] }));
    expect(f.wordCount).toBe(0);
    expect(f.hasTldr).toBe(false);
  });
  it("à la création : thématique, mot-clé Yoast, et l'historique d'octobre", () => {
    const d = articleDataFromWp(post(), null, THEME_IDS) as Record<string, unknown>;
    expect(d.status).toBe("publie");
    expect(d.theme).toBe(101);
    expect(d.themeSource).toBe("auto");
    expect(d.keyword).toBe("conservation feuille d'heures");
    expect(d.notes).toContain("Lot grave 07/10");
    expect(d.origin).toBe("import-wordpress");
  });
  it("titres SEO à ne pas réécrire, échéances et doublons retirés viennent de la revue d'octobre", () => {
    const seo = articleDataFromWp(post({ id: 4239, slug: "le-top-5-des-meilleurs-logiciels-de-suivi-de-chantier" }), null, THEME_IDS) as Record<string, unknown>;
    expect(seo.keepSeoTitle).toBe(true);
    expect((seo.deadlines as unknown[]).length).toBe(1);
    const gone = articleDataFromWp(post({ id: 7016, status: "draft" }), null, THEME_IDS) as Record<string, unknown>;
    expect(gone.status).toBe("depublie");
    expect(gone.redirectTo).toBe(7027);
  });
  it("fiche existante : seuls les champs WordPress et le statut ; la thématique et le mot-clé saisis ne bougent pas", () => {
    const d = articleDataFromWp(post(), { id: 1, status: "a-rafraichir", keyword: "durée de conservation" }, THEME_IDS) as Record<string, unknown>;
    expect(d.status).toBe("a-rafraichir");
    expect("theme" in d).toBe(false);
    expect("keyword" in d).toBe(false);
    expect("notes" in d).toBe(false);
  });
  it("dates ACF", () => {
    expect(acfDate("20270105")).toBe("2027-01-05");
    expect(acfDate("2027-01-05")).toBe("2027-01-05");
    expect(acfDate("05/01/2027")).toBe("2027-01-05");
    expect(acfDate("")).toBeNull();
  });
});

describe("ce que les agents lisent du tableau", () => {
  it("statuts, thématiques, échéances proches, format GEO manquant", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const out = buildArticleInsights(
      [
        { title: "A", status: "publie", theme: { name: "Paie" }, hasTldr: true, sourcesCount: 2, publishedAt: "2026-11-10", deadlines: [{ date: "2027-01-05", reason: "CGI" }] },
        { title: "B", status: "publie", theme: { name: "Paie" }, hasTldr: false, sourcesCount: 0, publishedAt: "2026-10-01" },
        { title: "C", status: "a-verifier", theme: null, notes: "Brouillon importé" },
        { title: "D", status: "depublie", theme: { name: "Paie" }, deadlines: [{ date: "2027-06-01", reason: "loin" }] },
      ],
      now,
    );
    expect(out.parStatut["Publié"]).toBe(2);
    expect(out.parThematique.find((t) => t.thematique === "Paie")).toEqual({ thematique: "Paie", enLigne: 2, enPreparation: 0 });
    expect(out.aVerifier[0].motif).toBe("Brouillon importé");
    expect(out.echeancesDans60Jours.map((d) => d.aFaire)).toEqual(["CGI"]);
    expect(out.enLigneSansTldr).toBe(1);
    expect(out.enLigneSansSource).toBe(1);
    expect(out.dernieresPublications[0].titre).toBe("A");
  });
});

describe("chiffres de chaque article (Search Console, GA4)", () => {
  const row = (page: string, clicks: number, impressions: number, position: number) => ({ keys: [page], clicks, impressions, ctr: 0, position });
  it("une même clé pour WordPress, Search Console et GA4", () => {
    expect(pathKey("https://tim-management.co/actualite/grille-de-salaire-btp/")).toBe("/actualite/grille-de-salaire-btp");
    expect(pathKey("https://www.tim-management.co/actualite/Grille-De-Salaire-BTP?utm_source=x")).toBe("/actualite/grille-de-salaire-btp");
    expect(pathKey("/actualite/grille-de-salaire-btp")).toBe("/actualite/grille-de-salaire-btp");
    expect(pathKey("")).toBeNull();
  });
  it("clics cumulés, 28 jours, position pondérée, visites dont IA", () => {
    const out = buildArticleStats([{ id: 1, wpLink: "https://tim-management.co/actualite/grille-de-salaire-btp" }, { id: 2, wpLink: "https://tim-management.co/actualite/sans-trafic" }, { id: 3, wpLink: "" }], {
      total: [row("https://tim-management.co/actualite/grille-de-salaire-btp", 200, 40000, 7), row("https://tim-management.co/actualite/grille-de-salaire-btp/", 66, 9000, 8)],
      last28: [row("https://tim-management.co/actualite/grille-de-salaire-btp", 30, 5000, 6)],
      prev28: [row("https://tim-management.co/actualite/grille-de-salaire-btp", 50, 6000, 6)],
      last90: [row("https://tim-management.co/actualite/grille-de-salaire-btp", 90, 3000, 4), row("https://tim-management.co/actualite/grille-de-salaire-btp/", 10, 1000, 8)],
      ga4: [
        { page: "/actualite/grille-de-salaire-btp", source: "google", medium: "organic", sessions: 300, engaged: 0, keyEvents: 0 },
        { page: "/actualite/grille-de-salaire-btp", source: "chatgpt.com", medium: "referral", sessions: 12, engaged: 0, keyEvents: 0 },
      ],
    });
    expect(out.get(1)).toEqual({ gscClicks: 266, gscImpressions: 49000, gscPosition: 5, gscClicks28: 30, gscClicks28Prev: 50, ga4Sessions: 312, ga4AiSessions: 12 });
    expect(out.get(2)).toEqual({ gscClicks: 0, gscImpressions: 0, gscPosition: null, gscClicks28: 0, gscClicks28Prev: 0, ga4Sessions: 0, ga4AiSessions: 0 });
    // Brouillon sans adresse publique : zéro, pas vide (tri par clics).
    expect(out.get(3)?.gscClicks).toBe(0);
  });
  it("les agents voient les plus cliqués et les clics en baisse", () => {
    const out = buildArticleInsights(
      [
        { title: "Grille", status: "publie", gscClicks: 266, gscClicks28: 30, gscClicks28Prev: 50, gscPosition: 5 },
        { title: "Stable", status: "publie", gscClicks: 40, gscClicks28: 12, gscClicks28Prev: 11 },
      ],
      new Date("2026-11-18"),
    );
    expect(out.lesPlusCliques.map((a) => a.titre)).toEqual(["Grille", "Stable"]);
    expect(out.clicsEnBaisse.map((a) => a.titre)).toEqual(["Grille"]);
  });
});
