import { beforeEach, describe, expect, it, vi } from "vitest";

import { ledgerOf } from "@/modules/ads/agent/engine";
import { TOOLS } from "@/modules/ads/agent/registry";
import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import { anonymousSummary, buckets, departement, MIN_GROUP, regionOf } from "@/modules/ads/agent/sources/acquisition";
import { libraryTokenReminderDue, libraryUrl, parseAds, searchAdLibrary } from "@/modules/ads/agent/sources/ad-library";
import { createSourcesPort } from "@/modules/ads/agent/sources/port";
import { htmlToText, isSiteUrl, MAX_PAGES, planSitePages, readSite, sitemapUrls } from "@/modules/ads/agent/sources/site";
import type { ToolContext } from "@/modules/ads/agent/tools";
import type { AgentDeps, AgentRow, SourcesPort, StepRow } from "@/modules/ads/agent/types";

import { memoryStore, unusedPort } from "./helpers/agent-memory";

const NOW = new Date("2026-10-05T08:00:00Z");

describe("site de TIM — liste blanche", () => {
  it("n'accepte que tim-management.co, en https", () => {
    expect(isSiteUrl("https://tim-management.co/tarifs")).toBe(true);
    expect(isSiteUrl("https://www.tim-management.co/")).toBe(true);
    expect(isSiteUrl("http://tim-management.co/")).toBe(false);
    expect(isSiteUrl("https://tim-management.co.evil.com/")).toBe(false);
    expect(isSiteUrl("https://concurrent.fr/")).toBe(false);
  });

  it("garde le texte lisible : ni scripts, ni menus, ni pied de page", () => {
    const html = `<html><head><title>Pointage &amp; chantier</title><script>var x=1</script></head><body><nav>Menu</nav><h1>Le pointage</h1><p>Sans papier&nbsp;!</p><footer>Mentions</footer></body></html>`;
    expect(htmlToText(html)).toEqual({ title: "Pointage & chantier", text: "Le pointage\nSans papier !" });
  });

  it("choisit les pages dans l'ordre décidé le 30/09/2026 — sur un extrait du vrai plan du site", () => {
    const O = "https://tim-management.co";
    const listed = [
      "calcul-avancement-chantier", "calcul-cout-revient-ouvrier", "politique-de-cookies-ue", "calculer-planning-ouvrier", "suivi-heures-chantier",
      "contact-visio", "centre-aide", "offres", "contact", "calculer-pointage-ouvrier", "plaquiste-peintre", "pointage-maconnerie", "employes-rh",
      "suivi-chantier", "plannings-engins", "plannings-ouvriers", "pointage-digital-mobile-chantier", "", "feuilles-dheures-btp", "actualite", "mentions-legales",
    ].map((p) => `${O}/${p}`.replace(/\/$/, ""));
    expect(planSitePages(listed)).toEqual([
      `${O}/`,
      `${O}/pointage-digital-mobile-chantier`,
      `${O}/feuilles-dheures-btp`,
      `${O}/plannings-ouvriers`,
      `${O}/suivi-chantier`,
      `${O}/offres`,
    ]);
    // Avec de la place : les autres pages de fonctionnalités, puis les calculateurs ; jamais une page légale.
    const more = planSitePages(listed, 30);
    expect(more.indexOf(`${O}/suivi-heures-chantier`)).toBeLessThan(more.indexOf(`${O}/calcul-avancement-chantier`));
    expect(more.some((u) => /cookies|mentions/.test(u))).toBe(false);
  });

  it("refuse une page légale demandée explicitement", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => "<p>ok</p>" }));
    const r = await readSite(fetcher, ["https://tim-management.co/politique-de-cookies-ue", "https://tim-management.co/offres"]);
    expect(r.refused).toEqual(["https://tim-management.co/politique-de-cookies-ue"]);
    expect(r.pages.map((p) => p.url)).toEqual(["https://tim-management.co/offres"]);
  });

  it("lit l'accueil puis le plan du site, borné, et refuse ce qui sort du domaine", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://tim-management.co/p${i}`);
    const fetcher = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => (url.endsWith("sitemap.xml") ? `<urlset>${urls.map((u) => `<loc>${u}</loc>`).join("")}<loc>https://ailleurs.fr/x</loc></urlset>` : `<title>${url}</title><p>ok</p>`),
    }));
    const r = await readSite(fetcher);
    expect(r.pages).toHaveLength(MAX_PAGES);
    expect(r.pages[0].url).toBe("https://tim-management.co/");
    expect(sitemapUrls(`<loc>https://ailleurs.fr/x</loc>`)).toEqual([]);
    const off = await readSite(fetcher, ["https://ailleurs.fr/x", "https://tim-management.co/tarifs"]);
    expect(off.refused).toEqual(["https://ailleurs.fr/x"]);
    expect(off.pages.map((p) => p.url)).toEqual(["https://tim-management.co/tarifs"]);
  });
});

