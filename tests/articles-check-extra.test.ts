/**
 * Cas sans test côté Python (socle-code.md, § 11) et points fragiles du portage (§ 12) : comportement
 * attendu = celui de validation.py / generator.py (vérifié en comparant les sorties des deux versions).
 */
import { describe, expect, it } from "vitest";

import {
  buildTldr,
  checkFacts,
  checkHeadings,
  checkInternalLinking,
  checkLength,
  checkLinks,
  checkMediaProposals,
  checkRefresh,
  checkSeoMeta,
  checkTitles,
  checkTldr,
  checkTldrNoNewFacts,
  hypothesisAmounts,
  norm,
  readingTime,
  splitSentences,
  stripTags,
  unescape,
  wordCount,
  type Article,
  type Fait,
} from "@/modules/editorial/lib/articles/check";
import { pyFixed, pyRound, urlSplit } from "@/modules/editorial/lib/articles/check/py";

import { capsule, makeArticle, words } from "./articles-check-fixtures";

const errorsOf = (html: string, faits: Fait[] = [], cas = "") => checkFacts([["t", html]], faits, cas)[0];
const LEGAL = (fait: string): Fait => ({ fait, source: "Légifrance", url: "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000000001", annee: "2026" });

describe("structure : cas non couverts", () => {
  it.each([
    [2, "TL;DR : 2 points (attendu 3-5)"],
    [6, "TL;DR : 6 points (attendu 3-5)"],
  ])("TL;DR de %i points refusée", (n, msg) => {
    const items = Array.from({ length: n }, (_, i) => `<li>${i}</li>`).join("");
    expect(checkTldr({ introduction: `<div class="tldr-box"><ul>${items}</ul></div>` })).toEqual([msg]);
  });

  it("H1 vide et aucun H2", () => {
    expect(checkTitles({ title: "  ", contenu: [] })).toEqual(["H1 vide", "Aucun H2 dans le contenu"]);
  });

  it("premier intertitre différent d'un H2", () => {
    expect(checkHeadings({ contenu: [{ texte: "<h3>A</h3><h2>B</h2><h4>C</h4>" }] })).toEqual([
      "Contenu : le premier intertitre est un H3 (H2 attendu)",
      "Contenu : saut de niveau H2 -> H4",
    ]);
  });

  it("avertissement au-delà de 5 liens internes", () => {
    const links = Array.from({ length: 6 }, (_, i) => `<a href="/p${i}">p</a>`).join(" ");
    expect(checkLinks({ introduction: `<p>${links}</p>` }, [])[1]).toEqual(["6 liens internes (max recommandé : 5)"]);
  });

  it("longueur inférieure à 300 mots : erreur", () => {
    expect(checkLength({ introduction: words(120) })[0]).toEqual(["Longueur : 120 mots (minimum 300)"]);
  });

  it("titre et description Yoast vides séparément", () => {
    const article = makeArticle();
    expect(checkSeoMeta({ ...article, yoast_title: "" }, "pointage")[0]).toEqual(["yoast_title vide"]);
    expect(checkSeoMeta({ ...article, yoast_description: "<p> </p>" }, "pointage")[0]).toEqual(["yoast_description vide"]);
  });

  it("propositions de médias : alt manquant et position inconnue", () => {
    const article = makeArticle({
      images: [
        { description_visuelle: "Schéma", alt: "" },
        { description_visuelle: "Photo", alt: "Chantier", position_apres_h2: "H2 inconnu" },
      ],
    });
    expect(checkMediaProposals(article)).toEqual(["image 1 : description_visuelle/alt manquant", "image 2 : position_apres_h2 ne correspond à aucun H2"]);
  });

  it("ancres non descriptives autres que « ici »", () => {
    const article = makeArticle();
    article.conclusion += '<p><a href="/logiciel-pointage">En savoir plus.</a> <a href="/planning">Cliquez ici :</a></p>';
    const weak = checkInternalLinking(article).filter((e) => e.includes("Ancre non descriptive"));
    expect(weak).toHaveLength(2);
  });
});

describe("faits : cas non couverts", () => {
  it("« Cas pratique : » ouvre un exemple de calcul", () => {
    const [accepted, errors] = hypothesisAmounts("<p>Cas pratique : 2,5 × 4 = 10 €. Puis 3 − 1 = 2 €.</p>");
    expect(errors).toEqual([]);
    expect(Array.from(accepted.values())[1]).toEqual(new Set([10, 2]));
    expect(errorsOf("<p>Cas pratique : 2,5 × 4 = 10 €.</p>")).toEqual([]);
  });

  it.each([
    ["<p>La loi n° 2008-789 l'impose.</p>", "Loi n° 2008-789 du 20 août 2008"],
    ["<p>Le décret n°2016-1551 le précise.</p>", "Décret n° 2016-1551 du 18 novembre 2016"],
    ["<p>L'arrêté du 3 mai 2002 fixe le modèle.</p>", "Arrêté du 3 mai 2002"],
  ])("motifs loi, décret, arrêté : %s", (html, faitTexte) => {
    expect(errorsOf(html).some((e) => e.includes("Référence légale"))).toBe(true);
    expect(errorsOf(html, [LEGAL(faitTexte)])).toEqual([]);
  });

  it.each(["<p>Rivoira SAS a équipé ses équipes.</p>", "<p>Rénovation Martin a équipé ses équipes.</p>", "<p>Établissements Durand Frères a équipé ses équipes.</p>"])(
    "entités : forme juridique en suffixe et raisons sociales accentuées (%s)",
    (html) => {
      const errors = errorsOf(html);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("absente de CAS CLIENT");
    },
  );

  it("raison sociale accentuée relevée en entier (\\w Unicode de Python)", () => {
    expect(errorsOf("<p>Électricité Dupont intervient.</p>")[0]).toContain("« Électricité Dupont »");
  });

  it.each(["<p>Le chef d'équipe nous confie son avis.</p>", "<p>« C'est simple », raconte-t-il.</p>", "<p>Selon son gérant, tout va bien.</p>"])(
    "témoignage sans cas client : %s",
    (html) => {
      expect(errorsOf(html).some((e) => e.includes("Témoignage"))).toBe(true);
      expect(errorsOf(html, [], "Cas client : SARL X").some((e) => e.includes("Témoignage"))).toBe(false);
    },
  );
});

