import { describe, expect, it } from "vitest";

import { checkFacts, checkPolicy, offersFact, type Article } from "@/modules/editorial/lib/articles/check";
import { factsOf } from "@/modules/editorial/lib/articles/writer/stages";

const faq = (n: number) => Array.from({ length: n }, (_, i) => ({ titre: `Question ${i} ?`, text: "<p><strong>Réponse.</strong></p>" }));
const article = (over: Partial<Article> = {}): Article => ({
  title: "Calcul des heures supplémentaires",
  introduction: '<div class="tldr-box"><p>Points clés :</p><ul><li>Un</li></ul></div><p>Les heures supplémentaires se comptent à la semaine.</p>',
  contenu: [{ acf_fc_layout: "texte", texte: "<h2>Comment les compter ?</h2><p><strong>Capsule.</strong></p><p>Texte.</p>" }],
  conclusion: '<p>Pour aller plus loin, <a href="https://tim-management.co/contact">contactez-nous</a>.</p>',
  faq: faq(4),
  ...over,
});

describe("règles de Charlie vérifiées par le code", () => {
  it("un article conforme passe", () => {
    expect(checkPolicy(article(), { sales: false })).toEqual({ errors: [], warnings: [] });
  });
  it("FAQ de 4 à 6 questions", () => {
    expect(checkPolicy(article({ faq: faq(3) }), { sales: false }).errors).toEqual(["FAQ : 3 question(s) (attendu 4 à 6)"]);
    expect(checkPolicy(article({ faq: faq(7) }), { sales: false }).errors[0]).toContain("7 question(s)");
  });
  it("jamais de page de démo ni « demandez une démonstration » ; /contact absent = avertissement", () => {
    const out = checkPolicy(article({ conclusion: '<p>Demandez une démonstration sur <a href="https://tim-management.co/demande-demo-suivi-temps">notre page</a>.</p>' }), { sales: false });
    expect(out.errors.join(" ")).toContain("page de demande de démo");
    expect(out.errors.join(" ")).toContain("« Demandez une démonstration » interdit");
    expect(out.warnings).toEqual(["Aucun appel à l'action vers https://tim-management.co/contact"]);
  });
  it("aucune promesse sur TIM Management", () => {
    const body = (t: string) => article({ contenu: [{ acf_fc_layout: "texte", texte: `<h2>Comment ?</h2><p><strong>Capsule.</strong></p><p>${t}</p>` }] });
    expect(checkPolicy(body("TIM Management garantit des feuilles d'heures conformes."), { sales: true }).errors[0]).toContain("Promesse sur TIM Management");
    expect(checkPolicy(body("Des outils comme TIM Management aident les équipes."), { sales: true }).errors[0]).toContain("Promesse générique");
    expect(checkPolicy(body("La loi garantit un repos de 11 heures."), { sales: false }).errors).toEqual([]);
  });
  it("article de trafic : ni dans l'introduction, une mention au plus dans le corps, aucun prix", () => {
    const intro = article({ introduction: "<p>TIM Management simplifie le pointage.</p>" });
    expect(checkPolicy(intro, { sales: false }).errors).toContain("[introduction] TIM Management dans la TL;DR ou l'introduction d'un article de trafic");
    expect(checkPolicy(intro, { sales: true }).errors).toEqual([]);
    const twice = article({ contenu: [{ texte: "<h2>A ?</h2><p>TIM Management aide.</p>" }, { texte: "<h2>B ?</h2><p>TIM Management exporte.</p>" }] });
    expect(checkPolicy(twice, { sales: false }).errors.join(" ")).toContain("cité 2 fois");
    const price = article({ contenu: [{ texte: "<h2>Prix ?</h2><p>TIM Management coûte dès 29 € HT par mois.</p>" }] });
    expect(checkPolicy(price, { sales: false }).errors.join(" ")).toContain("Prix de TIM Management dans un article de trafic");
    expect(checkPolicy(price, { sales: true }).errors).toEqual([]);
  });
  it("article de vente : un prix de /offres passe le contrôle des faits, un prix inventé non", () => {
    const offers = offersFact("Planning Dès 29 € HT/mois par entreprise. Planning + Pointage Dès 39 € HT/mois. Ajouter le module Stock +40 €/mois.");
    const [ok] = checkFacts([["bloc 1", "<p>Le module Planning de TIM Management est proposé dès 29 € HT par mois et par entreprise.</p>"]], [offers], "");
    expect(ok).toEqual([]);
    const [ko] = checkFacts([["bloc 1", "<p>Le module Planning de TIM Management est proposé dès 25 € HT par mois et par entreprise.</p>"]], [offers], "");
    expect(ko.join(" ")).toContain("Montant en euros absent de faits_sources");
  });
});

describe("faits de la fiche", () => {
  it("dans la forme du contrôle, sans les lignes incomplètes", () => {
    expect(factsOf({ facts: [{ fact: "1 an", source: "Légifrance", url: "https://www.legifrance.gouv.fr/x", year: "2026" }, { fact: "", source: "x" }] })).toEqual([{ fait: "1 an", source: "Légifrance", url: "https://www.legifrance.gouv.fr/x", annee: "2026" }]);
  });
});
