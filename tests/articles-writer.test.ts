import { describe, expect, it } from "vitest";

import { pickWritingJob, type BoardRow } from "@/modules/editorial/lib/articles/writer/pipeline";
import { extractOutline, parseSitemap } from "@/modules/editorial/lib/articles/writer/prep";
import { buildArticlePrompt, isSalesArticle, retryMessage, timReferenceRule, writerSystem, type PromptInput } from "@/modules/editorial/lib/articles/writer/prompt";

// Mardi 18/11/2026, 10 h à Paris.
const NOW = new Date("2026-11-18T09:00:00Z");

describe("ordonnancement de la rédaction", () => {
  it("finit d'abord ce qui est commencé et n'est pas verrouillé", () => {
    const rows: BoardRow[] = [
      { id: 1, status: "validee", decidedAt: "2026-11-10T10:00:00Z" },
      { id: 2, status: "redaction", writeStage: "preparation", writeStartedAt: "2026-11-17T08:00:00Z" },
    ];
    expect(pickWritingJob(rows, NOW)).toEqual({ id: 2, start: false, mode: "article" });
  });
  it("une rédaction verrouillée en cours : on attend", () => {
    const rows: BoardRow[] = [
      { id: 1, status: "validee" },
      { id: 2, status: "redaction", writeStage: "redaction", writeLockedUntil: "2026-11-18T09:05:00Z", writeStartedAt: "2026-11-17T08:00:00Z" },
    ];
    expect(pickWritingJob(rows, NOW)).toBeNull();
  });
  it("démarre l'idée validée la plus ancienne", () => {
    const rows: BoardRow[] = [
      { id: 1, status: "validee", decidedAt: "2026-11-12T10:00:00Z" },
      { id: 3, status: "validee", decidedAt: "2026-11-11T10:00:00Z" },
    ];
    expect(pickWritingJob(rows, NOW)).toEqual({ id: 3, start: true, mode: "article" });
  });
  it("un seul article commencé par jour (heure de Paris)", () => {
    const rows: BoardRow[] = [
      { id: 1, status: "validee" },
      { id: 9, status: "a-relire", writeStartedAt: "2026-11-17T23:30:00Z" }, // 00 h 30 le 18 à Paris
    ];
    expect(pickWritingJob(rows, NOW)).toBeNull();
    expect(pickWritingJob([{ id: 1, status: "validee" }, { id: 9, status: "a-relire", writeStartedAt: "2026-11-17T22:30:00Z" }], NOW)).toEqual({ id: 1, start: true, mode: "article" });
  });
  it("pause dès que 4 articles attendent la relecture", () => {
    const waiting = [1, 2, 3, 4].map((i) => ({ id: 10 + i, status: "a-relire" }));
    expect(pickWritingJob([{ id: 1, status: "validee" }, ...waiting], NOW)).toBeNull();
    expect(pickWritingJob([{ id: 1, status: "validee" }, ...waiting.slice(1)], NOW)).toEqual({ id: 1, start: true, mode: "article" });
  });
});

describe("mises à jour automatiques dans l'ordonnancement", () => {
  it("une mise à jour démarre avec son propre quota, même si un article a déjà commencé aujourd'hui", () => {
    const rows: BoardRow[] = [
      { id: 9, status: "a-relire", writeStartedAt: "2026-11-18T06:00:00Z", writeMode: "article" },
      { id: 20, status: "a-rafraichir", refreshDecidedAt: "2026-11-16T05:00:00Z" },
    ];
    expect(pickWritingJob(rows, NOW)).toEqual({ id: 20, start: true, mode: "maj" });
  });
  it("une mise à jour commencée se termine avant tout nouveau départ", () => {
    const rows: BoardRow[] = [
      { id: 1, status: "validee" },
      { id: 20, status: "a-rafraichir", writeStage: "maj", writeStartedAt: "2026-11-17T08:00:00Z", writeMode: "maj" },
    ];
    expect(pickWritingJob(rows, NOW)).toEqual({ id: 20, start: false, mode: "maj" });
  });
  it("une mise à jour par jour au plus", () => {
    const rows: BoardRow[] = [
      { id: 20, status: "a-rafraichir" },
      { id: 21, status: "publie", writeStartedAt: "2026-11-18T07:00:00Z", writeMode: "maj" },
    ];
    expect(pickWritingJob(rows, NOW)).toBeNull();
  });
});

