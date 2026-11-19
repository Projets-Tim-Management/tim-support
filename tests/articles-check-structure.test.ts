/**
 * Portage de tim-management/tests/test_validation.py, partie structure, liens, SEO, ton et marque :
 * mêmes entrées, mêmes attentes. Chaque nom de test reprend celui du test Python (sans « test_ »).
 * Seuls écarts : les tests de marque, inversés par décision du 18/11/2026 (voir les commentaires).
 */
import { describe, expect, it } from "vitest";

import {
  cannibalizationConflicts,
  capsuleProblems,
  checkAiTraces,
  checkBrand,
  checkCapsules,
  checkCompetitorLinks,
  checkFanout,
  checkHeadings,
  checkInternalLinking,
  checkKeywordIntro,
  checkLength,
  checkLinks,
  checkOffline,
  checkRating,
  checkSeoMeta,
  checkTitles,
  checkTldr,
  cleanH1,
  extractNumbers,
  iterCapsules,
  parseJsonResponse,
  relatedArticles,
  resolveSiteUrls,
  sanitizeArticle,
  splitSentences,
  unwrapArticleStrong,
  validateArticle,
  type Article,
} from "@/modules/editorial/lib/articles/check";

import { FAITS_FFB, makeArticle, words } from "./articles-check-fixtures";

describe("capsules", () => {
  it.each([
    [39, false],
    [40, true],
    [60, true],
    [61, false],
  ])("capsule bornes : %i mots → %s", (n, ok) => {
    expect(capsuleProblems(words(n)).length === 0).toBe(ok);
  });

  it("capsule avec lien rejetee", () => {
    expect(capsuleProblems(words(45) + ' <a href="https://tim-management.co/">lien</a>')).toContain("contient un lien");
  });

  it.each(["Il permet", "Elle permet", "Ce dernier permet", "Cela permet"])("capsule pronominale rejetee : %s", (start) => {
    expect(capsuleProblems(`${start} ${words(44)}`).some((p) => p.includes("pronominale"))).toBe(true);
  });

  it("capsules article valide", () => {
    expect(checkCapsules(makeArticle())).toEqual([]);
  });

  it("h2 sans capsule rejete", () => {
    const article = makeArticle();
    article.contenu[0].texte = "<h2>Comment faire ?</h2><p>Pas de capsule.</p>";
    expect(checkCapsules(article).some((e) => e.includes("suivi immédiatement"))).toBe(true);
  });

  it("faq sans capsule rejetee", () => {
    const article = makeArticle();
    article.faq[0].text = "<p>Réponse simple.</p>";
    expect(checkCapsules(article).some((e) => e.includes("FAQ 1"))).toBe(true);
  });
});

describe("titres", () => {
  it("titres valides", () => {
    expect(checkTitles(makeArticle())).toEqual([]);
  });

  it.each(["Guide complet 2026 : le pointage multi-chantiers", "Pointage BTP : le guide complet", "Guide pointage : tout savoir"])(
    "h1 guide complet rejete : %s",
    (title) => {
      const article = makeArticle({ title });
      expect(checkTitles(article).some((e) => e.includes("H1"))).toBe(true);
    },
  );

  it("clean h1", () => {
    expect(cleanH1("Guide complet 2026 : pointage multi-chantiers")).toBe("Pointage multi-chantiers");
    expect(cleanH1("Feuille d'heures BTP 2026 : ce qui change")).toBe("Feuille d'heures BTP 2026 : ce qui change");
  });

  it("ratio h2 questions", () => {
    // 4/5 = 80 % -> OK ; on passe à 2/5 = 40 %
    const article = makeArticle();
    for (const b of article.contenu.slice(0, 2)) b.texte = b.texte.replace("?</h2>", "</h2>");
    expect(checkTitles(article).some((e) => e.includes("H2 en question"))).toBe(true);
  });

  it("ratio h2 exactement 60", () => {
    const article = makeArticle();
    article.contenu[0].texte = article.contenu[0].texte.replace("?</h2>", "</h2>");
    expect(checkTitles(article)).toEqual([]); // 3/5
  });
});

