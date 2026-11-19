/**
 * Corrections décidées le 18/11/2026 (écarts voulus avec le pipeline Python), chacune avec ses tests :
 * a. mots vides du contexte des chiffres ; b. références légales exactes ; c. hôte interne exact ;
 * d. règle de marque inversée (« TIM Management »).
 */
import { describe, expect, it } from "vitest";

import {
  checkBrand,
  checkFacts,
  checkLinks,
  contentWords,
  internalLinks,
  isSiteHost,
  legalTokenIn,
  topicTokens,
  validateArticle,
  type Article,
  type Fait,
} from "@/modules/editorial/lib/articles/check";

import { makeArticle } from "./articles-check-fixtures";

const errorsOf = (html: string, faits: Fait[] = []) => checkFacts([["t", html]], faits, "")[0];

describe("a. contexte des chiffres : la liste de mots vides prévue pour lui", () => {
  const FAIT_CHOMAGE: Fait = { fait: "Taux de chômage selon l'Insee : 7 %", source: "Insee", url: "https://www.insee.fr/fr/statistiques/x", annee: "2025" };

  it("les mots vides du contexte (selon, taux, mois, annee, cette, plus…) ne sont pas des mots de contexte", () => {
    expect(contentWords("Selon le taux de janvier, cette année plus que jamais")).toEqual(new Set(["jamai"]));
  });

  it("« taux » seul ne rattache plus un chiffre à un fait (Python : accepté)", () => {
    const errors = errorsOf("<p>Le taux de remplissage des plannings atteint 7 %.</p>", [FAIT_CHOMAGE]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Chiffre absent de faits_sources (7)");
  });

  it("« selon » seul ne rattache plus un chiffre à un fait (Python : accepté)", () => {
    const errors = errorsOf("<p>Le remplissage atteint 7 % selon les équipes.</p>", [FAIT_CHOMAGE]);
    expect(errors.some((e) => e.includes("Chiffre absent"))).toBe(true);
  });

  it("un vrai mot de contexte partagé suffit toujours", () => {
    expect(errorsOf("<p>Le taux de chômage atteint 7 %.</p>", [FAIT_CHOMAGE])).toEqual([]);
  });

  it("la cannibalisation garde sa propre liste : « taux » et « selon » restent des mots porteurs", () => {
    expect(topicTokens("taux selon janvier")).toEqual(new Set(["tau", "selon", "janvier"])); // pluriel simple retiré : taux → tau;
  });
});

describe("b. références légales : numéro exact, pas une sous-chaîne", () => {
  const fait = (texte: string): Fait => ({ fait: texte, source: "Légifrance", url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001", annee: "2026" });

  it("« article L3171-4 » n'est pas couvert par un fait qui cite L3171-45 (Python : couvert)", () => {
    const errors = errorsOf("<p>Le décompte est obligatoire (article L3171-4).</p>", [fait("Article L3171-45 du Code du travail")]);
    expect(errors.some((e) => e.includes("Référence légale"))).toBe(true);
  });

  it("ni par un fait qui cite L3171-4-1", () => {
    const errors = errorsOf("<p>Le décompte est obligatoire (article L3171-4).</p>", [fait("Article L3171-4-1 du Code du travail")]);
    expect(errors.some((e) => e.includes("Référence légale"))).toBe(true);
  });

  it("le numéro exact suivi d'une ponctuation ou d'une lettre reste couvert", () => {
    for (const texte of ["Article L3171-4.", "Article L3171-4 : décompte", "articles L3171-4, L3171-5", "(art. L. 3171-4)"]) {
      expect(errorsOf("<p>Voir l'article L. 3171-4.</p>", [fait(texte)]), texte).toEqual([]);
    }
  });

  it("l'article L3171-45 reste couvert par son propre fait", () => {
    expect(errorsOf("<p>Voir l'article L3171-45.</p>", [fait("Article L3171-45")])).toEqual([]);
  });

  it("décret n° 2016-123 non couvert par le décret 2016-1234", () => {
    expect(errorsOf("<p>Le décret n° 2016-123 le prévoit.</p>", [fait("Décret n° 2016-1234")]).some((e) => e.includes("Référence légale"))).toBe(true);
    expect(errorsOf("<p>Le décret n° 2016-123 le prévoit.</p>", [fait("Décret n° 2016-123 du 4 février")])).toEqual([]);
  });

  it("legalTokenIn : seuls les jetons qui finissent par un chiffre sont bornés", () => {
    expect(legalTokenIn("l3171-4", "articlel3171-4ducode")).toBe(true);
    expect(legalTokenIn("l3171-4", "articlel3171-45")).toBe(false);
    expect(legalTokenIn("l3171-4", "articlel3171-4-1")).toBe(false);
    expect(legalTokenIn("decret", "decret2016-123")).toBe(true);
    expect(legalTokenIn("conventioncollective", "conventioncollectivedubatiment")).toBe(true);
  });
});

describe("c. lien interne : hôte tim-management.co ou sous-domaine, exactement", () => {
  it("isSiteHost", () => {
    expect(isSiteHost("tim-management.co")).toBe(true);
    expect(isSiteHost("www.tim-management.co")).toBe(true);
    expect(isSiteHost("CMS.Tim-Management.co")).toBe(true);
    expect(isSiteHost("faux-tim-management.co")).toBe(false);
    expect(isSiteHost("tim-management.co.example.com")).toBe(false);
    expect(isSiteHost(null)).toBe(false);
  });

  it("checkLinks : faux-tim-management.co est un lien sortant hors domaines (Python : lien interne)", () => {
    const art: Article = { introduction: '<p><a href="https://faux-tim-management.co/page">x</a></p>', contenu: [], faq: [] };
    const [errors] = checkLinks(art, []);
    expect(errors).toEqual(["[introduction] Lien sortant hors domaines autorisés : https://faux-tim-management.co/page"]);
  });

  it("checkLinks : les vrais sous-domaines restent internes et contrôlés par le sitemap", () => {
    const art: Article = { introduction: '<p><a href="https://www.tim-management.co/inconnue">x</a></p>', contenu: [], faq: [] };
    expect(checkLinks(art, [], ["https://tim-management.co/contact"])[0]).toEqual(["[introduction] Lien interne absent du sitemap : https://www.tim-management.co/inconnue"]);
  });

  it("internalLinks ignore les hôtes qui imitent le site", () => {
    const art: Article = {
      conclusion:
        '<p><a href="https://faux-tim-management.co/a">a</a> <a href="https://tim-management.co.example.com/b">b</a> ' +
        '<a href="https://www.tim-management.co/c">c</a> <a href="/d">d</a></p>',
    };
    expect(internalLinks(art).map(([, h]) => h)).toEqual(["https://www.tim-management.co/c", "https://tim-management.co/d"]);
  });

  it("checkFacts : le texte d'un lien vers un hôte imité reste une référence légale contrôlée (Python : ignoré)", () => {
    const imite = '<p>Lire <a href="https://tim-management.co.example.com/x">la convention collective du BTP</a>.</p>';
    expect(errorsOf(imite).some((e) => e.includes("Référence légale"))).toBe(true);
    const vrai = '<p>Lire <a href="https://www.tim-management.co/actualite/x">la convention collective du BTP</a>.</p>';
    expect(errorsOf(vrai)).toEqual([]);
  });
});

describe("d. marque : « TIM Management »", () => {
  const art = (introduction: string): Article => ({ title: "Titre", introduction, contenu: [], faq: [] });

  it("message exact, une erreur par forme fautive, dans l'ordre du texte", () => {
    expect(checkBrand(art("<p>Avec tim management puis Tim Management et TIM management.</p>"))).toEqual([
      "[introduction] Marque mal écrite : « tim management » — écrire « TIM Management »",
      "[introduction] Marque mal écrite : « Tim Management » — écrire « TIM Management »",
      "[introduction] Marque mal écrite : « TIM management » — écrire « TIM Management »",
    ]);
  });

  it("« Tim » employé seul est refusé", () => {
    expect(checkBrand(art("<p>Avec Tim, les heures remontent.</p>"))).toEqual(["[introduction] Marque mal écrite : « Tim » — écrire « TIM Management »"]);
  });

  it("« TIM » seul, « TIM&nbsp;Management » et les mots qui commencent par Tim sont acceptés", () => {
    expect(checkBrand(art("<p>TIM centralise les heures. TIM&nbsp;Management aussi. Timothée et TIMING, l'équipe tim-management.co.</p>"))).toEqual([]);
  });

  it("tous les champs sont contrôlés, médias compris", () => {
    const article = makeArticle({ video: { titre: "Tim en 90 secondes", script: "x" } });
    article.faq[0].titre = "Que fait Tim Management ?";
    const errors = checkBrand(article);
    expect(errors).toEqual([
      "[FAQ 1 question] Marque mal écrite : « Tim Management » — écrire « TIM Management »",
      "[vidéo titre] Marque mal écrite : « Tim » — écrire « TIM Management »",
    ]);
  });

  it("l'article type écrit « TIM Management » : aucune erreur de marque", () => {
    expect(validateArticle(makeArticle(), []).errors.filter((e) => e.includes("Marque"))).toEqual([]);
  });
});