describe("leads et clients — chiffres anonymes seulement (décision 5 du 29/09/2026)", () => {
  it("département et région depuis le code postal, Corse et outre-mer compris", () => {
    expect(departement("75011")).toBe("75");
    expect(departement("20090")).toBe("2A");
    expect(departement("20600")).toBe("2B");
    expect(departement("97400")).toBe("974");
    expect(departement("7501")).toBeNull();
    expect(regionOf("69003")).toBe("Auvergne-Rhône-Alpes");
    expect(regionOf("20090")).toBe("Corse");
    expect(regionOf("97200")).toBe("Outre-mer");
  });

  it(`fond dans « autres » tout groupe de moins de ${MIN_GROUP} : un petit groupe désigne quelqu'un`, () => {
    expect(buckets(["A", "A", "A", "B", "C", "C"])).toEqual([
      { valeur: "A", n: 3 },
      { valeur: `autres (groupes de moins de ${MIN_GROUP})`, n: 3 },
    ]);
  });

  it("conversion par canal, clients signés par canal / effectif / région, délai médian — rien d'autre", () => {
    const leads = [1, 2, 3, 4].map((i) => ({ id: i, channel: "meta-ads-facebook", createdAt: "2026-09-01T00:00:00Z" }));
    const clients = [1, 2, 3].map((i) => ({
      formSubmission: i,
      clientStatus: "actif",
      source: "meta-ads-facebook",
      collaborateurs: "11 à 50",
      postcode: "69003",
      createdAt: "2026-09-01T00:00:00Z",
      quoteSignedAt: `2026-09-${10 + i}T00:00:00Z`,
    }));
    const s = anonymousSummary(leads, clients, 12, NOW);
    expect(s.canaux[0]).toMatchObject({ leads: 4, opportunites: 3, gagnees: 3, conversionPct: 75 });
    expect(s.signes).toMatchObject({ total: 3, parEffectif: [{ valeur: "11 à 50", n: 3 }], parRegion: [{ valeur: "Auvergne-Rhône-Alpes", n: 3 }], delaiMedianJours: 11 });
    expect(s.manque[0]).toMatch(/métier/);
    // Aucun champ d'identité dans ce qui part vers l'agent.
    expect(JSON.stringify(s)).not.toMatch(/69003|siren|siret|name|nom|email/i);
  });

  it("le port ne lit des fiches que les champs des agrégats : ni nom, ni SIREN, ni adresse", async () => {
    const find = vi.fn(async () => ({ docs: [] }));
    await createSourcesPort({ find } as never, { now: () => NOW }).acquisition(12);
    const clientQuery = (find.mock.calls as unknown as [{ collection: string; select: Record<string, unknown> }][]).find((c) => c[0].collection === "partner-clients")![0];
    expect(Object.keys(clientQuery.select).sort()).toEqual(["clientStatus", "collaborateurs", "createdAt", "formSubmission", "geo", "quoteSignedAt", "source"]);
    expect(clientQuery.select.geo).toEqual({ postcode: true });
  });
});

