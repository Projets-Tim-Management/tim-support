import { describe, expect, it } from "vitest";

import { parseRecommendations, quoteInPage, screenRecommendations, type RuleRecommendation } from "@/modules/editorial/lib/articles/rules-review";
import { applyRuleChange, isOfficialUrl, touchesSocle } from "@/modules/editorial/lib/articles/rules-text";

const RULES = `# Règles

## B. Règles de rédaction

### B3. Corps
9. Chaque section est autonome (150 à 300 mots).
10. Capsule = réponse complète.

### B6. FAQ, liens, métadonnées
23. FAQ : 4 à 6 vraies questions.

## C. Pièges
1. Conservation : 1 an.`;

describe("appliquer une recommandation au texte des règles", () => {
  it("modification : le passage cité mot pour mot est remplacé", () => {
    const out = applyRuleChange(RULES, { kind: "modification", part: "B6", currentText: "23. FAQ : 4 à 6 vraies questions.", proposedText: "23. FAQ : 5 à 8 vraies questions." });
    expect(out.ok && out.text).toContain("23. FAQ : 5 à 8 vraies questions.");
    expect(out.ok && out.text).not.toContain("4 à 6");
  });
  it("retrait : le passage disparaît", () => {
    const out = applyRuleChange(RULES, { kind: "retrait", part: "B3", currentText: "10. Capsule = réponse complète." });
    expect(out.ok && out.text).not.toContain("Capsule");
  });
  it("ajout : à la fin de la section, avant la section suivante", () => {
    const out = applyRuleChange(RULES, { kind: "ajout", part: "B3", anchor: "### B3. Corps", proposedText: "11. Un tableau par comparaison." });
    expect(out.ok).toBe(true);
    if (out.ok) {
      const t = out.text;
      expect(t.indexOf("11. Un tableau")).toBeGreaterThan(t.indexOf("10. Capsule"));
      expect(t.indexOf("11. Un tableau")).toBeLessThan(t.indexOf("### B6."));
    }
  });
  it("ajout à la dernière section du texte, titre sans les #", () => {
    const out = applyRuleChange(RULES, { kind: "ajout", part: "C", anchor: "C. Pièges", proposedText: "2. Contingent : jamais unique." });
    expect(out.ok && out.text.trim().endsWith("2. Contingent : jamais unique.")).toBe(true);
  });
  it("passage introuvable, ambigu ou section absente : rien ne change", () => {
    expect(applyRuleChange(RULES, { kind: "modification", part: "B6", currentText: "texte qui n'existe pas", proposedText: "x" })).toMatchObject({ ok: false });
    expect(applyRuleChange(RULES + "\n9. Chaque section est autonome (150 à 300 mots).", { kind: "retrait", part: "B3", currentText: "9. Chaque section est autonome (150 à 300 mots)." })).toMatchObject({ ok: false });
    expect(applyRuleChange(RULES, { kind: "ajout", part: "B9", anchor: "### B9. Inconnue", proposedText: "x" })).toMatchObject({ ok: false });
  });
  it("le socle (partie A) devient un développement ; les domaines officiels sont reconnus", () => {
    expect(touchesSocle("A1")).toBe(true);
    expect(touchesSocle("B3")).toBe(false);
    expect(isOfficialUrl("https://developers.google.com/search/docs/appearance/ai-features")).toBe(true);
    expect(isOfficialUrl("https://help.openai.com/en/articles/x")).toBe(true);
    expect(isOfficialUrl("https://google.com.evil.fr/x")).toBe(false);
  });
});

describe("recommandations de Sergey", () => {
  const reply = `<synthese>Google a précisé ses consignes.</synthese><recommandations>[
    {"titre":"Un tableau par comparaison","partie":"b3","type":"ajout","section":"### B3. Corps","texteNouveau":"11. Un tableau.","pourquoi":"…","effet":"…","preuves":[{"url":"https://developers.google.com/search/docs/x","source":"Google","date":"2026-11-01","niveau":"officiel","citation":"Use tables to present comparisons clearly."}]},
    {"titre":"Blog prétendu officiel","partie":"B6","type":"modification","texteActuel":"23. FAQ : 4 à 6 vraies questions.","texteNouveau":"23. FAQ : 6 questions.","preuves":[{"url":"https://unblog-seo.fr/faq","niveau":"officiel","citation":"x"}]},
    {"titre":"Sans preuve","partie":"B3","type":"ajout","section":"### B3. Corps","texteNouveau":"x","preuves":[]}
  ]</recommandations>`;
  it("lit les recommandations ; « officiel » seulement sur un domaine officiel ; sans preuve = écartée", () => {
    const out = parseRecommendations(reply);
    expect(out?.findings).toHaveLength(2);
    expect(out?.findings[0]).toMatchObject({ part: "B3", kind: "ajout", anchor: "### B3. Corps" });
    expect(out?.findings[0].evidence[0].level).toBe("officiel");
    expect(out?.findings[1].evidence[0].level).toBe("indice");
  });
  it("réponse illisible = null", () => {
    expect(parseRecommendations("pas de balise")).toBeNull();
  });
  it("tri : applicable à la version en vigueur, pas en attente ni refusée dans l'année", () => {
    const recs = parseRecommendations(reply)!.findings as RuleRecommendation[];
    const stale: RuleRecommendation = { ...recs[1], title: "Texte qui a changé", currentText: "ancien passage" };
    const now = new Date("2026-12-07T08:00:00Z");
    const { kept, dropped } = screenRecommendations([...recs, stale], RULES, [{ title: "Blog prétendu officiel sur la FAQ", status: "refusee", decidedAt: "2026-06-01T00:00:00Z" }], now);
    expect(kept.map((k) => k.title)).toEqual(["Un tableau par comparaison"]);
    expect(dropped.map((d) => d.title)).toEqual(["Blog prétendu officiel", "Texte qui a changé"]);
  });
  it("la citation est relue sur la page, aux accents et guillemets près", () => {
    expect(quoteInPage("Use tables to present comparisons clearly.", "<p>Tip: use tables to  present comparisons clearly. More…</p>")).toBe(true);
    expect(quoteInPage("Use tables to present comparisons clearly.", "Something else entirely about tables.")).toBe(false);
    expect(quoteInPage("court", "court")).toBe(false);
  });
});