describe("TL;DR, nettoyage HTML", () => {
  it("tldr style supprime par sanitize", () => {
    const a = makeArticle({
      introduction:
        "<div class='tldr-box' style='background:#f0f4ff'><p style='margin:0'>Points clés :</p><ul><li>a</li><li>b</li><li>c</li></ul></div><p>Intro</p>",
    });
    expect(checkTldr(a).length).toBeGreaterThan(0); // avant nettoyage : refusé
    sanitizeArticle(a);
    expect(a.introduction).not.toContain("style");
    expect(a.introduction.startsWith('<div class="tldr-box"><p>Points clés')).toBe(true);
    expect(checkTldr(a)).toEqual([]);
  });

  it("tldr absente", () => {
    expect(checkTldr(makeArticle({ introduction: "<p>Intro</p>" })).length).toBeGreaterThan(0);
  });
});

describe("liens", () => {
  it("liens sortants et internes", () => {
    const article = makeArticle();
    article.contenu[0].texte +=
      '<p><a href="https://www.legifrance.gouv.fr/">Légifrance</a> ' +
      '<a href="https://blog.concurrent.fr/article">concurrent</a> ' +
      '<a href="https://www.ffbatiment.fr/barometre">baromètre</a> ' +
      '<a href="https://tim-management.co/inexistante/">page</a> ' +
      '<a href="/logiciel-pointage/">ok</a></p>';
    // la conclusion de l'article type a ses propres liens
    const errors = checkLinks(article, FAITS_FFB, ["https://tim-management.co/logiciel-pointage/"])[0].filter((e) => e.startsWith("[bloc 1]"));
    expect(errors).toHaveLength(3);
    expect(errors.some((e) => e.includes("page d'accueil") && e.includes("legifrance"))).toBe(true);
    expect(errors.some((e) => e.includes("concurrent.fr"))).toBe(true);
    expect(errors.some((e) => e.includes("inexistante"))).toBe(true);
  });

  it("check links accepte service public gouv fr", () => {
    for (const url of ["https://entreprendre.service-public.gouv.fr/vosdroits/F2302", "https://www.service-public.gouv.fr/particuliers/vosdroits/F2258"]) {
      const art: Article = { introduction: `<p><a href="${url}">fiche</a></p>`, contenu: [], faq: [] };
      expect(checkLinks(art, [])[0], url).toEqual([]);
    }
    // un domaine qui imite le site officiel reste refusé
    const art: Article = { introduction: '<p><a href="https://www.service-public-infos.com/f">x</a></p>', contenu: [], faq: [] };
    expect(checkLinks(art, [])[0].length).toBeGreaterThan(0);
  });

  const SITEMAP = ["https://tim-management.co/contact", "https://tim-management.co/plannings-ouvriers"];

  it.each([
    "https://cms.tim-management.co/wp-content/uploads/2026/10/tableau-rentabilite-chantier.xlsx",
    "https://cms.tim-management.co/wp-content/uploads/2026/10/modele-pv-levee-des-reserves.pdf",
  ])("check links accepte fichiers mediatheque : %s", (url) => {
    const art: Article = { introduction: `<p><a href="${url}">fichier</a></p>`, contenu: [], faq: [] };
    expect(checkLinks(art, [], SITEMAP)[0]).toEqual([]);
  });

  it("check links refuse page du cms", () => {
    const art: Article = { introduction: '<p><a href="https://cms.tim-management.co/?p=123">page</a></p>', contenu: [], faq: [] };
    expect(checkLinks(art, [], SITEMAP)[0].some((e) => e.includes("absent du sitemap"))).toBe(true);
  });

  it("concurrent nomme permis lien interdit", () => {
    const article = makeArticle();
    article.conclusion += "<p>Des outils comme Skello ou Kalitics existent, et l'export vers Sage reste possible.</p>";
    expect(checkCompetitorLinks(article)).toEqual([]);
    article.conclusion +=
      '<p><a href="https://www.skello.io/tarifs">Skello</a> ' +
      '<a href="https://combohr.com/fr">Combo</a> <a href="https://www.sage.com/fr-fr/">Sage</a> ' +
      '<a href="https://www.kalitics.com/offre-logiciel-btp">Kalitics</a></p>';
    const errors = checkCompetitorLinks(article); // Kalitics : partenaire, lien permis
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("skello");
    expect(errors[1]).toContain("combohr");
    article.sources = [{ libelle: "Skello", url: "https://www.skello.io/blog/x" }];
    expect(checkCompetitorLinks(article, true).some((e) => e.includes("[sources]"))).toBe(true);
  });
});

