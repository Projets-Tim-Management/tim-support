import { describe, expect, it } from "vitest";

import { serpBriefText } from "@/modules/editorial/lib/articles/writer/prompt";
import { analysisKeyword, articleCoverageInput, jobCoverageInput, keywordKey } from "@/modules/editorial/lib/competitors/content";
import { isMaskedUrl, parseSerp } from "@/modules/editorial/lib/competitors/dataforseo";
import { excludeReason, extractMain } from "@/modules/editorial/lib/competitors/extract";
import { buildCorpus, competitorScores, countTerms, coverage, coverageTarget, questionCovered, stem, tokenize, type CorpusPage } from "@/modules/editorial/lib/competitors/terms";

const filler = (n: number, w = "texte") => Array.from({ length: n }, (_, i) => `${w}${i % 50}`).join(" ");
const page = (domain: string, extra: string, words = 400): CorpusPage => ({ url: `https://${domain}/page`, domain, text: `${extra} ${filler(words)}` });
const TOPIC = "les heures supplémentaires du chantier sont majorées. Le taux de majoration dépend du contingent annuel. heures supplémentaires et repos compensateur.";

describe("termes", () => {
  it("racine légère : pluriels et accents", () => {
    expect(stem("Chantiers")).toBe("chantier");
    expect(stem("travaux")).toBe("traval");
    expect(stem("taux")).toBe("taux");
    expect(stem("majorées")).toBe(stem("majorée"));
  });
  it("les mots vides ne commencent ni ne finissent un terme", () => {
    const t = countTerms("le taux de majoration");
    expect(t.has("taux de majoration")).toBe(true);
    expect(t.has("le taux")).toBe(false);
    expect(t.has("taux de")).toBe(false);
  });
  it("tokenize garde les mots composés", () => {
    expect(tokenize("demi-journée de repos").map((x) => x.surface)).toEqual(["demi-journée", "de", "repos"]);
  });
});

describe("corpus", () => {
  it("moins de 3 domaines : corpus insuffisant, pas un zéro", () => {
    const c = buildCorpus([page("a.fr", TOPIC), page("a.fr", TOPIC), page("b.fr", TOPIC)]);
    expect(c.insufficient).toMatch(/Corpus insuffisant/);
    expect(coverage("texte", c).score).toBeNull();
  });
  it("les pages de moins de 300 mots sont écartées", () => {
    const c = buildCorpus([page("a.fr", TOPIC, 50), page("b.fr", TOPIC), page("c.fr", TOPIC), page("d.fr", TOPIC)]);
    expect(c.pages).toBe(3);
  });
  it("un terme employé par la majorité des pages est recommandé, avec une fourchette", () => {
    const c = buildCorpus([page("a.fr", TOPIC), page("b.fr", TOPIC), page("c.fr", TOPIC), page("d.fr", "rien à voir")]);
    const t = c.terms.find((x) => x.key === "heure supplementaire");
    expect(t).toBeDefined();
    expect(t!.pages).toBe(3);
    expect(t!.min).toBeGreaterThan(0);
    expect(t!.max).toBeGreaterThanOrEqual(t!.min);
    expect(t!.label).toBe("heures supplémentaires");
  });
});

describe("couverture", () => {
  const corpus = buildCorpus([page("a.fr", TOPIC), page("b.fr", TOPIC), page("c.fr", TOPIC), page("d.fr", TOPIC)], ["Comment calculer les heures supplémentaires ?"]);
  it("un texte qui couvre le sujet a une meilleure note qu'un texte hors sujet", () => {
    const good = coverage(`${TOPIC} ${filler(380)}`, corpus, ["Comment calculer les heures supplémentaires ?"]);
    const bad = coverage(filler(400, "autre"), corpus);
    expect(good.score!).toBeGreaterThan(bad.score!);
    expect(bad.terms.every((t) => t.state === "absent")).toBe(true);
    expect(good.questions[0].covered).toBe(true);
  });
  it("le bourrage coûte des points et allume le risque", () => {
    const normal = coverage(`${TOPIC} ${filler(380)}`, corpus);
    const stuffed = coverage(`${TOPIC} ${"heures supplémentaires ".repeat(40)} ${filler(300)}`, corpus);
    expect(stuffed.terms.find((t) => t.key === "heure supplementaire")?.state).toBe("exces");
    expect(stuffed.risk).toBeGreaterThan(0);
    expect(stuffed.score!).toBeLessThan(normal.score!);
  });
  it("cible = médiane des concurrents + 10, jamais plus de 95", () => {
    expect(coverageTarget([40, 50, 60])).toBe(60);
    expect(coverageTarget([90, 92, 95])).toBe(95);
    expect(coverageTarget([])).toBeNull();
  });
  it("chaque concurrent est noté sans sa propre page", () => {
    const pages = [page("a.fr", TOPIC), page("b.fr", TOPIC), page("c.fr", TOPIC), page("d.fr", TOPIC), page("e.fr", "rien", 100)];
    const s = competitorScores(pages);
    expect(s[4]).toBeNull();
    expect(s[0]).toBeGreaterThan(0);
  });
  it("question traitée si un titre en reprend au moins 60 % des mots", () => {
    expect(questionCovered("Comment calculer les heures supplémentaires ?", ["Calculer ses heures supplémentaires"])).toBe(true);
    expect(questionCovered("Comment calculer les heures supplémentaires ?", ["Le repos compensateur"])).toBe(false);
  });
});