describe("reprise : TL;DR et parties régénérées (generator.py)", () => {
  const legacy = () => {
    const a = makeArticle({ introduction: "<p style='color:red'>Introduction existante sur le pointage.</p>" });
    a.contenu[0].texte += "<p>72 % des PME pointent encore sur papier.</p>";
    return a;
  };

  it("tldr refuse chiffre du contenu non source (test_refresh_queue)", () => {
    const tldr = buildTldr(["72 % des PME pointent encore sur papier", "Deux", "Trois"]);
    expect(checkTldrNoNewFacts(tldr, legacy(), []).some((e) => e.includes("72"))).toBe(true);
  });

  it("tldr refuse nombre absent du contenu (test_refresh_queue)", () => {
    const tldr = buildTldr(["Le déploiement prend 17 jours", "Deux", "Trois"]);
    expect(checkTldrNoNewFacts(tldr, legacy(), []).some((e) => e.includes("absent") && e.includes("17"))).toBe(true);
  });

  it("buildTldr échappe & < > et retire les balises", () => {
    expect(buildTldr(["<b>A & B</b> < C", "D"])).toBe('<div class="tldr-box"><p>Points clés :</p><ul><li>A &amp; B  &lt; C</li><li>D</li></ul></div>');
  });

  it("checkRefresh : 4 à 6 questions, capsule cherchée n'importe où dans la réponse", () => {
    const article = makeArticle();
    article.faq = [{ titre: "Q ?", text: `<p>Intro. <strong>${capsule(45).replace(/<\/?(p|strong)>/g, "")}</strong></p>` }];
    expect(checkRefresh(article)).toEqual(["FAQ : 1 questions (attendu 4-6)"]);
  });
});

describe("primitives Python (points fragiles)", () => {
  it("html.unescape : entités HTML5, sans « ; », numériques invalides", () => {
    expect(unescape("&eacute;t&eacute; &eacute &#233; &#x1F600; &#128; &#0; &notit; &ampx &#xD800; &#1114112; &zzz;")).toBe(
      "été é é 😀 € � ¬it; &x � � &zzz;",
    );
  });

  it("strip_tags remplace la balise par un espace PUIS décode (« &lt;b&gt; » reste du texte)", () => {
    expect(stripTags("<b>4</b>,9 &lt;b&gt;x&lt;/b&gt;")).toBe(" 4 ,9 <b>x</b>");
  });

  it("norm : NFKD, sans marques, œ conservé", () => {
    expect(norm("  Œuvre ½ ² ﬁn  d’été  ")).toBe("œuvre 1⁄2 2 fin d'ete");
  });

  it("word_count : blancs Unicode, chaîne vide = 0", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("25 % 1 800")).toBe(4);
  });

  it("split_sentences : lignes de tableau, abréviations", () => {
    expect(splitSentences("<table><tr><th>Taux</th><td>25 %</td></tr></table><p>Voir l'art. L3121. Dr. House.</p>")).toEqual(["Taux ; 25 % ;", "Voir l'art. L3121.", "Dr. House."]);
  });

  it("arrondi au pair sur la valeur exacte (round et format de Python)", () => {
    expect([0.125, 0.375, 1.245, 2.675, -0.125].map((x) => pyFixed(x, 2))).toEqual(["0.12", "0.38", "1.25", "2.67", "-0.12"]);
    expect([0.5, 1.5, 2.5].map((x) => pyRound(x))).toEqual([0, 2, 2]);
  });

  it("temps de lecture : 575 mots / 230 = 2,5 → 2 min (Math.round donnerait 3)", () => {
    expect(readingTime({ introduction: words(575) })).toBe("2 min");
    expect(readingTime({ introduction: words(805) })).toBe("4 min");
    expect(readingTime({})).toBe("1 min");
  });

  it("urlsplit : pas d'exception, hôte en minuscules sans port, espace de tête = pas d'hôte", () => {
    expect(urlSplit("HTTPS://u:p@WWW.Exemple.FR:8080/A?b=1#c")).toMatchObject({ hostname: "www.exemple.fr", path: "/A", query: "b=1" });
    expect(urlSplit("/logiciel").hostname).toBeNull();
    expect(urlSplit(" https://a.fr/x").hostname).toBeNull();
    expect(urlSplit("1ab:cd").path).toBe("1ab:cd");
  });

  it("lien dont le href commence par un espace : ni interne ni sortant (comme Python 3.9)", () => {
    const art: Article = { introduction: '<p><a href=" https://blog.exemple.fr/x">x</a></p>' };
    expect(checkLinks(art, [])).toEqual([[], []]);
  });
});
