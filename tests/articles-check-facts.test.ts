/**
 * Portage de tim-management/tests/test_validation.py, partie faits et sources : mêmes entrées, mêmes
 * attentes. Chaque nom de test reprend celui du test Python (sans « test_ »).
 */
import { describe, expect, it } from "vitest";

import {
  bodyText,
  buildSources,
  checkConventionFigures,
  checkFacts,
  checkLinks,
  checkSources,
  CITE_UN_CHIFFRE_RE,
  conventionDivergences,
  factUsage,
  formatFaitsForPrompt,
  formatFaitsForPromptSubset,
  isConventionTextFact,
  isHomepageUrl,
  isLegalFact,
  isOfficialSynthesisFact,
  parseFaitsSources,
  validateArticle,
  type Fait,
} from "@/modules/editorial/lib/articles/check";

import { FAIT_LEGAL, FAITS_FFB, makeArticle } from "./articles-check-fixtures";

function factsErrors(html: string, faits: Fait[] = [], cas = ""): string[] {
  return checkFacts([["t", html]], [...faits], cas)[0];
}

describe("parse_faits_sources", () => {
  it("parse faits sources lignes valides et invalides", () => {
    const cell =
      "12 h/semaine perdues | FFB | https://www.ffbatiment.fr/barometre | 2024\n" +
      "- 35 h hebdomadaires | Service-public.fr\n" +
      "\n" +
      "ligne sans séparateur\n" +
      "fait | source | url-pas-http | 2024\n" +
      "a | b | c | d | e\n" +
      "page d'accueil | Légifrance | https://www.legifrance.gouv.fr/ | 2026";
    const [faits, invalides] = parseFaitsSources(cell);
    expect(faits).toEqual([
      { fait: "12 h/semaine perdues", source: "FFB", url: "https://www.ffbatiment.fr/barometre", annee: "2024" },
      { fait: "35 h hebdomadaires", source: "Service-public.fr", url: "", annee: "" },
    ]);
    expect(invalides).toHaveLength(4);
  });

  it("parse faits sources vide", () => {
    expect(parseFaitsSources("")).toEqual([[], []]);
    expect(parseFaitsSources(null)).toEqual([[], []]);
  });

  it("build sources uniquement depuis faits et dedoublonne", () => {
    const faits = [...FAITS_FFB, { ...FAITS_FFB[0], fait: "autre fait" }];
    expect(buildSources(faits, new Set([0, 1, 7]))).toEqual([
      { libelle: "FFB, baromètre digitalisation BTP", url: "https://www.ffbatiment.fr/barometre", date: "2024" },
    ]);
  });

  it("build sources sans url ou accueil aucune ligne et dedoublonne sur url", () => {
    const faits: Fait[] = [
      { fait: "a", source: "Service-Public, fiche F2391 « Heures sup »", url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F2391", annee: "2026" },
      { fait: "b", source: "Service-Public, fiche F2391", url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F2391/", annee: "2025" },
      { fait: "c", source: "Code du travail", url: "", annee: "" },
      { fait: "d", source: "Urssaf", url: "https://www.urssaf.fr/", annee: "" },
    ];
    expect(buildSources(faits, new Set([0, 1, 2, 3]))).toEqual([
      { libelle: "Service-Public, fiche F2391 « Heures sup »", url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F2391", date: "2026" },
    ]);
  });

  it.each([
    ["https://www.urssaf.fr", true],
    ["https://www.urssaf.fr/", true],
    ["https://www.legifrance.gouv.fr/?x=1", true],
    ["https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020517", false],
  ])("is homepage url : %s → %s", (url, accueil) => {
    expect(isHomepageUrl(url)).toBe(accueil);
  });
});

describe("garde-fou : chiffre cité ⇒ au moins une source précise", () => {
  const SOURCE_PRECISE = { libelle: "Service-Public, fiche F2391", url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F2391", date: "2026" };

  it.each([
    [[]],
    [[{ libelle: "Urssaf", url: "https://www.urssaf.fr/", date: "" }]],
    [[{ libelle: "Code du travail", url: "", date: "" }]],
  ])("garde fou chiffre sans source precise bloque (%j)", (sources) => {
    const article = makeArticle();
    article.contenu[0].texte += "<p>Les heures supplémentaires sont majorées de 25 %.</p>";
    article.sources = sources;
    const errors = checkSources(article);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("sources");
  });

  it("garde fou chiffre avec source precise passe", () => {
    const article = makeArticle();
    article.contenu[0].texte += "<p>Les heures supplémentaires sont majorées de 25 %.</p>";
    article.sources = [SOURCE_PRECISE];
    expect(checkSources(article)).toEqual([]);
  });

  it.each([
    "<p>En 2026, la planification reste un enjeu.</p>",
    "<h2>Quelle méthode en 2026 ?</h2>",
    "<h3>1. Définir les objectifs</h3><h3>2) Structurer les tâches</h3>",
    "<p>Étape 3 : affecter les équipes.</p>",
  ])("garde fou annee ou numero d etape passe : %s", (texte) => {
    const article = makeArticle();
    article.contenu[0].texte += texte;
    article.sources = [];
    expect(checkSources(article)).toEqual([]);
  });

  it.each([
    "<p>En 2026, les heures supplémentaires sont majorées de 25 %.</p>",
    "<p>Le plafond est de 2026 € par an.</p>",
    "<p>La durée annuelle est de 1 607 heures.</p>",
    "<h3>1. Prévoir 10 heures par jour au plus</h3>",
    "<p>Selon l'Insee, l'activité progresse.</p>",
  ])("garde fou vrai chiffre toujours bloque : %s", (texte) => {
    const article = makeArticle();
    article.contenu[0].texte += texte;
    article.sources = [];
    expect(checkSources(article)).toHaveLength(1);
  });

  it("garde fou sans chiffre passe", () => {
    const article = makeArticle();
    article.sources = [];
    expect(CITE_UN_CHIFFRE_RE.test(bodyText(article))).toBe(false);
    expect(checkSources(article)).toEqual([]);
  });
});

describe("anti-invention : chiffres, organismes", () => {
  it("cas audit ffb sans faits rejete", () => {
    const errors = factsErrors("<p>Les conducteurs perdent 12 h/semaine (source FFB, baromètre digitalisation BTP 2024).</p>");
    expect(errors.some((e) => e.includes("FFB"))).toBe(true);
  });

  it("pourcentage sans fait rejete", () => {
    const errors = factsErrors("<p>72 % des PME du BTP citent la consolidation comme premier irritant.</p>");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("72");
  });

  it("pourcentage attribue organisme absent rejete", () => {
    const errors = factsErrors("<p>D'après la Fédération Française du Bâtiment, 72 % des PME sont concernées.</p>", FAITS_FFB);
    expect(errors.some((e) => e.includes("72"))).toBe(true);
  });

  it("fait present accepte et marque utilise", () => {
    const [errors, used] = checkFacts([["t", "<p>Selon la FFB, les conducteurs de travaux perdent 12 h par semaine (2024).</p>"]], FAITS_FFB, "");
    expect(errors).toEqual([]);
    expect(used).toEqual(new Set([0]));
  });

  it("ffb nom long equivaut acronyme", () => {
    const faits = [{ ...FAITS_FFB[0], source: "FFB" }];
    expect(factsErrors("<p>D'après la Fédération française du bâtiment, 12 h sont perdues (2024).</p>", faits)).toEqual([]);
  });

  it("organisme seul sans chiffre rejete", () => {
    const errors = factsErrors("<p>L'OPPBTP recommande un accueil sécurité pour chaque nouvel arrivant.</p>");
    expect(errors.some((e) => e.includes("OPPBTP"))).toBe(true);
  });

  it("quantites neutres tolerees", () => {
    const html =
      "<p>Le déploiement se fait en 3 étapes.</p><p>La durée légale reste de 35 h par semaine.</p>" +
      "<p>Selon la taille du chantier, comptez 2 à 3 jours de formation.</p>";
    expect(factsErrors(html)).toEqual([]);
  });

  it("attribution vague rejetee", () => {
    const errors = factsErrors("<p>Selon une étude récente, la majorité des artisans ont adopté le digital.</p>");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Attribution");
  });

  it("etude de sol non consideree comme attribution", () => {
    expect(factsErrors("<p>Une étude de sol est prévue avant les 3 phases du chantier.</p>")).toEqual([]);
    // le montant, lui, est un chiffre à sourcer (27/09)
    const errors = factsErrors("<p>Une étude de sol coûte 2 000 € environ.</p>");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Montant en euros");
    expect(errors[0]).not.toContain("Attribution");
  });
});

describe("références légales", () => {
  it("reference legale sans ligne legifrance rejetee", () => {
    const errors = factsErrors("<p>Le décompte est obligatoire (article L3171-4 du Code du travail).</p>");
    expect(errors.some((e) => e.includes("Référence légale"))).toBe(true);
  });

  it("reference legale avec ligne legifrance acceptee", () => {
    const [errors, used] = checkFacts([["t", "<p>Le décompte est obligatoire (article L. 3171-4 du Code du travail).</p>"]], [FAIT_LEGAL], "");
    expect(errors).toEqual([]);
    expect(used).toEqual(new Set([0]));
  });

  it("reference legale non correspondante rejetee", () => {
    const errors = factsErrors("<p>Voir l'article L3121-4 sur les temps de trajet.</p>", [FAIT_LEGAL]);
    expect(errors.some((e) => e.includes("Référence légale"))).toBe(true);
  });

  it("convention collective exige ligne officielle", () => {
    const html = "<p>La convention collective du bâtiment prévoit des indemnités de trajet.</p>";
    expect(factsErrors(html).length).toBeGreaterThan(0);
    const fait = {
      fait: "Convention collective nationale des ouvriers du bâtiment : indemnités de trajet",
      source: "Légifrance",
      url: "https://www.legifrance.gouv.fr/conv_coll",
      annee: "",
    };
    expect(factsErrors(html, [fait])).toEqual([]);
  });

  it("reference legale source non officielle rejetee", () => {
    const fait = { ...FAIT_LEGAL, source: "Blog RH", url: "https://blog.example.com/l3171" };
    expect(factsErrors("<p>Voir l'article L3171-4.</p>", [fait]).length).toBeGreaterThan(0);
  });
});

describe("entreprises, personnes, témoignages", () => {
  it("entreprise inventee rejetee", () => {
    const errors = factsErrors("<h2>Cas concret : Maçonnerie Rivoira et ses chantiers actifs</h2>");
    expect(errors.some((e) => e.includes("Maçonnerie Rivoira"))).toBe(true);
  });

  it("entreprise presente dans cas client acceptee", () => {
    const cas = "Maçonnerie Rivoira (Lyon) utilise TIM depuis 2025 pour ses chantiers.";
    expect(factsErrors("<p>L'entreprise Maçonnerie Rivoira pointe désormais sur mobile.</p>", [], cas)).toEqual([]);
  });

  it.each([
    "<p>M. Dupont a réduit ses ressaisies.</p>",
    "<p>Jean Martin, gérant d'une PME de gros œuvre, a changé de méthode.</p>",
    "<p>La société Batifer a digitalisé ses feuilles d'heures.</p>",
    "<p>Chez Durand Construction, le pointage est quotidien.</p>",
    "<p>La SARL Morel a adopté le pointage mobile.</p>",
  ])("personnes et entreprises hors cas client rejetees : %s", (html) => {
    expect(factsErrors(html).length).toBeGreaterThan(0);
  });

  it("marque tim management autorisee", () => {
    expect(factsErrors("<p>Chez Tim Management, le pointage est pensé pour le terrain.</p>")).toEqual([]);
    // forme de marque en vigueur depuis le 18/11/2026 : également admise comme entité
    expect(factsErrors("<p>Chez TIM Management, le pointage est pensé pour le terrain.</p>")).toEqual([]);
  });

  it("temoignage sans cas client rejete", () => {
    const errors = factsErrors("<p>Un conducteur de travaux témoigne de son quotidien.</p>");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Témoignage");
  });

  it("regression article audite", () => {
    const article = makeArticle();
    article.introduction +=
      "<p>Les conducteurs de travaux perdent en moyenne 12 heures par semaine (source FFB, baromètre digitalisation BTP 2024).</p>";
    article.contenu[0].texte += "<p>D'après la FFB, 72 % des PME du BTP citent la consolidation.</p>";
    article.contenu[1].texte += "<h3>Cas concret : Maçonnerie Rivoira</h3>";
    const joined = validateArticle(article, [], "").errors.join("\n");
    expect(joined).toContain("FFB");
    expect(joined).toContain("Maçonnerie Rivoira");
  });
});

// ── Phrases combinant plusieurs faits (test réel R97, 27/09/2026) ────────────

const FAITS_R97: Fait[] = [
  {
    fait: "Cotisation maladie employeur 2026 : 13 % sur la totalité du salaire, le taux réduit de 7 % est supprimé au 1er janvier 2026",
    source: "economie.gouv.fr, RGDU",
    url: "",
    annee: "2026",
  },
  {
    fait: "Allocations familiales employeur 2026 : 5,25 % sur la totalité du salaire, le taux réduit de 3,45 % est supprimé au 1er janvier 2026",
    source: "economie.gouv.fr, RGDU",
    url: "",
    annee: "2026",
  },
  {
    fait:
      "Affiliation à une caisse de congés payés du BTP (réseau CIBTP) obligatoire pour toute entreprise relevant des conventions " +
      "collectives du BTP dès le premier salarié, articles D3141-12 à D3141-20 du code du travail",
    source: "CIBTP, cadre juridique",
    url: "https://www.cibtp.fr/",
    annee: "2026",
  },
];

describe("phrases combinant plusieurs faits (R97)", () => {
  it("phrase combinant deux faits acceptee", () => {
    const html = "<p>En 2026, la cotisation maladie employeur atteint 13 % et les allocations familiales 5,25 %, sur la totalité du salaire.</p>";
    const [errors, used] = checkFacts([["t", html]], FAITS_R97, "");
    expect(errors).toEqual([]);
    expect(used).toEqual(new Set([0, 1]));
  });

  it("phrase combinee taux reduits acceptee", () => {
    const html = "<p>Le taux réduit maladie de 7 % et le taux réduit d'allocations familiales de 3,45 % sont supprimés.</p>";
    expect(checkFacts([["t", html]], FAITS_R97, "")[0]).toEqual([]);
  });

  it("nombre d un fait detourne hors contexte rejete", () => {
    // 13 existe dans le fait maladie, mais la phrase ne partage aucun mot significatif avec lui
    expect(checkFacts([["t", "<p>13 % des PME du bâtiment utilisent un logiciel.</p>"]], FAITS_R97, "")[0].length).toBeGreaterThan(0);
  });

  it("combinaison avec un nombre inconnu rejetee", () => {
    const html = "<p>La cotisation maladie atteint 13 % et les allocations familiales 6 % du salaire.</p>";
    expect(checkFacts([["t", html]], FAITS_R97, "")[0].length).toBeGreaterThan(0);
  });

  it("prompt signale reference legale non citable", () => {
    const lines = formatFaitsForPrompt(FAITS_R97).split("\n");
    expect(lines[2]).toContain("n'en cite PAS la référence légale");
    expect(lines[0]).not.toContain("⚠");
    expect(lines[1]).not.toContain("⚠");
  });

  it("reference legale source cibtp toujours rejetee", () => {
    const html = "<p>Cette obligation est encadrée par les articles D3141-12 à D3141-20 du code du travail.</p>";
    expect(checkFacts([["t", html]], FAITS_R97, "")[0].some((e) => e.includes("Référence légale"))).toBe(true);
  });

  it("pluriel compte comme contexte", () => {
    // Faux positif du test R97 (script vidéo) : « taux réduits » face à « taux réduit »
    expect(checkFacts([["t", "<p>Fini le seuil des taux réduits à 7 % et 3,45 %.</p>"]], FAITS_R97, "")[0]).toEqual([]);
  });

  it("convention collective pluriel couverte par ligne legifrance", () => {
    const fait = {
      fait:
        "Article D3141-12 du code du travail : l'affiliation à une caisse de congés payés est obligatoire pour les employeurs " +
        "exerçant une activité relevant des conventions collectives du BTP",
      source: "Légifrance, code du travail, article D3141-12",
      url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000020572124",
      annee: "2026",
    };
    const html =
      "<p>L'affiliation à une caisse CIBTP est obligatoire pour toute entreprise soumise aux conventions collectives du BTP, dès le premier salarié.</p>" +
      "<p>Voir la convention collective du bâtiment.</p><p>Article D3141-12 du code du travail.</p>";
    const [errors, used] = checkFacts([["t", html]], [...FAITS_R97, fait], "");
    expect(errors).toEqual([]);
    expect(used.has(3)).toBe(true);
  });
});

describe("faits utilisés sans chiffre, suggestion au retry", () => {
  it("fact usage raisons", () => {
    const faits: Fait[] = [
      ...FAITS_R97,
      { fait: "Tarification AT/MP collective sous 20 salariés", source: "Assurance Maladie, ameli.fr", url: "https://www.ameli.fr/atmp", annee: "2026" },
      { fait: "Contributions formation collectées par Constructys", source: "Constructys", url: "https://www.constructys.fr/x", annee: "2026" },
    ];
    const article = makeArticle();
    article.contenu[0].texte += "<p>L'Assurance Maladie fixe une tarification collective sous 20 salariés.</p>";
    article.sources = [{ libelle: "Constructys", url: "https://www.constructys.fr/x", date: "2026" }];
    const usage = factUsage(article, faits, new Set([0]), new Set([1]));
    expect(usage[0]).toEqual(["chiffre/référence"]);
    expect(usage[1]).toEqual(["déclaré par le modèle"]);
    expect(usage[3]).toContain("source citée");
    expect(usage[4]).toContain("URL dans sources");
    expect(2 in usage).toBe(false);
  });

  it("format faits subset garde la numerotation", () => {
    const txt = formatFaitsForPromptSubset([
      [0, FAITS_R97[0]],
      [10, FAITS_R97[1]],
    ]);
    expect(txt.startsWith("[1] Cotisation maladie")).toBe(true);
    expect(txt).toContain("\n[11] Allocations familiales");
  });
});

// ── Montants en euros (27/09) ─────────────────────────────────────────────────

const FAITS_EUROS: Fait[] = [
  { fait: "Plafond mensuel de la sécurité sociale 2026 : 4 005 € (annuel 48 060 €, journalier 220 €)", source: "Service-Public Entreprendre, fiche F2302", url: "", annee: "2026" },
  { fait: "SMIC au 1er janvier 2026 : 12,02 € brut/heure, 1 823,03 € brut/mois pour 151,67 h", source: "info.gouv.fr", url: "", annee: "2026" },
  { fait: "Cotisation maladie employeur 2026 : 13 % sur la totalité du salaire", source: "economie.gouv.fr", url: "", annee: "2026" },
];

function euroCheck(html: string): [string[], string[], Set<number>] {
  const warnings: string[] = [];
  const [errors, used] = checkFacts([["t", html]], FAITS_EUROS, "", warnings);
  return [errors, warnings, used];
}

describe("montants en euros", () => {
  it("euro source accepte", () => {
    const [errors, warnings, used] = euroCheck("<p>Le plafond mensuel de la sécurité sociale est de 4 005 € en 2026.</p>");
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(used).toEqual(new Set([0]));
  });

  it("euro arrondi accepte", () => {
    const [errors, warnings] = euroCheck("<p>Le SMIC mensuel brut est de 1 823 euros au 1er janvier.</p>");
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("euro invente rejete", () => {
    const [errors] = euroCheck("<p>Le plafond mensuel de la sécurité sociale atteint 4 100 € en 2026.</p>");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("4100");
  });

  it("euro calcule depuis faits avertissement", () => {
    // 1 823,03 € × 13 % = 236,99 € : calcul de faits sourcés -> avertissement, pas erreur
    const [errors, warnings] = euroCheck("<p>Sur un SMIC, la cotisation maladie représente environ 236,99 € par mois.</p>");
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Montant calculé");
  });

  it("euro salaire d exemple invente rejete", () => {
    const [errors] = euroCheck("<p>Pour un salarié payé 2 537 € brut, la cotisation maladie est de 13 %.</p>");
    expect(errors.some((e) => e.includes("2537"))).toBe(true);
  });

  it("euro hors contexte rejete", () => {
    // 220 € existe dans les faits (plafond journalier) mais pas dans ce contexte
    const [errors] = euroCheck("<p>Une nacelle se loue 220 € la journée.</p>");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validate article remonte les avertissements euros", () => {
    const article = makeArticle();
    article.contenu[0].texte += "<p>Sur un SMIC, la cotisation maladie représente environ 236,99 € par mois.</p>";
    const report = validateArticle(article, FAITS_EUROS, "");
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.includes("Montant calculé"))).toBe(true);
  });

  it("montants multiples non recolles", () => {
    const [errors, warnings, used] = euroCheck(
      "<p>Le plafond mensuel de la sécurité sociale 2026 est fixé à 4 005 €, soit 48 060 € par an et 220 € par jour.</p>",
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(used).toEqual(new Set([0]));
  });

  it("plafond annuel calcule est un calcul", () => {
    // 4 005 € × 12 = 48 060 € ; ici sans le libellé « annuel » des faits -> reste couvert en direct
    const [errors] = euroCheck("<p>Sur douze mois, le plafond de la sécurité sociale représente 48 060 €.</p>");
    expect(errors).toEqual([]);
  });
});

// ── Chiffres conventionnels : texte de la convention sur Légifrance ──────────

const KALI = "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000038022692";
const CTN = "https://code.travail.gouv.fr/contribution/1597-heures-supplementaires";
const FAIT_TEXTE: Fait = {
  fait: "[contingent bâtiment] 265 heures par salarié, augmenté de 35 heures sans annualisation (300 heures)",
  source: "Légifrance, accord national du 6 novembre 1998, Titre II",
  url: KALI,
  annee: "2018",
};
const FAIT_SYNTHESE: Fait = {
  fait: "[contingent bâtiment] Contingent de 180 heures (ouvriers du bâtiment)",
  source: "Code du travail numérique, ouvriers du bâtiment",
  url: CTN,
  annee: "2026",
};

describe("chiffres conventionnels", () => {
  it("chiffre conventionnel sans texte legifrance rejete", () => {
    const faits = [{ ...FAIT_SYNTHESE, fait: "Contingent de 180 heures (ouvriers du bâtiment)" }]; // pas de [sujet] commun
    const [missing] = checkConventionFigures("La convention collective fixe le contingent à 180 heures.", faits);
    expect(missing).toEqual(new Set(["180"]));
  });

  it("chiffre conventionnel couvert par le texte", () => {
    const [missing, used] = checkConventionFigures("Selon l'accord national, le contingent est de 265 heures.", [FAIT_TEXTE]);
    expect(missing).toEqual(new Set());
    expect(used).toEqual(new Set([0]));
  });

  it("chiffre conventionnel de synthese admis si divergence declaree", () => {
    const sent = "Le Code du travail numérique retient 180 heures, la convention collective consolidée 265 heures.";
    const [missing, used] = checkConventionFigures(sent, [FAIT_TEXTE, FAIT_SYNTHESE]);
    expect(missing).toEqual(new Set());
    expect(used).toEqual(new Set([0, 1]));
  });

  it("phrase sans convention non concernee", () => {
    expect(checkConventionFigures("Le contingent légal est de 220 heures.", [])).toEqual([new Set(), new Set()]);
  });

  it("numero d article n est pas un chiffre conventionnel", () => {
    const [missing] = checkConventionFigures("La convention collective renvoie à l'article L3121-33.", []);
    expect(missing).toEqual(new Set());
  });

  it("divergence texte et synthese detectee", () => {
    const motifs = conventionDivergences([FAIT_TEXTE, FAIT_SYNTHESE]);
    expect(motifs).toHaveLength(1);
    expect(motifs[0]).toContain("180");
    expect(motifs[0]).toContain("contingent batiment");
  });

  it("pas de divergence si memes chiffres ou sujets differents", () => {
    const meme = { ...FAIT_SYNTHESE, fait: "[contingent bâtiment] 265 heures, 300 heures sans annualisation" };
    const autreSujet = { ...FAIT_SYNTHESE, fait: "[contingent TP] 220 heures" };
    expect(conventionDivergences([FAIT_TEXTE, meme])).toEqual([]);
    expect(conventionDivergences([FAIT_TEXTE, autreSujet])).toEqual([]);
  });

  it("code travail numerique lien et reference legale acceptes", () => {
    const fait = { fait: "Article L3121-38 : contrepartie de 50 % / 100 %", source: "Code du travail numérique", url: "https://code.travail.gouv.fr/code-du-travail/l3121-38", annee: "2026" };
    const article = makeArticle();
    article.contenu[0].texte += "<p>Voir l'<a href=\"https://code.travail.gouv.fr/code-du-travail/l3121-36\">article L3121-36</a>.</p>";
    expect(checkLinks(article, [])[0]).toEqual([]);
    const [errs, used] = checkFacts([["bloc", "<p>L'article L3121-38 fixe le taux.</p>"]], [fait]);
    expect(errs).toEqual([]);
    expect(used).toEqual(new Set([0]));
  });
});

// ── Montants d'un exemple de calcul ──────────────────────────────────────────

const EXEMPLE =
  "<h3>Cas d'usage chantier</h3>" +
  "<p>Hypothèse : un maçon rémunéré 16 € brut de l'heure effectue 45 heures.</p>" +
  "<ul><li>35 heures normales : 35 × 16 = 560 €</li>" +
  "<li>8 heures majorées : 8 × 16 × 1,25 = 160 €</li>" +
  "<li>2 heures majorées : 2 × 16 × 1,50 = 48 €</li></ul>" +
  "<p>Soit un brut hebdomadaire de 768 €, au lieu de 45 × 16 = 720 € sans majoration.</p>";

function euroErrors(html: string): string[] {
  return checkFacts([["bloc", html]], [], "")[0].filter((e) => e.includes("€") || e.includes("Calcul"));
}

describe("exemples de calcul", () => {
  it("exemple de calcul explicite et juste accepte", () => {
    expect(euroErrors(EXEMPLE)).toEqual([]);
  });

  it("exemple de calcul faux rejete", () => {
    const errs = euroErrors(EXEMPLE.replace("= 160 €", "= 170 €"));
    expect(errs.some((e) => e.includes("Calcul faux") && e.includes("170"))).toBe(true);
  });

  it("montant hors passage d hypothese toujours rejete", () => {
    const sansMarqueur = EXEMPLE.replace("Hypothèse : un", "Un");
    expect(euroErrors(sansMarqueur).some((e) => e.includes("Montant en euros absent"))).toBe(true);
  });

  it("passage d hypothese s arrete au prochain intertitre", () => {
    const html = EXEMPLE + "<h3>Coût</h3><p>Le logiciel coûte 768 € par an.</p>";
    expect(euroErrors(html).some((e) => e.includes("768"))).toBe(true);
  });

  it("montant non calcule dans l exemple rejete", () => {
    const html = EXEMPLE.replace("Soit un brut", "Avec une prime de 50 €, soit un brut");
    expect(euroErrors(html).some((e) => e.includes("50") && e.includes("Montant en euros absent"))).toBe(true);
  });

  it.each([
    "Sauf disposition conventionnelle contraire, l'employeur informe le salarié par un document annexé, qui signale dès 7 heures l'ouverture du droit.",
    "Sauf dispositions conventionnelles contraires, la majoration est de 25 % pour les 8 premières heures.",
    "Sauf stipulation contraire, la semaine débute le lundi à 0 heure et le repos est de 35 heures.",
    "Sauf accord contraire, la majoration est de 25 % pour les 8 premières heures.",
    "À défaut de précision conventionnelle contraire, le document est annexé au bulletin dès 7 heures.",
  ])("formule de reserve ne declenche pas la regle conventionnelle : %s", (sentence) => {
    expect(checkConventionFigures(sentence, [])).toEqual([new Set(), new Set()]);
  });

  it("formule de reserve n excuse pas un vrai chiffre conventionnel", () => {
    const sent = "Sauf disposition conventionnelle contraire, la convention collective fixe le contingent à 180 heures.";
    const [missing] = checkConventionFigures(sent, []);
    expect(missing).toEqual(new Set(["180"]));
  });
});

describe("texte des liens et règle des références légales", () => {
  it("texte de lien n est pas une reference legale", () => {
    const html =
      '<p>En savoir plus : <a href="https://tim-management.co/actualite/convention-collective-btp">convention collective BTP ouvriers, ETAM et cadres</a>.</p>';
    expect(checkFacts([["bloc", html]], [], "")[0]).toEqual([]);
  });

  it("reference legale hors lien toujours controlee", () => {
    const html = '<p>La convention collective fixe ces règles. Voir <a href="https://tim-management.co/actualite/x">notre article</a>.</p>';
    expect(checkFacts([["bloc", html]], [], "")[0].some((e) => e.includes("Référence légale"))).toBe(true);
  });

  it("lien vers un article de loi ne dispense pas de source quand le texte le cite hors lien", () => {
    const html = '<p>L’article L3122-8 s’applique (<a href="https://code.travail.gouv.fr/code-du-travail/l3122-8">voir</a>).</p>';
    expect(checkFacts([["bloc", html]], [], "")[0].some((e) => e.includes("Référence légale"))).toBe(true);
  });

  it("texte de lien externe reste une citation controlee", () => {
    const html = '<p>Voir l’<a href="https://code.travail.gouv.fr/code-du-travail/l3122-8">article L3122-8 du Code du travail</a>.</p>';
    expect(checkFacts([["bloc", html]], [], "")[0].some((e) => e.includes("Référence légale"))).toBe(true);
    const fait = { fait: "Article L3122-8", source: "Code du travail", url: "https://code.travail.gouv.fr/code-du-travail/l3122-8", annee: "2026" };
    const [errs, used] = checkFacts([["bloc", html]], [fait], "");
    expect(errs).toEqual([]);
    expect(used).toEqual(new Set([0]));
  });
});

describe("domaines service-public et sources légales (12/10/2026)", () => {
  it.each([
    "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020517",
    "https://entreprendre.service-public.gouv.fr/vosdroits/F2302",
    "https://www.service-public.gouv.fr/particuliers/vosdroits/F2258",
    "https://code.travail.gouv.fr/code-du-travail/r8222-1",
  ])("source legale acceptee par domaine : %s", (url) => {
    expect(isLegalFact({ fait: "x", source: "Fiche", url })).toBe(true);
  });

  it.each(["https://www.service-public-infos.com/fiche", "https://legifrance-gouv.example.com/x", "https://legifrance.gouv.fr.example.com/x"])(
    "source legale refusee domaine imite : %s",
    (url) => {
      expect(isLegalFact({ fait: "x", source: "Légifrance", url })).toBe(false);
    },
  );

  it("ligne sans url jamais source legale", () => {
    const fait = { fait: "Majoration de 25 % (article L3121-36)", source: "Légifrance", url: "", annee: "2026" };
    expect(isLegalFact(fait)).toBe(false);
    expect(factsErrors("<p>La majoration est prévue par l’article L3121-36.</p>", [fait]).length).toBeGreaterThan(0);
    expect(formatFaitsForPrompt([fait])).toContain("n'en cite PAS la référence légale");
  });

  it.each(["https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000038022692", "https://www.legifrance.gouv.fr/affichIDCC.do?idConvention=KALICONT000005635221"])(
    "texte convention accepte sur legifrance : %s",
    (url) => {
      expect(isConventionTextFact({ fait: "x", source: "Convention", url })).toBe(true);
    },
  );

  it.each([
    "https://legifrance.gouv.fr.example.com/conv_coll/article/KALIARTI000038022692",
    "https://www.legifrance-gouv.example.com/conv_coll/x",
    "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020517",
    "",
  ])("texte convention refuse hors legifrance ou hors convention : %s", (url) => {
    expect(isConventionTextFact({ fait: "x", source: "Légifrance conv_coll KALIARTI", url })).toBe(false);
  });

  it("synthese officielle acceptee par domaine", () => {
    for (const url of [
      "https://code.travail.gouv.fr/contribution/1597-heures-supplementaires",
      "https://www.service-public.gouv.fr/particuliers/vosdroits/F2391",
      "https://travail-emploi.gouv.fr/heures-supplementaires",
    ]) {
      expect(isOfficialSynthesisFact({ fait: "x", source: "Fiche", url }), url).toBe(true);
    }
  });

  it.each(["https://www.service-public-infos.com/fiche", "https://code.travail.gouv.fr.example.com/x", ""])(
    "synthese officielle refusee domaine imite ou sans url : %s",
    (url) => {
      expect(isOfficialSynthesisFact({ fait: "x", source: "Service-Public", url })).toBe(false);
    },
  );
});