describe("fan-out, médias", () => {
  it("fanout valide", () => {
    expect(checkFanout(makeArticle())).toEqual([]);
  });

  it("fanout trop court et h2 inconnu", () => {
    const article = makeArticle({ sous_requetes: [{ requete: "x", h2: "H2 inexistant" }] });
    const errors = checkFanout(article);
    expect(errors.some((e) => e.includes("attendu 5-8"))).toBe(true);
    expect(errors.some((e) => e.includes("non couverte"))).toBe(true);
  });

  it("medias avertissements non bloquants", () => {
    const article = makeArticle({ images: [], video: { titre: "t", script: words(40) } });
    const report = validateArticle(article, [], "");
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.includes("images"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("video"))).toBe(true);
  });

  it("script video soumis aux faits", () => {
    const article = makeArticle({
      video: { titre: "Le pointage multi-chantiers en 90 secondes", script: words(150) + " Selon l'INSEE, 40 % des salariés du BTP travaillent sur plusieurs sites." },
    });
    expect(validateArticle(article, [], "").errors.some((e) => e.includes("vidéo script"))).toBe(true);
  });

  it("article valide complet", () => {
    const sitemap = [
      "https://tim-management.co/",
      "https://tim-management.co/pointage-digital-mobile-chantier",
      "https://tim-management.co/actualite/pointage-multi-chantiers",
      "https://tim-management.co/contact",
    ];
    expect(validateArticle(makeArticle(), [], "", sitemap, { keyword: "pointage multi chantiers" }).errors).toEqual([]);
  });
});

describe("JSON et primitives", () => {
  it.each(['{"a": 1}', '```json\n{"a": 1}\n```', 'Voici le JSON :\n{"a": 1}\nBonne lecture'])("parse json response : %j", (raw) => {
    expect(parseJsonResponse(raw)).toEqual({ a: 1 });
  });

  it("parse json response invalide", () => {
    expect(() => parseJsonResponse("pas de json")).toThrow();
  });

  it("split sentences civilite", () => {
    expect(splitSentences("<p>M. Dupont gère 12 chantiers. Il pointe.</p>")).toEqual(["M. Dupont gère 12 chantiers.", "Il pointe."]);
  });

  it("extract numbers", () => {
    expect(extractNumbers("72 %, 1 800 mots, 4,20 € et 2024")).toEqual(new Set(["72", "1800", "4.2", "2024"]));
  });
});

describe("faits de référence : aucun pointage hors connexion", () => {
  it.each([
    "Le pointage fonctionne en mode hors ligne.",
    "Privilégiez une application hors-ligne avec synchronisation.",
    "Les heures sont saisies hors connexion puis envoyées.",
    "Une application offline évite les pertes de données.",
    "L'outil propose un mode déconnecté sur chantier.",
    "Les ouvriers peuvent pointer sans réseau grâce à l'application.",
  ])("hors connexion refuse : %s", (phrase) => {
    const article = makeArticle();
    article.contenu[1].texte += `<p>${phrase}</p>`;
    const errs = checkOffline(article);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toContain("hors connexion");
    expect(validateArticle(article, []).errors.some((e) => e.includes("hors connexion"))).toBe(true);
  });

  it.each(["introduction", "conclusion"] as const)("hors connexion refuse partout : %s", (champ) => {
    const article = makeArticle();
    article[champ] += "<p>Un mode hors ligne est disponible.</p>";
    expect(checkOffline(article).length).toBeGreaterThan(0);
  });

  it("hors connexion refuse en faq", () => {
    const article = makeArticle();
    article.faq[0].text += "<p>L'application stocke les données sans réseau.</p>";
    expect(checkOffline(article).length).toBeGreaterThan(0);
  });

  it("zone sans reseau sans promesse acceptee", () => {
    const article = makeArticle();
    article.contenu[1].texte += "<p>Testez la couverture : certains chantiers sont en zone sans réseau.</p>";
    article.faq[0].titre = "Comment gérer le suivi de chantier dans une zone sans réseau ?";
    expect(checkOffline(article)).toEqual([]);
  });

  it("article standard sans hors connexion", () => {
    expect(checkOffline(makeArticle())).toEqual([]);
  });
});

