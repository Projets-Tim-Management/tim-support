import { describe, expect, it } from "vitest";

import { autoFixArticle, fixBrand, removeSentence } from "@/modules/editorial/lib/articles/autofix";

describe("correction automatique des erreurs bloquantes (tiroir)", () => {
  it("réécrit la marque dans le texte, jamais dans les balises", () => {
    expect(fixBrand('<p>Avec Tim Management et tim management, <a href="https://tim-management.co/Tim">Tim</a>.</p>')).toBe('<p>Avec TIM Management et TIM Management, <a href="https://tim-management.co/Tim">TIM Management</a>.</p>');
    expect(fixBrand("<p>TIM Management reste tel quel.</p>")).toBe("<p>TIM Management reste tel quel.</p>");
  });
  it("retire la phrase citée, apostrophes typographiques et balises comprises", () => {
    const html = "<p>Avant. Des outils comme Tim proposent ça, mais la méthode compte avant l&rsquo;outil.</p>";
    expect(removeSentence(html, "Des outils comme Tim proposent ça, mais la méthode compte avant l’outil.")).toBe("<p>Avant.</p>");
    expect(removeSentence(html, "Phrase absente de ce texte")).toBeNull();
  });
  it("article : phrase de promesse retirée puis marque corrigée partout", () => {
    const acf = { introduction: "<p>Un. Des outils comme Tim Management offrent un mois gratuit.</p>", contenu: [{ texte: "<p>Tim Management aide.</p>" }], conclusion: "<p>Fin.</p>", faq: [{ titre: "Tim ?", text: "<p>Oui.</p>" }] };
    const r = autoFixArticle(acf, ["[introduction] Promesse générique interdite : « Des outils comme Tim Management offrent un mois gratuit. »"]);
    expect(r.removed).toBe(1);
    expect(r.notFound).toEqual([]);
    expect(r.acf.introduction).toBe("<p>Un.</p>");
    expect((r.acf.contenu as { texte: string }[])[0].texte).toBe("<p>TIM Management aide.</p>");
    expect((r.acf.faq as { titre: string }[])[0].titre).toBe("TIM Management ?");
    expect(acf.introduction).toContain("Tim Management"); // l'original n'est pas modifié
  });
});

describe("correction automatique : la phrase suivante est préservée (relecture du 19/11/2026)", () => {
  it("citation complète : seule cette phrase part", () => {
    expect(removeSentence("<p>Nous garantissons zéro erreur. Le planning est simple.</p>", "Nous garantissons zéro erreur.")).toBe("<p>Le planning est simple.</p>");
  });
  it("citation coupée par « … » : la fin de la phrase part aussi, pas la suivante", () => {
    expect(removeSentence("<p>Nous garantissons zéro erreur sur toute la paie du mois. Le planning est simple.</p>", "Nous garantissons zéro erreur…")).toBe("<p>Le planning est simple.</p>");
  });
});

describe("passages à surligner et phrases « démonstration »", () => {
  it("cite la forme fautive de la marque, et la phrase pour les autres alertes", async () => {
    const { quotedPassages } = await import("@/modules/editorial/admin/highlightIssues");
    expect(
      quotedPassages([
        "[introduction] Marque mal écrite : « Tim Management » — écrire « TIM Management »",
        "[FAQ 4 réponse] « Demandez une démonstration » interdit : lien vers /contact : « Pour vérifier cela, demandez une démonstration sur un marché public type. »",
        "[bloc 2] Promesse générique interdite : « Une phrase très longue coupée… »",
      ]),
    ).toEqual(["Tim Management", "Pour vérifier cela, demandez une démonstration sur un marché public type.", "Une phrase très longue coupée"]);
  });
  it("« Corriger automatiquement » retire aussi la phrase « demandez une démonstration »", () => {
    const r = autoFixArticle({ faq: [{ titre: "Q ?", text: "<p>Réponse utile. Pour vérifier cela, demandez une démonstration sur un marché public type.</p>" }] }, [
      "[FAQ 1 réponse] « Demandez une démonstration » interdit : lien vers /contact : « Pour vérifier cela, demandez une démonstration sur un marché public type. »",
    ]);
    expect(r.removed).toBe(1);
    expect((r.acf.faq as { text: string }[])[0].text).toBe("<p>Réponse utile.</p>");
  });
});