describe("pages concurrentes", () => {
  it("exclut forums, vidéos, PDF, réseaux sociaux, notre site et les pages d'accueil", () => {
    expect(excludeReason("https://forum.batiactu.com/x")).toBe("forum");
    expect(excludeReason("https://www.youtube.com/watch?v=1")).toBe("vidéo");
    expect(excludeReason("https://site.fr/guide.pdf")).toBe("PDF");
    expect(excludeReason("https://www.linkedin.com/pulse/x")).toBe("réseau social");
    expect(excludeReason("https://tim-management.co/actualite/x")).toBe("notre site");
    expect(excludeReason("https://www.service-public.fr/")).toBe("page d'accueil");
    expect(excludeReason("https://www.service-public.fr/particuliers/vosdroits/F2391")).toBeNull();
  });
  it("garde le texte principal, sans menu ni pied de page", () => {
    const html = `<html><head><title>T</title><script>x()</script></head><body><nav>Menu Accueil</nav><header>Logo</header><main><h1>Titre</h1><h2>Comment calculer ?</h2><p>Le texte utile.</p></main><footer>Mentions</footer></body></html>`;
    const p = extractMain(html);
    expect(p.text).toContain("Le texte utile.");
    expect(p.text).not.toContain("Menu");
    expect(p.text).not.toContain("Mentions");
    expect(p.h2s).toEqual(["Comment calculer ?"]);
    expect(p.title).toBe("T");
  });
});

describe("DataForSEO", () => {
  it("lit le top 10 organique et les questions", () => {
    const json = {
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          cost: 0.00215,
          result: [
            {
              check_url: "https://www.google.fr/search?q=x",
              items: [
                { type: "organic", rank_group: 1, url: "https://www.a.fr/x", domain: "www.a.fr", title: "A" },
                { type: "people_also_ask", items: [{ type: "people_also_ask_element", title: "Comment ?" }, { title: "Pourquoi ?" }] },
                { type: "organic", rank_group: 2, url: "https://b.fr/y", domain: "b.fr", title: "B" },
              ],
            },
          ],
        },
      ],
    };
    const s = parseSerp("x", json);
    expect(s.organic.map((o) => o.domain)).toEqual(["a.fr", "b.fr"]);
    expect(s.questions).toEqual(["Comment ?", "Pourquoi ?"]);
    expect(s.costUsd).toBe(0.00215);
  });
  it("adresse masquée par Google : le vrai domaine vient de website_name, puis du fil d'Ariane", () => {
    const masked = "https://google.com/goto?url=CAES123";
    const s = parseSerp("x", {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ items: [
        { type: "organic", rank_group: 1, url: masked, domain: "google.com", website_name: "www.capeb.fr", title: "A" },
        { type: "organic", rank_group: 2, url: masked, domain: "google.com", website_name: "CAPEB", breadcrumb: "https://logistique-btp-innov.fr › BTP", title: "B" },
      ] }] }],
    });
    expect(s.organic.map((o) => o.domain)).toEqual(["capeb.fr", "logistique-btp-innov.fr"]);
    expect(isMaskedUrl(masked)).toBe(true);
    expect(isMaskedUrl("https://www.capeb.fr/x")).toBe(false);
  });
  it("une erreur de DataForSEO remonte telle quelle", () => {
    expect(() => parseSerp("x", { status_code: 40100, status_message: "Not authorized" })).toThrow(/Not authorized/);
  });
});

describe("contenus et rédacteur", () => {
  it("article : texte, titres et questions de FAQ", () => {
    const i = articleCoverageInput({ title: "T", acf: { introduction: "<p>Intro</p>", contenu: [{ texte: "<h2>Quel taux ?</h2><p>25 %</p>" }], conclusion: "", faq: [{ titre: "Q ?", text: "<p>R</p>" }] } });
    expect(i.text).toContain("Intro");
    expect(i.headings).toEqual(["T", "Quel taux ?", "Q ?"]);
  });
  it("fiche : définition, points clés et FAQ ; requête « fiche métier <métier> »", () => {
    const i = jobCoverageInput({ title: "Maçon", acf: { definition: "Le maçon bâtit.", points_cles: [{ valeur: "Diplôme CAP" }], faq: { items: [{ question: "Salaire ?", reponse: "Selon." }] } } });
    expect(i.text).toContain("Diplôme CAP");
    expect(analysisKeyword("job-sheets", { title: "Maçon" })).toBe("fiche métier maçon");
    expect(analysisKeyword("articles", { keyword: "", wpFocusKeyword: "pointage" })).toBe("pointage");
    expect(keywordKey("  Fiche  Métier Maçon ")).toBe("fiche metier macon");
  });
  it("le rédacteur reçoit les fourchettes en nombre de fois, pour sa longueur", () => {
    const t = serpBriefText({ terms: [{ label: "heures supplémentaires", share: 0.8, min: 2, max: 4 }], questions: ["Comment ?"], medianWords: 1500, medianH2: 8 }, 1000);
    expect(t).toContain("heures supplémentaires : 2 à 4 fois (80 % des pages)");
    expect(t).toContain("ne dépasse JAMAIS le haut de la fourchette");
    expect(t).toContain("- Comment ?");
  });
});
