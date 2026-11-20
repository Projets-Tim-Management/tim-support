import { describe, expect, it } from "vitest";

import { findCannibal, findCannibalBySearch, overlaps, topicTokens } from "@/modules/editorial/lib/articles/cannibal";
import { buildBoardForPlan } from "@/modules/editorial/lib/articles/plan-data";
import { parseArticleProposals, planProposals, type ArticleProposal, type BoardArticle } from "@/modules/editorial/lib/articles/proposals";

const NOW = new Date("2026-11-23T06:00:00Z");

const board: BoardArticle[] = [
  { id: 1, title: "Modèles de feuilles d'heures à imprimer gratuitement", slug: "feuille-d-heures-vierge", keyword: "Feuilles d'heures", status: "publie", gscClicks: 1877, path: "/actualite/feuille-d-heures-vierge" },
  { id: 2, title: "Comment décompter le temps de trajet ?", slug: "feuille-heures-trajet-btp", keyword: "Feuilles d'heures", status: "publie", gscClicks: 120, path: "/actualite/feuille-heures-trajet-btp" },
  { id: 3, title: "Comment calculer le temps de travail d'un salarié ?", slug: "comment-calculer-temps-travail", keyword: "calcul temps de travail", status: "publie", gscClicks: 1750, path: "/actualite/comment-calculer-temps-travail" },
  { id: 4, title: "Grille de salaire BTP 2026", slug: "grille-de-salaire-btp", keyword: "grille salaire btp", status: "publie", gscClicks: 9767, path: "/actualite/grille-de-salaire-btp" },
  { id: 5, title: "Heures supplémentaires BTP : règles, calcul, majoration 2026", slug: "heures-supplementaires-btp-regles-calcul-majoration-2026", keyword: "Feuilles d'heures", status: "publie", gscClicks: 300, path: "/actualite/heures-supplementaires-btp-regles-calcul-majoration-2026" },
  { id: 6, title: "Planning des engins de chantier", slug: "", keyword: "planning engins chantier", status: "validee" },
  { id: 7, title: "Travail du dimanche dans le BTP", keyword: "travail dimanche btp", status: "arretee" },
];

const idea = (over: Partial<ArticleProposal> = {}): ArticleProposal => ({
  type: "nouvel-article",
  theme: 1,
  subtheme: "Calcul des heures",
  title: "Titre",
  keyword: "mot clé",
  intent: "tofu",
  why: "Pourquoi.",
  angle: "Angle.",
  outline: ["Quoi ?", "Comment ?"],
  article: "",
  reason: "autre",
  ...over,
});

describe("mots porteurs d'un sujet", () => {
  it("sans accents, mots vides, mots communs au site ; au singulier, racine légère", () => {
    expect([...topicTokens("Calculer les heures de travail sur un chantier BTP")].sort()).toEqual(["calcul", "heure", "travail"]);
    expect([...topicTokens("Feuilles d'heures mensuelles")].sort()).toEqual(["feuill", "heure", "mensuell"]);
  });
  it("recouvrement : 2 mots communs et 2/3 du plus court, ou les mêmes mots", () => {
    expect(overlaps(new Set(["calcul", "heure", "travail", "semaine"]), new Set(["calcul", "temp", "travail"]))).toBe(true);
    expect(overlaps(new Set(["prime", "panier"]), new Set(["panier", "repa", "montant"]))).toBe(false);
    expect(overlaps(new Set(["carte"]), new Set(["carte"]))).toBe(true);
  });
});

