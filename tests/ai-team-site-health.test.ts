import { describe, expect, it } from "vitest";

import { checkPage, internalPath, issuesOf, parseRobots, parseTechReport, robotsAllows, type PageCheck } from "@/modules/ai-team/lib/site-health";

describe("Le robots.txt", () => {
  const robots = parseRobots(["User-agent: *", "Disallow: /admin", "Allow: /admin/public", "", "User-agent: GPTBot", "User-agent: CCBot", "Disallow: /", "", "User-agent: PerplexityBot", "Disallow:", "Sitemap: https://tim-management.co/sitemap.xml"].join("\n"));

  it("regroupe les robots, garde les plans annoncés", () => {
    expect(robots.groups.map((g) => g.agents)).toEqual([["*"], ["gptbot", "ccbot"], ["perplexitybot"]]);
    expect(robots.sitemaps).toEqual(["https://tim-management.co/sitemap.xml"]);
  });

  it("le groupe du robot, sinon « * » ; la règle la plus longue gagne ; « Disallow: » vide permet tout", () => {
    expect(robotsAllows(robots, "GPTBot")).toBe(false);
    expect(robotsAllows(robots, "CCBot", "/pointage")).toBe(false);
    expect(robotsAllows(robots, "OAI-SearchBot", "/")).toBe(true);
    expect(robotsAllows(robots, "OAI-SearchBot", "/admin/x")).toBe(false);
    expect(robotsAllows(robots, "OAI-SearchBot", "/admin/public/x")).toBe(true);
    expect(robotsAllows(robots, "PerplexityBot", "/admin")).toBe(true);
    expect(robotsAllows(parseRobots(""), "Googlebot")).toBe(true);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /*.pdf$"), "Googlebot", "/a.pdf")).toBe(false);
  });
});

describe("Une page", () => {
  it("lit titre, description, H1, canonique, noindex, langue, données structurées, alt et liens internes", () => {
    const html = `<html lang="fr"><head><title>Pointage &amp; heures | TIM</title><meta name="description" content="Le pointage."><meta name='robots' content='noindex,follow'><link rel="canonical" href="https://tim-management.co/pointage"><script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["SoftwareApplication"]}]}</script></head><body><h1>A</h1><img src="a.png"><img src="b.png" alt="b"><a href="/plannings/">P</a><a href="https://www.tim-management.co/offres#x">O</a><a href="https://autre.fr/">x</a><a href="mailto:a@b.c">m</a></body></html>`;
    const p = checkPage("https://tim-management.co/pointage", { status: 200, redirectTo: null, ms: 120, xRobots: null }, html);
    expect(p).toMatchObject({ title: "Pointage & heures | TIM", description: "Le pointage.", noindex: true, canonical: "https://tim-management.co/pointage", h1: 1, lang: "fr", imgNoAlt: 1 });
    expect(p.schema).toEqual(["Organization", "SoftwareApplication"]);
    expect(p.links.sort()).toEqual(["/offres", "/plannings"]);
    expect(checkPage("https://tim-management.co/x", { status: 200, redirectTo: null, ms: 1, xRobots: "noindex" }, "").noindex).toBe(true);
    expect(internalPath("https://ailleurs.fr/x", "https://tim-management.co/")).toBeNull();
  });
});

const page = (path: string, over: Partial<PageCheck> = {}): PageCheck => ({ url: `https://tim-management.co${path}`, status: 200, redirectTo: null, ms: 200, noindex: false, canonical: null, title: `Titre ${path}`, description: `Desc ${path}`, h1: 1, lang: "fr", schema: ["WebPage"], imgNoAlt: 0, links: ["/"], ...over });

describe("Les problèmes du site", () => {
  it("compte et classe : bloquant d'abord, puis le plus fréquent", () => {
    const issues = issuesOf({
      pages: [
        page("/", { links: ["/a", "/b"] }),
        page("/a", { title: "Même", links: ["/b"] }),
        page("/b", { title: "Même", h1: 0, ms: 2500 }),
        page("/orpheline", { canonical: "https://tim-management.co/a" }),
        page("/vieux", { status: 301, redirectTo: "https://tim-management.co/a" }),
        page("/casse", { status: 404 }),
      ],
      inspections: [
        { url: "https://tim-management.co/a", verdict: "PASS", coverage: "", lastCrawl: null, googleCanonical: "https://tim-management.co/a", userCanonical: "https://tim-management.co/a" },
        { url: "https://tim-management.co/b", verdict: "NEUTRAL", coverage: "Explorée, actuellement non indexée", lastCrawl: null, googleCanonical: null, userCanonical: null },
      ],
      bots: [
        { token: "OAI-SearchBot", who: "ChatGPT", role: "recherche", allowed: false },
        { token: "GPTBot", who: "OpenAI", role: "entrainement", allowed: false },
      ],
      sitemapInRobots: true,
      brokenLinks: [{ path: "/disparue", status: 404, from: ["/a"] }],
    });
    const by = Object.fromEntries(issues.map((i) => [i.code, i]));
    expect(issues.slice(0, 4).every((i) => i.impact === "fort")).toBe(true);
    expect(by["robot-bloque"].pages).toEqual(["OAI-SearchBot (ChatGPT)"]);
    expect(by["erreur"].pages).toEqual(["https://tim-management.co/casse"]);
    expect(by["non-indexee"].pages).toEqual(["https://tim-management.co/b — Explorée, actuellement non indexée"]);
    expect(by["lien-casse"].count).toBe(1);
    expect(by["renvoi"].count).toBe(1);
    expect(by["canonique-ailleurs"].pages[0]).toContain("/orpheline");
    expect(by["orpheline"].pages).toEqual(["https://tim-management.co/orpheline"]);
    expect(by["titre-double"].count).toBe(2);
    expect(by["sans-h1"].count).toBe(1);
    expect(by["lente"].pages[0]).toContain("2.5 s");
    expect(by["plan-hors-robots"]).toBeUndefined();
  });
});

describe("Le rapport de Robert, vérifié", () => {
  it("garde les tâches avec un prompt, les fortes d'abord, bornées", () => {
    const out = parseTechReport(
      `<synthese>Deux liens cassés.</synthese><taches>${JSON.stringify([
        { titre: "Titres trop longs", impact: "faible", prompt: "Raccourcis…", etapes: ["a"], pages: ["/x"] },
        { titre: "Réparer les liens cassés", impact: "fort", prompt: "Corrige…", minutes: 2000, etapes: ["Ouvrir", "Corriger"] },
        { titre: "Sans prompt", impact: "fort", prompt: "" },
      ])}</taches>`,
    )!;
    expect(out.findings.map((t) => t.title)).toEqual(["Réparer les liens cassés", "Titres trop longs"]);
    expect(out.findings[0]).toMatchObject({ minutes: 480, steps: ["Ouvrir", "Corriger"] });
    expect(parseTechReport("rien")).toBeNull();
  });
});