describe("bibliothèque publicitaire Meta", () => {
  it("interroge la France, toutes publicités, sur les pages suivies ou des mots-clés", () => {
    const u = new URL(libraryUrl("jeton", { pageIds: ["123456"] }));
    expect(u.pathname).toBe("/v26.0/ads_archive");
    expect(u.searchParams.get("ad_reached_countries")).toBe('["FR"]');
    expect(u.searchParams.get("ad_type")).toBe("ALL");
    expect(u.searchParams.get("search_page_ids")).toBe('["123456"]');
    expect(u.searchParams.get("fields")).toContain("ad_delivery_start_time");
  });

  it("compte les jours de diffusion : jusqu'à aujourd'hui si elle tourne encore", () => {
    const [running, stopped] = parseAds(
      [
        { id: "1", ad_delivery_start_time: "2026-07-07T00:00:00Z" },
        { id: "2", ad_delivery_start_time: "2026-09-01T00:00:00Z", ad_delivery_stop_time: "2026-09-11T00:00:00Z" },
      ],
      NOW,
    );
    expect(running.runningDays).toBe(90);
    expect(stopped.runningDays).toBe(10);
  });

  it("sans jeton : refuse en disant quoi faire ; en mode simulé : des pubs marquées", async () => {
    const fetch = vi.fn();
    await expect(searchAdLibrary({ pageIds: ["1"] }, { fetch, env: {}, now: NOW })).rejects.toThrow(/META_AD_LIBRARY_TOKEN absent/);
    const sim = await searchAdLibrary({ pageIds: ["1"] }, { fetch, env: { ADS_AD_LIBRARY_MOCK: "1" }, now: NOW });
    expect(sim.every((a) => a.simulated && a.texts[0].startsWith("[SIMULÉ]"))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("jeton expiré (code 190) : le dit en clair", async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 190, message: "Session has expired" } }) }));
    await expect(searchAdLibrary({ searchTerms: "logiciel btp" }, { fetch, env: { META_AD_LIBRARY_TOKEN: "x" }, now: NOW })).rejects.toThrow(/expiré : à renouveler/);
  });

  it("rappel J-7 : dû un seul jour, quand il reste entre 6 et 7 jours", () => {
    expect(libraryTokenReminderDue("2026-10-12T07:00:00Z", NOW)).toBe(true);
    expect(libraryTokenReminderDue("2026-10-12T09:00:00Z", NOW)).toBe(false);
    expect(libraryTokenReminderDue("2026-10-11T07:00:00Z", NOW)).toBe(false);
    expect(libraryTokenReminderDue(null, NOW)).toBe(false);
  });
});

// ─── Les outils du stratège ─────────────────────────────────────────────────

let mem: ReturnType<typeof memoryStore>;
const budget = { assert: vi.fn(async () => {}), record: vi.fn(async () => {}) };
beforeEach(() => {
  mem = memoryStore();
  budget.assert.mockReset().mockResolvedValue(undefined);
  budget.record.mockReset().mockResolvedValue(undefined);
});

function sources(over: Partial<SourcesPort> = {}): SourcesPort {
  return {
    site: vi.fn(async () => ({ pages: [{ url: "https://tim-management.co/", title: "Accueil", text: "Le pointage sans papier." }], refused: [], failed: [] })),
    acquisition: vi.fn(async (months: number) => anonymousSummary([], [], months, NOW)),
    competitors: vi.fn(async () => [{ pageId: "111111", name: "Suivi" }]),
    adLibrary: vi.fn(async () => parseAds([{ id: "1", page_id: "111111", page_name: "Suivi", ad_creative_bodies: ["Pointez vite"], ad_delivery_start_time: "2026-07-07T00:00:00Z" }, { id: "2", page_id: "222222", page_name: "Nouveau", ad_creative_bodies: ["Devis rapides"] }], NOW)),
    proposeCompetitor: vi.fn(async () => "propose" as const),
    ...over,
  };
}

async function strategist(src: SourcesPort, budgetEur = 2) {
  const run = mem.newRun();
  const root = await mem.newRoot(run);
  const agent = await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role: "stratege", status: "en-cours", mission: "M", tools: [...ROLE_TOOLS.stratege], model: "claude-opus-5-5", budgetEur });
  const step = await mem.store.createStep({ run: run.id, agent: agent.id, seq: 0, kind: "outil", tool: "x", status: "en-cours", line: "", input: null, output: null, idempotencyKey: `${agent.id}:t`, startedAt: NOW.toISOString() });
  const model = vi.fn(async () => ({ content: [{ type: "text", text: "Résumé", citations: null }], stopReason: "end_turn", usage: { input: 3000, output: 400, cacheRead: 0, cacheWrite: 0 } })) as unknown as AgentDeps["model"];
  const deps: AgentDeps = { store: mem.store, model, budget, atelier: unusedPort("atelier"), sources: src, now: () => NOW };
  const agents = await mem.store.listAgents(run.id);
  const ctx: ToolContext = { deps, run, agent: agents.find((a) => a.id === agent.id) as AgentRow, agents, step: step as StepRow, ledger: (a) => ledgerOf(a, agents) };
  return { ctx, model };
}
const use = (ctx: ToolContext, name: string, input: Record<string, unknown> = {}) => TOOLS[name].run(ctx, input);