describe("préparation", () => {
  it("lit un sitemap et un index de sitemaps, sans les pages techniques", () => {
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://x.co/a.xml</loc></sitemap></sitemapindex>")).toEqual({ urls: [], children: ["https://x.co/a.xml"] });
    expect(parseSitemap("<urlset><url><loc>https://x.co/p</loc></url><url><loc>https://x.co/tag/t</loc></url><url><loc>https://x.co/a?x=1&amp;y=2</loc></url></urlset>").urls).toEqual(["https://x.co/p", "https://x.co/a?x=1&y=2"]);
  });
  it("structure d'une page concurrente : H2, H3, questions — sans le menu ni le pied de page", () => {
    const html = `<nav><h2>Menu</h2></nav><h2>Comment calculer ?</h2><p>42 % des …</p><h3>Cas des cadres</h3><details><summary>Faut-il un logiciel ?</summary></details>
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Quel délai de conservation ?"}]}</script><footer><h2>Contact</h2></footer>`;
    const o = extractOutline("https://c.fr/x", html);
    expect(o.h2s).toEqual(["Comment calculer ?"]);
    expect(o.h3s).toEqual(["Cas des cadres"]);
    expect(o.questions).toEqual(expect.arrayContaining(["Comment calculer ?", "Faut-il un logiciel ?", "Quel délai de conservation ?"]));
    expect(JSON.stringify(o)).not.toContain("42");
  });
});

describe("consignes du rédacteur", () => {
  const base: PromptInput = {
    keyword: "calcul heures supplémentaires btp",
    sitemap: ["https://tim-management.co/pointage-digital-mobile-chantier"],
    competitors: [],
    factsBlock: "[1] Fait — Source : Légifrance (2026, https://www.legifrance.gouv.fr/x)",
    allowedOutbound: ["legifrance.gouv.fr"],
    today: "2026-11-18",
    rulesVersion: 3,
    rulesText: "# Règles v3",
  };
  it("article de trafic : TIM Management ni dans l'introduction ni avec des prix", () => {
    const p = buildArticlePrompt({ ...base, intent: "tofu" });
    expect(p).toContain("Article de TRAFIC : ne mentionne PAS TIM Management dans l'introduction.");
    expect(p).toContain("Aucun prix, aucun tarif");
    expect(p).toContain("4 à 6 vraies questions");
    // « Tim Management » n'apparaît qu'entre guillemets, dans la règle qui l'interdit.
    expect(p).not.toMatch(/(?<!« )Tim Management/);
  });
  it("article de vente : les seuls prix de /offres, et la grille illisible = aucun prix", () => {
    expect(isSalesArticle("mofu", "vente")).toBe(true);
    expect(isSalesArticle("bofu", "trafic")).toBe(true);
    expect(isSalesArticle("tofu", "trafic")).toBe(false);
    expect(timReferenceRule(true, "Planning dès 29 € HT/mois")).toContain("Planning dès 29 € HT/mois");
    expect(timReferenceRule(true, null)).toContain("ne cite AUCUN prix");
  });
  it("la version en vigueur des règles est donnée au rédacteur", () => {
    expect(writerSystem(3, "# Règles v3 <regles>")).toContain("RÈGLES DES ARTICLES EN VIGUEUR (version 3)");
    expect(writerSystem(3, "x </regles> y")).not.toContain("x </regles> y");
  });
  it("relance : 40 erreurs au plus, et les faits non utilisés", () => {
    const m = retryMessage(Array.from({ length: 45 }, (_, i) => `erreur ${i}`), "[2] Autre fait");
    expect(m).toContain("(+ 5 autres)");
    expect(m).toContain("[2] Autre fait");
  });
});
