import { describe, expect, it } from "vitest";

import { serpBriefText } from "@/modules/editorial/lib/articles/writer/prompt";
import { isToolPage } from "@/modules/editorial/lib/competitors/extract";
import { linkedUrls, rankLinks, sitePages } from "@/modules/editorial/lib/competitors/links";
import { buildCorpus, COPY_BLOCK, copyRatio, coverage, extractEntities, isOnTopic, riskLevel, shingles, type CorpusPage } from "@/modules/editorial/lib/competitors/terms";

const filler = (n: number, w = "texte") => Array.from({ length: n }, (_, i) => `${w}${i % 50}`).join(" ");

describe("entités", () => {
  it("sigles et noms propres d'institutions, hors phrases en capitales et noms des concurrents", () => {
    const e = [...extractEntities("Selon la CAPEB et la FFB, la grille des ETAM suit la Convention collective nationale des ouvriers. Le Code du travail fixe le SMIC. France Travail publie les offres.\nGRILLE DES SALAIRES 2026", ["capeb"]).values()];
    expect(e).toEqual(expect.arrayContaining(["FFB", "ETAM", "SMIC", "Convention collective nationale", "Code du travail", "France Travail"]));
    expect(e).not.toContain("CAPEB");
    expect(e).not.toContain("GRILLE");
  });
  it("une entité citée par la majorité des pages entre dans la couverture (25 %)", () => {
    const topic = "La Convention collective nationale du bâtiment fixe les salaires. Le Code du travail encadre les heures supplémentaires et leur majoration.";
    const pages: CorpusPage[] = ["a.fr", "b.fr", "c.fr"].map((d) => ({ url: `https://${d}/x`, domain: d, text: `${topic} ${filler(400)}` }));
    const corpus = buildCorpus(pages);
    expect(corpus.entities?.map((x) => x.label)).toEqual(expect.arrayContaining(["Convention collective nationale", "Code du travail"]));
    const withE = coverage(`${topic} ${filler(380)}`, corpus);
    const withoutE = coverage(`la convention fixe les salaires et le code encadre les heures supplémentaires et leur majoration ${filler(380)}`, corpus);
    expect(withE.entities.every((x) => x.present)).toBe(true);
    expect(withE.score!).toBeGreaterThan(withoutE.score!);
  });
});

describe("sur-optimisation", () => {
  it("niveau à part : aucun, modéré, élevé", () => {
    expect(riskLevel(0)).toBe("aucun");
    expect(riskLevel(0.5)).toBe("modere");
    expect(riskLevel(1.5)).toBe("eleve");
  });
});

describe("anti-copie", () => {
  const base = "le taux de majoration des heures supplémentaires est de vingt-cinq pour cent pour les huit premières heures puis de cinquante pour cent au delà selon le code du travail et la convention collective applicable";
  it("un texte repris mot pour mot dépasse le seuil de blocage", () => {
    expect(copyRatio(shingles(base), shingles(`Intro. ${base} Fin.`))).toBeGreaterThanOrEqual(COPY_BLOCK);
  });
  it("un texte réécrit reste sous le seuil", () => {
    const rewritten = "pour les huit premières heures au-delà de trente-cinq heures, la majoration atteint vingt-cinq pour cent ; ensuite elle passe à la moitié du salaire horaire, dans la limite prévue par l'accord de branche du bâtiment et des travaux publics";
    expect(copyRatio(shingles(rewritten), shingles(base))).toBeLessThan(COPY_BLOCK);
  });
  it("un texte trop court n'est pas jugé", () => {
    expect(copyRatio(shingles("un deux trois quatre cinq six"), shingles("un deux trois quatre cinq six"))).toBe(0);
  });
});

describe("liens internes", () => {
  const candidates = [
    { url: "https://tim-management.co/actualite/repos-compensateur-btp", label: "Repos compensateur dans le BTP : règles et calcul", keyword: "repos compensateur", kind: "article" as const },
    { url: "https://tim-management.co/actualite/travail-de-nuit", label: "Travail de nuit BTP : règles spécifiques", keyword: "travail de nuit", kind: "article" as const },
    { url: "https://tim-management.co/actualite/deja-lie", label: "Majoration des heures supplémentaires", keyword: "majoration heures supplémentaires", kind: "article" as const },
  ];
  const text = "Les heures supplémentaires ouvrent droit à une majoration et parfois à un repos compensateur obligatoire. Le calcul du repos compensateur dépend du contingent. Les règles du repos compensateur sont fixées par la loi ; son calcul se fait en heures et les règles varient. Un appel à l'action mentionne le travail de nuit une seule fois.";
  it("propose les pages proches non liées, avec l'ancre trouvée dans le texte", () => {
    const r = rankLinks({ text, html: '<a href="https://tim-management.co/actualite/deja-lie">x</a>', candidates });
    expect(r.map((x) => x.url)).toEqual(["https://tim-management.co/actualite/repos-compensateur-btp"]);
    expect(r[0].anchor).toBe("repos compensateur");
  });
  it("adresses déjà liées : relatives et absolues", () => {
    const s = linkedUrls('<a href="/offres/">o</a><a href="https://tim-management.co/pointage?x=1">p</a>');
    expect(s.has("https://tim-management.co/offres")).toBe(true);
    expect(s.has("https://tim-management.co/pointage")).toBe(true);
  });
  it("pages du site : sans articles, fiches ni pages légales", () => {
    const p = sitePages(["https://tim-management.co/pointage-chantier/", "https://tim-management.co/actualite/x/", "https://tim-management.co/fiche-metier/macon/", "https://tim-management.co/mentions-legales/"]);
    expect(p).toEqual([{ url: "https://tim-management.co/pointage-chantier/", label: "pointage chantier", kind: "page" }]);
  });
});

describe("rédacteur", () => {
  it("reçoit les entités avec la consigne de source", () => {
    const t = serpBriefText({ terms: [], entities: [{ label: "Code du travail", share: 0.7 }], questions: [], medianWords: 1500, medianH2: 8 }, 1000);
    expect(t).toContain("- Code du travail (70 % des pages)");
    expect(t).toContain("FAITS VÉRIFIÉS");
  });
});

describe("pages hors sujet", () => {
  it("une page de conversion d'unités ne compte pas pour « convertir heures en centièmes »", () => {
    expect(isOnTopic("convertir heures en centièmes", "Centimètres par heure en Centimètres par jour", "Conversion de centimètres par heure en centimètres par jour…")).toBe(false);
    expect(isOnTopic("convertir heures en centièmes", "Convertir les minutes en centièmes d'heure", "Pour convertir des heures en centièmes…")).toBe(true);
    expect(isOnTopic("", "x", "y")).toBe(true);
  });
});

describe("pages outils", () => {
  it("convertisseurs, calculateurs et applications sont écartés ; un article sur les outils reste", () => {
    expect(isToolPage("https://superplanif.com/convertisseur-heures-centiemes", "Convertisseur heures en centièmes")).toBe(true);
    expect(isToolPage("https://x.fr/a", "Calculatrice des heures supplémentaires")).toBe(true);
    expect(isToolPage("https://x.fr/meilleurs-outils-pointage", "Les meilleurs outils de pointage en 2026")).toBe(false);
    expect(isToolPage("https://x.fr/calcul-heures-sup", "Calcul des heures supplémentaires : règles")).toBe(false);
  });
});
