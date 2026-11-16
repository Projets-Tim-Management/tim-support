import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Relecture « niveau expert » du 12/11/2026 : ce qui a changé de comportement
 * en dédoublonnant — verrouillé ici pour que rien ne saute ensuite.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});

describe("Jeton Google : un seul, même quand dix lectures partent ensemble", () => {
  it("à froid, dix demandes simultanées ne signent et ne demandent qu'un jeton", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("GSC_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "seo@test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "jeton-1", expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { googleAccessToken } = await import("@/modules/analytics/lib/seo-google-auth");
    const tokens = await Promise.all(Array.from({ length: 10 }, () => googleAccessToken()));
    expect(new Set(tokens)).toEqual(new Set(["jeton-1"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Encore valable : aucune nouvelle demande.
    await googleAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Cache et chargement d'une source", () => {
  it("loadSource : à connecter, réussite datée, panne en une phrase — et le cache sert la réussite", async () => {
    const { loadSource } = await import("@/modules/analytics/lib/seo-cache");
    expect(await loadSource(["VARIABLE_ABSENTE_TEST"], "k0", 1000, async () => 1)).toEqual({ status: "missing", missing: ["VARIABLE_ABSENTE_TEST"] });
    vi.stubEnv("VARIABLE_TEST", "x");
    const load = vi.fn(async () => 42);
    const ok = await loadSource(["VARIABLE_TEST"], "k1", 60_000, load);
    expect(ok).toMatchObject({ status: "ok", data: 42 });
    await loadSource(["VARIABLE_TEST"], "k1", 60_000, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await loadSource(["VARIABLE_TEST"], "k2", 60_000, async () => Promise.reject(new Error("GA4 : quota dépassé.")))).toEqual({ status: "error", message: "GA4 : quota dépassé." });
  });

  it("une entrée périmée est relue, et le ménage retire celles de plus d'un jour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T08:00:00Z"));
    const { cached } = await import("@/modules/analytics/lib/seo-cache");
    const load = vi.fn(async () => "v");
    await cached("vieux", 1000, load);
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    await cached("neuf", 1000, async () => "n"); // déclenche le ménage
    await cached("vieux", 48 * 3600_000, load); // même avec un long TTL : l'entrée a été retirée
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("Google Ads : les concurrents s'appliquent après le cache", () => {
  it("une liste de concurrents modifiée compte tout de suite, sans relire Google", async () => {
    vi.stubEnv("GOOGLE_ADS_CUSTOMER_ID", "3358483794");
    vi.stubEnv("GSC_SERVICE_ACCOUNT_JSON", "{}");
    const googlePost = vi.fn(async (_url: string, body: { query: string }) => ({
      results: body.query.includes("search_term_view") ? [{ searchTermView: { searchTerm: "logiciel kraaft" }, metrics: { costMicros: "12000000", clicks: "3", conversions: 0 } }] : [],
    }));
    vi.doMock("@/modules/analytics/lib/seo-google-auth", () => ({ googlePost }));
    const { loadGoogleAds } = await import("@/modules/analytics/lib/google-ads");
    const now = new Date("2026-11-12T10:00:00Z");
    const a = await loadGoogleAds([], 3, now);
    const calls = googlePost.mock.calls.length;
    const b = await loadGoogleAds(["Kraaft"], 3, now);
    expect(googlePost.mock.calls.length).toBe(calls);
    expect(a.status === "ok" && a.data.searchTerms[0].competitor).toBeNull();
    expect(b.status === "ok" && b.data.searchTerms[0].competitor).toBe("Kraaft");
  });

  it("le jour de fin est celui de Paris", async () => {
    vi.stubEnv("GOOGLE_ADS_CUSTOMER_ID", "3358483794");
    vi.stubEnv("GSC_SERVICE_ACCOUNT_JSON", "{}");
    const googlePost = vi.fn(async () => ({ results: [] }));
    vi.doMock("@/modules/analytics/lib/seo-google-auth", () => ({ googlePost }));
    const { loadGoogleAds } = await import("@/modules/analytics/lib/google-ads");
    // 23 h 30 UTC le 31 octobre = 0 h 30 le 1er novembre à Paris.
    await loadGoogleAds([], 3, new Date("2026-10-31T23:30:00Z"));
    const monthly = (googlePost.mock.calls as unknown as [string, { query: string }][]).find(([, b]) => b.query.includes("segments.month"))!;
    expect(monthly[1].query).toContain("AND '2026-11-01'");
  });
});

describe("Test d'une connexion : borné, et le message dit ce qui s'est passé", () => {
  it("pas de réponse à temps : « Aucune réponse en 15 s »", async () => {
    vi.useFakeTimers();
    vi.doMock("@/modules/analytics/lib/openai-ads", () => ({ pingOpenAiAds: () => new Promise(() => {}) }));
    const { testConnection } = await import("@/core/lib/support-connections-test");
    vi.stubEnv("OPENAI_ADS_API_KEY", "x");
    const p = testConnection("openai-ads", {} as never);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await p).toMatchObject({ ok: false, message: "Aucune réponse en 15 s." });
  });

  it("un refus du service garde sa phrase (pas « Injoignable »)", async () => {
    vi.doMock("@/modules/analytics/lib/openai-ads", () => ({ pingOpenAiAds: async () => Promise.reject(new Error("ChatGPT Ads : accès refusé.")) }));
    const { testConnection } = await import("@/core/lib/support-connections-test");
    vi.stubEnv("OPENAI_ADS_API_KEY", "x");
    expect(await testConnection("openai-ads", {} as never)).toMatchObject({ ok: false, message: "ChatGPT Ads : accès refusé." });
  });
});

describe("Jours de Paris et lectures bornées", () => {
  it("le 1er à 0 h 30 à Paris, c'est le jour 1 du mois (et non le 31 du précédent)", async () => {
    const { parisMonthDays, parisMonthStart } = await import("@/modules/ai-team/lib/format");
    const now = new Date("2026-10-31T23:30:00Z");
    expect(parisMonthDays(now)).toEqual({ day: 1, daysInMonth: 30 });
    expect(new Date(parisMonthStart(now)).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("la dernière méthode de chaque agent : une requête par agent, limitée à une ligne, sans le texte par défaut", async () => {
    const { latestMethods } = await import("@/modules/ai-team/lib/shared-data");
    const find = vi.fn(async ({ where }: { where: { and: { member: { equals: number } }[] } }) => ({ docs: where.and[0].member.equals === 2 ? [] : [{ id: 9, member: where.and[0].member.equals, week: "2026-11-09", createdAt: "2026-11-15T19:00:00Z" }] }));
    const m = await latestMethods({ find } as never, [1, 2]);
    expect([...m.keys()]).toEqual(["1"]);
    expect(find).toHaveBeenCalledTimes(2);
    for (const [args] of find.mock.calls as unknown as [{ limit: number; select: Record<string, boolean> }][]) {
      expect(args.limit).toBe(1);
      expect(args.select.method).toBeUndefined();
    }
  });
});