describe("cannibalisation : le sujet existe-t-il déjà ?", () => {
  it("l'article le plus proche, pas le premier venu ; à égalité, celui qui a le plus de clics", () => {
    expect(findCannibal({ keyword: "feuille d'heures mensuelle pdf", title: "Feuille d'heures mensuelle" }, board)?.id).toBe(1);
    expect(findCannibal({ keyword: "calcul heure de travail par semaine" }, board)?.id).toBe(3);
  });
  it("un mot-clé partagé par plusieurs articles (« Feuilles d'heures ») ne fait pas un doublon à lui seul", () => {
    expect(findCannibal({ keyword: "feuilles d'heures", title: "Heures supplémentaires et feuille d'heures" }, board)?.id).not.toBe(5);
  });
  it("un sujet nouveau passe", () => {
    expect(findCannibal({ keyword: "inventaire du matériel de chantier" }, board)).toBeNull();
  });
  it("Search Console : la recherche visée mène déjà à un de nos articles", () => {
    const rows = [
      { keys: ["coefficient btp 2026", "/actualite/grille-de-salaire-btp"], impressions: 286 },
      { keys: ["coefficient btp", "/actualite/grille-de-salaire-btp"], impressions: 627 },
      { keys: ["coefficient btp", "/page-produit"], impressions: 900 },
      { keys: ["coefficient btp rare", "/actualite/comment-calculer-temps-travail"], impressions: 5 },
    ];
    expect(findCannibalBySearch("coefficient btp 2026", rows, board)?.id).toBe(4);
    expect(findCannibalBySearch("document unique btp", rows, board)).toBeNull();
  });
});

describe("propositions de Paige → tableau", () => {
  it("lit la balise <articles>, ignore une ligne sans titre ni mot-clé", () => {
    const out = parseArticleProposals(
      '<plan>[]</plan><articles>[{"type":"nouvel-article","thematique":5,"titre":"Inventaire du matériel","motCle":"inventaire matériel chantier","intention":"mofu","structure":["Quand ?"]},{"type":"reprise","titre":"Reprise","article":"grille-de-salaire-btp","raison":"baisse"},{"titre":""}]</articles>',
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "nouvel-article", theme: 5, intent: "mofu", outline: ["Quand ?"] });
    expect(out[1]).toMatchObject({ type: "reprise", article: "grille-de-salaire-btp", reason: "baisse" });
  });

  it("un sujet qui existe devient une REPRISE de l'article en ligne, jamais un doublon", () => {
    const d = planProposals([idea({ title: "Feuille d'heures mensuelle", keyword: "feuille d'heures mensuelle pdf" })], board, [], NOW);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: "refresh", articleId: 1, reason: "doublon" });
  });

  it("un sujet déjà en préparation est écarté ; une idée arrêtée ne revient pas", () => {
    const d = planProposals([idea({ title: "Planning engins", keyword: "planning des engins de chantier" }), idea({ title: "Le dimanche", keyword: "travail le dimanche dans le btp" })], board, [], NOW);
    expect(d.map((x) => x.kind)).toEqual(["skip", "skip"]);
    expect(d[1]).toMatchObject({ motive: "Sujet d'une idée déjà arrêtée par Charlie." });
  });

  it("plus de 4 articles programmés : pas d'article nouveau (19/11/2026)", () => {
    const fresh = ["inventaire materiel", "entretien engins atelier"].map((k, i) => idea({ title: `Idée ${i}`, keyword: k }));
    const full: BoardArticle[] = [...board, ...Array.from({ length: 5 }, (_, i) => ({ id: 200 + i, title: `Programmé ${i} zz${i}`, keyword: `programme unique ${i}q`, status: "programme" }))];
    const d = planProposals(fresh, full, [], NOW);
    expect(d.filter((x) => x.kind === "create")).toHaveLength(0);
    expect(d[0]).toMatchObject({ kind: "skip" });
    expect((d[0] as { motive: string }).motive).toMatch(/programmés/);
  });

  it("l'équipe décide : 2 articles nouveaux par semaine, directement en rédaction ; 4 décidés en attente au plus", () => {
    const fresh = ["inventaire materiel", "entretien engins atelier", "document unique risques", "carte professionnelle intérim", "astreinte week-end"].map((k, i) => idea({ title: `Idée ${i}`, keyword: k }));
    expect(planProposals(fresh, board, [], NOW).filter((x) => x.kind === "create")).toHaveLength(2);
    // Le tableau a déjà 1 article décidé (6) ; 2 de plus en attente de rédaction → 3 : il reste 1 place.
    const busy: BoardArticle[] = [...board, ...Array.from({ length: 2 }, (_, i) => ({ id: 100 + i, title: `Attente ${i} sujet${i}`, keyword: `sujet unique ${i}x`, status: "validee" }))];
    expect(planProposals(fresh, busy, [], NOW).filter((x) => x.kind === "create")).toHaveLength(1);
  });

  it("deux idées de la même semaine sur le même sujet n'en font qu'une", () => {
    const d = planProposals([idea({ title: "Inventaire A", keyword: "inventaire matériel chantier" }), idea({ title: "Inventaire B", keyword: "inventaire du matériel" })], board, [], NOW);
    expect(d.map((x) => x.kind)).toEqual(["create", "skip"]);
  });

  it("reprise : article en ligne seulement, une seule à la fois, et pas avant 8 semaines après un refus", () => {
    const withState: BoardArticle[] = board.map((a) => (a.id === 3 ? { ...a, refreshState: "refusee", refreshDecidedAt: "2026-11-01T00:00:00Z" } : a.id === 1 ? { ...a, refreshState: "proposee" } : a));
    const d = planProposals(
      [
        idea({ type: "reprise", title: "R grille", article: "grille-de-salaire-btp", reason: "position" }),
        idea({ type: "reprise", title: "R calcul", article: "comment-calculer-temps-travail", reason: "baisse" }),
        idea({ type: "reprise", title: "R feuilles", article: "https://tim-management.co/actualite/feuille-d-heures-vierge/", reason: "format" }),
        idea({ type: "reprise", title: "R engins", article: "Planning des engins de chantier" }),
        idea({ type: "reprise", title: "R inconnu", article: "nexiste-pas" }),
      ],
      withState,
      [],
      NOW,
    );
    expect(d.map((x) => x.kind)).toEqual(["refresh", "skip", "skip", "skip", "skip"]);
    expect(d[0]).toMatchObject({ articleId: 4, reason: "position" });
  });
});