describe("règle de marque (inversée le 18/11/2026 : « TIM Management »)", () => {
  // Python (12/10/2026) refusait « TIM Management » et « TIM management ». Correction décidée le
  // 18/11/2026 : seule « TIM Management » est correcte ; les trois tests Python sont inversés.
  it.each(["Tim Management", "TIM management", "tim management"])("check brand refuse ancienne forme : %s", (forme) => {
    const art: Article = { title: "Titre", introduction: `<p>Avec ${forme}, les heures remontent.</p>`, contenu: [], faq: [] };
    const errors = checkBrand(art);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain(forme);
    expect(errors[0]).toContain("écrire « TIM Management »");
  });

  it("check brand accepte TIM Management", () => {
    const art: Article = {
      title: "Titre",
      introduction: "<p>Avec TIM Management, les heures remontent.</p>",
      contenu: [],
      faq: [{ titre: "TIM ?", text: "<p>TIM Management propose un planning.</p>" }],
    };
    expect(checkBrand(art)).toEqual([]);
  });

  it("validate article inclut check brand", () => {
    const article = makeArticle({ conclusion: "<p>Découvrez Tim Management.</p>" });
    expect(validateArticle(article, [], "").errors.some((e) => e.includes("TIM Management"))).toBe(true);
  });
});

describe("capsules : seules les positions de capsule comptent (03/11/2026)", () => {
  const CAPS =
    "Le jour de fractionnement est un congé supplémentaire accordé au salarié qui prend une partie de son congé principal hors de la période du 1er mai au 31 octobre, selon les règles supplétives du Code du travail et les conditions propres à la caisse de congés payés du BTP.";

  it("etiquette en gras dans une puce n est pas une capsule", () => {
    const art: Article = {
      contenu: [{ texte: `<h2>Quand ?</h2><p><strong>${CAPS}</strong></p><ul><li><strong>Jour férié</strong> : il ne bloque pas.</li></ul>` }],
      faq: [{ titre: "Q ?", text: `<p><strong>${CAPS}</strong> Voir aussi <strong>la caisse</strong>.</p>` }],
    };
    expect(iterCapsules(art).map(([w]) => w)).toEqual(["bloc 1", "FAQ 1"]);
    expect(checkCapsules(art)).toEqual([]);
  });

  it("unwrap retire le gras hors capsule et garde le texte", () => {
    const art = {
      contenu: [{ texte: `<h2>Quand ?</h2><p><strong>${CAPS}</strong></p><ul><li><strong>Jour férié</strong> : il ne bloque pas.</li></ul>` }],
      faq: [{ titre: "Q ?", text: `<p><strong>${CAPS}</strong> Voir <strong>la caisse</strong>.</p>` }],
    };
    unwrapArticleStrong(art);
    expect(art.contenu[0].texte).toContain("<li>Jour férié : il ne bloque pas.</li>");
    expect(art.contenu[0].texte.split("<strong>").length - 1).toBe(1);
    expect(art.faq[0].text.split("<strong>").length - 1).toBe(1);
    expect(art.faq[0].text).toContain("Voir la caisse.");
  });

  it("faq sans capsule en tete est refusee", () => {
    const art: Article = { contenu: [], faq: [{ titre: "Q ?", text: `<p>Réponse. <strong>${CAPS}</strong></p>` }] };
    expect(checkCapsules(art).some((e) => e.includes("Réponse sans capsule"))).toBe(true);
  });

  it("note des avis refusee", () => {
    for (const phrase of ["TIM Management est noté 4,9/5 en moyenne des avis Google.", "Une note de 4,9 sur 34 avis.", "Cinq étoiles sur l’App Store."]) {
      const art: Article = { introduction: `<p>${phrase}</p>`, contenu: [], faq: [], conclusion: "" };
      expect(checkRating(art).length, phrase).toBeGreaterThan(0);
    }
    const art: Article = { introduction: "<p>Le pointage se fait en 3 étapes, sur 5 chantiers.</p>", contenu: [], faq: [], conclusion: "" };
    expect(checkRating(art)).toEqual([]);
  });
});

describe("cannibalisation", () => {
  const SITE = [
    "https://tim-management.co/actualite/difference-jours-ouvrables-et-jours-ouvres",
    "https://tim-management.co/actualite/feuille-d-heures-vierge",
    "https://tim-management.co/actualite/categorie/feuilles-d-heures",
    "https://tim-management.co/plannings-engins",
  ];

  it("cannibalisation article publie", () => {
    const c = cannibalizationConflicts("jours ouvrables ouvrés btp", SITE);
    expect(c).toHaveLength(1);
    expect(c[0]).toContain("difference-jours-ouvrables-et-jours-ouvres");
  });

  it("cannibalisation mots generiques et categories ignores", () => {
    // « feuille d'heures » est commun à tout le site : pas de conflit sur ces seuls mots
    expect(cannibalizationConflicts("feuille heures intérim btp", SITE)).toEqual([]);
    // seules les URL /actualite/ (hors catégories) comptent
    expect(cannibalizationConflicts("planning engins chantier", SITE)).toEqual([]);
  });

  it("cannibalisation autre ligne du sheet", () => {
    const rows = [{ id: "90", keyword: "travail nuit btp", status: "Publié", slug: "/actualite/x" }];
    const c = cannibalizationConflicts("feuille heures travail nuit btp", [], rows);
    expect(c).toHaveLength(1);
    expect(c[0]).toContain("ligne 90");
  });
});

