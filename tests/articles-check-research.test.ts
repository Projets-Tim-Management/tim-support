/**
 * Portage des tests de verify_facts de tim-management/tests/test_research.py (pages lues simulées).
 * Non porté : test_recherche_bout_en_bout_avec_pause (boucle d'appels à l'API et trace sur disque, hors
 * du périmètre des fonctions pures). Plus les cas non couverts en Python (socle-code.md, § 2.9 et 11).
 */
import { describe, expect, it } from "vitest";

import { fetchedPages, flat, formatCell, parseFaitsSources, researchDomains, verifyFacts } from "@/modules/editorial/lib/articles/check";

const PAGE_URL = "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020517";
const PAGE_TEXT =
  "Article L3171-4. En cas de litige relatif à l'existence ou au nombre d'heures de travail " +
  "accomplies, l'employeur fournit au juge les éléments de nature à justifier les horaires " +
  "effectivement réalisés par le salarié. Le juge forme sa conviction au vu de ces éléments " +
  "et de ceux fournis par le salarié, après avoir ordonné, en cas de besoin, toutes les " +
  "mesures d'instruction qu'il estime utiles. Les documents sont conservés pendant 3 ans.";
const EXTRAIT = "l'employeur fournit au juge les éléments de nature à justifier les horaires effectivement réalisés par le salarié";

function fetchBlock(url = PAGE_URL, text = PAGE_TEXT) {
  return {
    type: "web_fetch_tool_result",
    tool_use_id: "x",
    content: { type: "web_fetch_result", url, content: { type: "document", source: { type: "text", media_type: "text/plain", data: text } as Record<string, string> } },
  };
}

function fact(kw: Record<string, unknown> = {}) {
  return {
    fait: "En cas de litige sur les heures, l'employeur fournit au juge les éléments justifiant les horaires réalisés.",
    extrait: EXTRAIT,
    source: "Légifrance, Code du travail, article L3171-4",
    url: PAGE_URL,
    annee: "2016",
    ...kw,
  };
}

describe("verify_facts (research.py)", () => {
  it("fait fidele retenu", () => {
    const [kept, rejected] = verifyFacts([fact()], fetchedPages([fetchBlock()]));
    expect(kept).toHaveLength(1);
    expect(rejected).toEqual([]);
    expect(kept[0].url).toBe(PAGE_URL);
    expect(kept[0].annee).toBe("2016");
  });

  it.each([
    [{ extrait: "l'employeur fournit au juge un relevé signé chaque semaine par le salarié concerné" }, "mot pour mot"],
    [{ url: "https://www.legifrance.gouv.fr/autre-page" }, "non lue"],
    [{ url: "https://www.legisocial.fr/page" }, "domaine"],
    [{ url: "https://www.legifrance.gouv.fr/" }, "accueil"],
    [{ fait: "Les documents sont conservés 5 ans." }, "nombre"],
  ])("faits ecartes : %j → %s", (override, reason) => {
    const [kept, rejected] = verifyFacts([fact(override)], fetchedPages([fetchBlock()]));
    expect(kept).toEqual([]);
    expect(rejected[0][1]).toContain(reason);
  });

  it("pdf sans texte ecarte", () => {
    const pdf = fetchBlock();
    pdf.content.content.source = { type: "base64", media_type: "application/pdf", data: "JVBE" };
    const [kept, rejected] = verifyFacts([fact()], fetchedPages([pdf]));
    expect(kept).toEqual([]);
    expect(rejected[0][1]).toContain("PDF");
  });

  it("cellule relue par le sheet", () => {
    const cell = formatCell([
      { fait: "A", source: "Légifrance", url: PAGE_URL, annee: "2016" },
      { fait: "B", source: "Urssaf", url: "https://www.urssaf.fr/x", annee: "" },
    ]);
    const [faits, invalides] = parseFaitsSources(cell);
    expect(invalides).toEqual([]);
    expect(faits.map((f) => f.fait)).toEqual(["A", "B"]);
    expect(faits[1].annee).toBe("");
  });

  it("page en markdown", () => {
    const md =
      "## Suivi\n- En cas de litige, l'employeur fournit au juge les éléments de nature à justifier les horaires " +
      "effectivement réalisés par le salarié ([article L3171-4](https://www.legifrance.gouv.fr/x)) .\n";
    const f = fact({
      extrait: "l'employeur fournit au juge les éléments de nature à justifier les horaires effectivement réalisés par le salarié (article L3171-4).",
    });
    const [kept, rejected] = verifyFacts([f], fetchedPages([fetchBlock(PAGE_URL, md)]));
    expect(kept, JSON.stringify(rejected)).toHaveLength(1);
  });

  it("domaine ajoute pour la ligne", () => {
    const url = "https://aide.cegid.com/paie/import-variables";
    const page = fetchBlock(url);
    const [kept, rejected] = verifyFacts([fact({ url })], fetchedPages([page]));
    expect(kept).toEqual([]);
    expect(rejected[0][1]).toContain("domaine");
    const [keptAvecDomaine] = verifyFacts([fact({ url })], fetchedPages([page]), ["cegid.com"]);
    expect(keptAvecDomaine).toHaveLength(1);
    // Python vérifiait aussi _tools(["cegid.com"])[1]["allowed_domains"] : la liste vient de researchDomains
    expect(researchDomains(["cegid.com"])).toContain("cegid.com");
  });

  it("site concurrent refuse meme si domaine ajoute", () => {
    const url = "https://www.skello.io/blog/pointage";
    const [kept, rejected] = verifyFacts([fact({ url })], fetchedPages([fetchBlock(url)]), ["skello.io"]);
    expect(kept).toEqual([]);
    expect(rejected[0][1]).toContain("concurrent");
  });
});

describe("verify_facts : cas non couverts par les tests Python", () => {
  const pages = () => fetchedPages([fetchBlock()]);

  it("champ manquant : fait, source ou URL non http", () => {
    for (const override of [{ fait: "" }, { source: "  " }, { url: "www.legifrance.gouv.fr/x" }]) {
      const [kept, rejected] = verifyFacts([fact(override)], pages());
      expect(kept).toEqual([]);
      expect(rejected[0][1]).toBe("champ manquant");
    }
  });

  it("extrait de moins de 40 caractères écarté même s'il figure dans la page", () => {
    const [kept, rejected] = verifyFacts([fact({ extrait: "l'employeur fournit au juge" })], pages());
    expect(kept).toEqual([]);
    expect(rejected[0][1]).toContain("mot pour mot");
  });

  it("année invalide vidée, « | » remplacé, blancs repliés", () => {
    const [kept] = verifyFacts([fact({ annee: "16", fait: "En cas de litige |  l'employeur fournit\nau juge les éléments.", source: "Légifrance | Code" })], pages());
    expect(kept[0]).toEqual({ fait: "En cas de litige / l'employeur fournit au juge les éléments.", source: "Légifrance / Code", url: PAGE_URL, annee: "" });
  });

  it("plafond de 15 faits retenus", () => {
    const [kept, rejected] = verifyFacts(Array.from({ length: 20 }, () => fact()), pages());
    expect(kept).toHaveLength(15);
    expect(rejected).toEqual([]);
  });

  it("candidat qui n'est pas un objet ignoré", () => {
    expect(verifyFacts(["texte", null, 3, fact()], pages())[0]).toHaveLength(1);
  });

  it("flat : Markdown, guillemets, tirets et espace avant ponctuation", () => {
    expect(flat("> **Délai** : « 3 ans » — voir [ici](https://x.fr) ‑ fin .")).toBe('delai: " 3 ans " - voir ici - fin.');
  });
});
