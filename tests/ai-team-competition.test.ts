import { describe, expect, it, vi } from "vitest";

import { competitionData, parseCompetition } from "@/modules/ai-team/lib/competition";
import { crawlSite, diffMaps, internalLinks, parseSitemap, runCompetitorCrawl, sectionOf, sitemapsInRobots } from "@/modules/ai-team/lib/competitor-maps";

const urlset = (locs: [string, string?][]) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map(([l, m]) => `<url><loc>${l}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}</url>`).join("")}</urlset>`;
const index = (locs: string[]) => `<sitemapindex>${locs.map((l) => `<sitemap><loc><![CDATA[${l}]]></loc></sitemap>`).join("")}</sitemapindex>`;
const fakeFetch = (pages: Record<string, string>) => vi.fn(async (url: string) => (url in pages ? new Response(pages[url], { status: 200 }) : new Response("", { status: 404 }))) as unknown as typeof fetch;

describe("Plans de site : lecture", () => {
  it("lit un index et une liste de pages (CDATA, entités, dates)", () => {
    expect(parseSitemap(index(["https://a.fr/s1.xml"]))).toEqual({ kind: "index", locs: [{ loc: "https://a.fr/s1.xml", lastmod: null }] });
    expect(parseSitemap(urlset([["https://a.fr/blog/x?a=1&amp;b=2", "2026-11-03T10:00:00+01:00"]]))).toEqual({ kind: "urlset", locs: [{ loc: "https://a.fr/blog/x?a=1&b=2", lastmod: "2026-11-03" }] });
    expect(parseSitemap("<html>pas un plan</html>").kind).toBe("inconnu");
    expect(sitemapsInRobots("User-agent: *\nSitemap: https://a.fr/sitemap_index.xml\nsitemap:https://a.fr/news.xml")).toEqual(["https://a.fr/sitemap_index.xml", "https://a.fr/news.xml"]);
  });

  it("plan B : les liens internes de l'accueil, sans ancres, fichiers ni liens externes", () => {
    const html = `<a href="/devis">Devis</a><a href="https://a.fr/blog?utm=x">Blog</a><a href="#top">Haut</a><a href="/doc.pdf">PDF</a><a href="https://autre.fr/">Ext</a><a href='/devis'>Encore</a>`;
    expect(internalLinks(html, "https://a.fr").map((u) => u.loc)).toEqual(["https://a.fr/devis", "https://a.fr/blog"]);
  });

  it("la rubrique d'une page ignore la langue", () => {
    expect(sectionOf("https://a.fr/fr/blog/x")).toBe("blog");
    expect(sectionOf("https://a.fr/")).toBe("(accueil)");
    expect(sectionOf("https://a.fr/Fonctionnalites/pointage")).toBe("fonctionnalites");
  });

  it("suit le robots.txt et l'index ; à défaut de plan, lit l'accueil", async () => {
    const f = fakeFetch({
      "https://a.fr/robots.txt": "Sitemap: https://a.fr/idx.xml",
      "https://a.fr/idx.xml": index(["https://a.fr/p1.xml", "https://a.fr/p2.xml"]),
      "https://a.fr/p1.xml": urlset([["https://a.fr/blog/a"]]),
      "https://a.fr/p2.xml": urlset([["https://a.fr/produit/b"], ["https://a.fr/blog/a"]]),
    });
    expect((await crawlSite("https://a.fr", f)).map((u) => u.loc)).toEqual(["https://a.fr/blog/a", "https://a.fr/produit/b"]);
    const g = fakeFetch({ "https://b.fr/robots.txt": "User-agent: *", "https://b.fr/": `<a href="/tarifs">Tarifs</a>` });
    expect((await crawlSite("https://b.fr", g)).map((u) => u.loc)).toEqual(["https://b.fr/tarifs"]);
    await expect(crawlSite("https://c.fr", fakeFetch({}))).rejects.toThrow(/aucun plan de site lisible/);
  });

  it("compare deux photos ; la première n'a ni ajouts ni retraits", () => {
    const a = [{ loc: "x", lastmod: null }, { loc: "y", lastmod: null }];
    const b = [{ loc: "y", lastmod: null }, { loc: "z", lastmod: null }];
    expect(diffMaps(a, b)).toEqual({ added: [{ loc: "z", lastmod: null }], removed: [{ loc: "x", lastmod: null }] });
    expect(diffMaps(null, b)).toEqual({ added: [], removed: [] });
  });
});

describe("La photo de la semaine, d'un passage à l'autre", () => {
  function fakePayload() {
    const maps: Record<string, unknown>[] = [];
    return {
      maps,
      find: vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
        if (collection === "ad-competitors") return { docs: [{ id: 1, name: "Alobees", website: "https://a.fr", kind: "editeur" }] };
        if (collection === "ai-team-competitor-maps") {
          const w = JSON.stringify(where);
          if (w.includes('"week"')) return { docs: maps.filter((m) => w.includes(String(m.week))) };
          return { docs: [...maps].reverse().filter((m) => m.status === "lu") };
        }
        return { docs: [] };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (maps.push(data), data)),
    };
  }

  it("la première semaine photographie ; la suivante dit ce qui a été ajouté", async () => {
    const payload = fakePayload();
    const v1 = fakeFetch({ "https://a.fr/sitemap.xml": urlset([["https://a.fr/blog/a"]]) });
    await runCompetitorCrawl(payload as never, { now: new Date("2026-11-15T18:30:00Z"), fetcher: v1 }); // dimanche 19 h 30 : semaine du 16
    expect(payload.maps[0]).toMatchObject({ week: "2026-11-16", status: "lu", count: 1, added: null, removed: null });
    const v2 = fakeFetch({ "https://a.fr/sitemap.xml": urlset([["https://a.fr/blog/a"], ["https://a.fr/comparatif/tim"]]) });
    await runCompetitorCrawl(payload as never, { now: new Date("2026-11-22T18:30:00Z"), fetcher: v2 });
    expect(payload.maps[1]).toMatchObject({ week: "2026-11-23", count: 2, added: [{ loc: "https://a.fr/comparatif/tim", lastmod: null }], removed: [] });
    // Pas avant dimanche 18 h.
    expect((await runCompetitorCrawl(payload as never, { now: new Date("2026-11-21T10:00:00Z"), fetcher: v2 })).status).toBe("pas-encore");
  });
});

describe("Le rapport de Guy", () => {
  it("garde les constats complets, forts et d'achat d'abord", () => {
    const text = `<synthese>Alobees ouvre un comparatif.</synthese><constats>${JSON.stringify([
      { concurrent: "Kalitics", quoi: "Guide stock", intention: "information", impact: "fort", action: "a" },
      { concurrent: "Alobees", quoi: "Comparatif Alobees vs TIM", url: "https://a.fr/comparatif/tim", intention: "achat", timLaDeja: "non", impact: "fort", action: "Créer notre comparatif", prompt: "Écris…" },
      { concurrent: "", quoi: "x", action: "y" },
    ])}</constats>`;
    const out = parseCompetition(text)!;
    expect(out.findings.map((f) => [f.competitor, f.intent])).toEqual([
      ["Alobees", "achat"],
      ["Kalitics", "information"],
    ]);
    expect(out.findings[0].timHasIt).toBe("non");
  });

  it("dit pour chaque concurrent : première photo, ajouts, mises à jour récentes, rubriques", () => {
    const now = new Date("2026-11-16T07:00:00Z");
    const d = competitionData({
      now,
      competitors: [
        { id: 1, name: "Alobees", website: "https://a.fr", kind: "editeur" },
        { id: 2, name: "Obat", website: "https://o.fr", kind: "editeur" },
        { id: 3, name: "Kraaft", website: "https://k.fr", kind: "editeur" },
      ],
      maps: [
        { competitor: 1, status: "lu", count: 2, urls: [{ loc: "https://a.fr/blog/a", lastmod: "2026-11-10" }, { loc: "https://a.fr/blog/b", lastmod: "2025-01-01" }], added: null, removed: null, createdAt: "" },
        { competitor: 2, status: "illisible", error: "aucun plan", createdAt: "" },
      ],
      tim: [{ loc: "https://tim-management.co/comparatif/x", lastmod: null }],
    });
    const [a, o, k] = d.concurrents as Record<string, unknown>[];
    expect(a).toMatchObject({ premierePhoto: true, pages: 2, misesAJour14Jours: [{ page: "/blog/a", le: "2026-11-10" }], rubriques: [{ section: "blog", pages: 2 }] });
    expect(o.lecture).toMatch(/illisible/);
    expect(k.lecture).toBe("pas encore lu");
    expect(d.planDeTim).toMatchObject({ pages: 1, adresses: ["/comparatif/x"] });
  });
});