describe("outils de lecture du stratège", () => {
  it("lire_site : résumé par Haiku, payé sur le budget de l'agent et inscrit au registre", async () => {
    const { ctx, model } = await strategist(sources());
    const r = await use(ctx, "lire_site");
    expect((model as unknown as { mock: { calls: [{ model: string }][] } }).mock.calls[0][0].model).toBe("claude-haiku-4-5");
    expect(r).toMatchObject({ kind: "ok", output: { resume: "Résumé" } });
    expect(r.kind === "ok" && r.costEur).toBeGreaterThan(0);
    expect(budget.record).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-haiku-4-5", detail: "extraction — site" }));
  });

  it("lire_site : sans budget pour le résumé, rien n'est appelé", async () => {
    const { ctx, model } = await strategist(sources(), 0.0001);
    expect(await use(ctx, "lire_site")).toMatchObject({ isError: true });
    expect(model).not.toHaveBeenCalled();
  });

  it("lire_pubs_concurrents : sans concurrent suivi, le dit, sans rien appeler", async () => {
    const src = sources({ competitors: vi.fn(async () => []) });
    const { ctx, model } = await strategist(src);
    const r = await use(ctx, "lire_pubs_concurrents");
    expect(r).toMatchObject({ output: { concurrents: 0, note: expect.stringMatching(/Paramètres › Concurrents/) } });
    expect(src.adLibrary).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
  });

  it("lire_pubs_concurrents : ne lit que les pages SUIVIES, et signale la plus longue diffusion", async () => {
    const src = sources();
    const { ctx } = await strategist(src);
    const r = await use(ctx, "lire_pubs_concurrents");
    expect(src.adLibrary).toHaveBeenCalledWith({ pageIds: ["111111"] });
    expect(r).toMatchObject({ output: { pubs: 2, plusLongueDiffusionJours: 90 } });
  });

  it("rechercher_concurrents : n'annonce que des annonceurs non suivis", async () => {
    const { ctx } = await strategist(sources());
    const r = await use(ctx, "rechercher_concurrents", { mots_cles: "pointage chantier" });
    expect(r).toMatchObject({ output: { annonceurs: [{ pageId: "222222", nom: "Nouveau", pubs: 1 }] } });
  });

  it("proposer_concurrent : identifiant vérifié, proposition journalisée, jamais « suivi » d'office", async () => {
    const src = sources();
    const { ctx } = await strategist(src);
    expect(await use(ctx, "proposer_concurrent", { page_id: "abc", nom: "X", mots_cles: "k", justification: "j" })).toMatchObject({ isError: true });
    await use(ctx, "proposer_concurrent", { page_id: "222222", nom: "Nouveau", mots_cles: "pointage chantier", justification: "Diffuse depuis 3 mois" });
    expect(src.proposeCompetitor).toHaveBeenCalledWith(expect.objectContaining({ pageId: "222222", keywords: "pointage chantier" }));
    expect(mem.decisions).toEqual([expect.objectContaining({ kind: "concurrent", status: "proposee", rationale: "Diffuse depuis 3 mois" })]);
  });

  it("le port ne crée qu'une proposition, et ne propose pas deux fois la même page", async () => {
    const create = vi.fn(async () => ({}));
    let count = 0;
    const port = createSourcesPort({ count: vi.fn(async () => ({ totalDocs: count })), create } as never, { now: () => NOW });
    expect(await port.proposeCompetitor({ pageId: "222222", name: "N", keywords: "k", rationale: "r", run: 7 })).toBe("propose");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "propose", proposedBy: 7 }) }));
    count = 1;
    expect(await port.proposeCompetitor({ pageId: "222222", name: "N", keywords: "k", rationale: "r", run: 7 })).toBe("deja-connu");
  });
});