describe("mises à jour décidées par l'équipe (sans relecture)", () => {
  it("2 par semaine au plus ; pas de seconde mise à jour d'un article déjà « À rafraîchir »", () => {
    const online: BoardArticle[] = [
      ...board,
      { id: 20, title: "Article A", slug: "article-a", status: "publie" },
      { id: 21, title: "Article B", slug: "article-b", status: "a-rafraichir" },
    ];
    const d = planProposals(
      ["grille-de-salaire-btp", "comment-calculer-temps-travail", "article-a", "article-b"].map((slug, i) => idea({ type: "reprise", title: `MAJ ${i}`, article: slug, reason: "position" })),
      online,
      [],
      NOW,
    );
    expect(d.map((x) => x.kind)).toEqual(["refresh", "refresh", "skip", "skip"]);
    expect(d[2]).toMatchObject({ motive: "Plus de 2 mises à jour cette semaine." });
  });
});

describe("ce que Paige lit du tableau", () => {
  it("thématiques par priorité, place pour des idées, idées arrêtées à ne pas reproposer", () => {
    const out = buildBoardForPlan(
      [
        { title: "A", status: "publie", theme: { number: 2 }, gscClicks: 10, hasTldr: true },
        { title: "B", status: "idee", theme: { number: 1 } },
        { title: "C", status: "arretee", keyword: "c", decisionNote: "Hors sujet" },
        { title: "D", status: "publie", refreshState: "refusee", refreshDecisionNote: "Déjà à jour", refreshDecidedAt: "2026-11-20T10:00:00Z" },
      ],
      [
        { number: 2, name: "Paie", priority: 2, subthemes: [{ name: "Primes" }] },
        { number: 1, name: "Temps", priority: 1 },
      ],
    );
    expect(out.thematiques.map((t) => t.numero)).toEqual([1, 2]);
    expect(out.articlesDecidesEnAttenteDeRedaction).toBe(1);
    expect(out.placePourDesIdees).toBe(2);
    expect(out.articles.map((a) => a.titre)).toEqual(["A", "B", "D"]);
    expect(out.ideesArretees).toEqual([{ titre: "C", motCle: "c", motif: "Hors sujet" }]);
    expect(out.reprisesRefusees[0]).toEqual({ titre: "D", motif: "Déjà à jour", le: "2026-11-20" });
  });
});