describe("structure SEO/GEO (03/11/2026)", () => {
  const SEO = { keyword: "pointage multi chantiers" };

  it("h1 et saut de niveau refuses", () => {
    const article = makeArticle();
    article.contenu[0].texte = "<h1>Titre</h1>" + article.contenu[0].texte;
    article.contenu[1].texte += "<h4>Détail</h4>";
    const errors = checkHeadings(article);
    expect(errors.some((e) => e.includes("<h1>"))).toBe(true);
    expect(errors.some((e) => e.includes("H2 -> H4"))).toBe(true);
  });

  it("meta yoast et mot cle en ouverture", () => {
    const article = makeArticle();
    expect(checkSeoMeta(article, SEO.keyword)).toEqual([[], []]);
    expect(checkKeywordIntro(article, SEO.keyword)).toEqual([]);
    // Longueurs : Google ne fixe pas de limite -> avertissement seulement
    article.yoast_title = "Pointage multi-chantiers : " + "méthode complète ".repeat(4);
    article.yoast_description = "x".repeat(170);
    const [errors, warnings] = checkSeoMeta(article, SEO.keyword);
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(2);
    // Bloquant : mot-clé absent du title, description vide
    article.yoast_title = "Titre sans le sujet";
    article.yoast_description = "";
    expect(checkSeoMeta(article, SEO.keyword)[0]).toHaveLength(2);
    article.introduction = article.introduction.replace("Le pointage multi-chantiers", "Cette méthode");
    expect(checkKeywordIntro(article, SEO.keyword).length).toBeGreaterThan(0);
  });

  it("maillage minimum produit ancres et liens imposes", () => {
    const article = makeArticle();
    expect(checkInternalLinking(article)).toEqual([]);
    expect(checkInternalLinking(article, ["https://tim-management.co/plannings-ouvriers"]).some((e) => e.includes("obligatoire absent"))).toBe(true);
    article.conclusion = '<p><a href="https://tim-management.co/actualite/a">ici</a></p>';
    const errors = checkInternalLinking(article);
    expect(errors.some((e) => e.includes("minimum 3"))).toBe(true);
    expect(errors.some((e) => e.includes("page produit"))).toBe(true);
    expect(errors.some((e) => e.includes("Ancre non descriptive"))).toBe(true);
  });

  it("longueur et traces ia", () => {
    const article = makeArticle();
    const [errors, warnings] = checkLength(article, 2000);
    expect(errors).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
    article.conclusion += "<p>En tant que modèle de langage, je n'ai pas accès aux données.</p>";
    expect(checkAiTraces(article).length).toBeGreaterThan(0);
  });

  it("controles seo seulement a la generation", () => {
    const article = makeArticle({ yoast_title: "" });
    expect(validateArticle(article, [], "").errors.some((e) => e.includes("yoast_title"))).toBe(false);
    expect(validateArticle(article, [], "", null, SEO).errors.some((e) => e.includes("yoast_title"))).toBe(true);
  });

  it("resolution pilier maillage et articles voisins", () => {
    const sitemap = [
      "https://tim-management.co/plannings-ouvriers",
      "https://tim-management.co/pointage-digital-mobile-chantier",
      "https://tim-management.co/actualite/pointage-multi-chantiers",
      "https://tim-management.co/actualite/categorie/pointage",
    ];
    expect(resolveSiteUrls("Pilier pointage, /plannings-ouvriers, article géolocalisé, /inconnue", sitemap)).toEqual(["https://tim-management.co/plannings-ouvriers"]);
    expect(relatedArticles("pointage multi employeur btp", sitemap)).toEqual(["https://tim-management.co/actualite/pointage-multi-chantiers"]);
  });

  it("temps reel legitime pas une trace ia", () => {
    const article = makeArticle();
    article.conclusion += "<p>Le suivi de chantier donne accès aux données en temps réel.</p>";
    expect(checkAiTraces(article)).toEqual([]);
  });
});
