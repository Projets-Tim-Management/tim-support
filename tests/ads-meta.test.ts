import { describe, expect, it } from "vitest";

import { PlatformNotConfigured, getPlatform, isMetaMock } from "@/modules/ads/platforms";
import { createMetaPlatform, metaAmount, metaLeads, metaObjective, metaStatus } from "@/modules/ads/platforms/meta";
import { MOCK_ACCOUNT_ID, MOCK_PREFIX, createMockMetaPlatform, daysBetween } from "@/modules/ads/platforms/meta-mock";
import { AdTokenError } from "@/modules/ads/platforms/types";

const NOW = new Date("2026-09-29T08:00:00.000Z");
const acc = { externalId: "act_42", token: "EAAB", currency: "EUR", timezone: "Europe/Paris" };

/** Un faux Graph : chaque URL demandée est notée, la réponse vient d'une table de routes. */
function graph(routes: [RegExp, unknown, number?][]) {
  const seen: URL[] = [];
  const fetch = async (u: string) => {
    const url = new URL(u);
    seen.push(url);
    const hit = routes.find(([re]) => re.test(url.pathname + url.search));
    if (!hit) return new Response(JSON.stringify({ error: { message: `route absente : ${url.pathname}`, code: 100 } }), { status: 400 });
    return new Response(JSON.stringify(hit[1]), { status: hit[2] ?? 200 });
  };
  const platform = createMetaPlatform({ appId: "app", appSecret: "secret", version: "v26.0", fetch, now: () => NOW });
  return { platform, seen };
}

describe("traductions Meta → modèle commun", () => {
  it("normalise l'objectif, et range l'inconnu dans « autre »", () => {
    expect(metaObjective("OUTCOME_LEADS")).toBe("leads");
    expect(metaObjective("OUTCOME_TRAFFIC")).toBe("trafic");
    expect(metaObjective("OUTCOME_AWARENESS")).toBe("notoriete");
    expect(metaObjective("OUTCOME_SALES")).toBe("autre");
  });

  it("lit l'état configuré, pas l'état de diffusion", () => {
    expect(metaStatus("ACTIVE")).toBe("active");
    expect(metaStatus("PAUSED")).toBe("en-pause");
    expect(metaStatus("ARCHIVED")).toBe("terminee");
    expect(metaStatus("DELETED")).toBe("terminee");
  });

  it("convertit les budgets en centièmes, sauf devises sans centimes", () => {
    expect(metaAmount("4000", "EUR")).toBe(40);
    expect(metaAmount("4000", "JPY")).toBe(4000);
    expect(metaAmount(undefined, "EUR")).toBeNull();
  });

  it("compte les leads une seule fois : l'agrégat s'il existe, sinon ses parties", () => {
    const both = [
      { action_type: "lead", value: "5" },
      { action_type: "onsite_conversion.lead_grouped", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "2" },
      { action_type: "link_click", value: "80" },
    ];
    expect(metaLeads(both)).toBe(5);
    expect(metaLeads(both.slice(1))).toBe(5);
    expect(metaLeads(undefined)).toBe(0);
  });
});

describe("adaptateur Meta (API Graph simulée)", () => {
  it("OAuth : code → jeton court → jeton longue durée, avec son échéance", async () => {
    const { platform, seen } = graph([
      [/fb_exchange_token=short/, { access_token: "long", expires_in: 5_184_000 }],
      [/oauth\/access_token.*code=abc/, { access_token: "short" }],
    ]);
    const t = await platform.connect("abc", "https://support.example/cb");
    expect(t.token).toBe("long");
    expect(t.expiresAt?.toISOString()).toBe("2026-11-28T08:00:00.000Z"); // 60 jours
    expect(seen[0].searchParams.get("redirect_uri")).toBe("https://support.example/cb");
    expect(seen[1].searchParams.get("grant_type")).toBe("fb_exchange_token");
  });

  it("liste les comptes en suivant la pagination", async () => {
    const { platform } = graph([
      [/after=p2/, { data: [{ id: "act_2", name: "Deux", currency: "EUR", timezone_name: "Europe/Paris" }] }],
      [/me\/adaccounts/, { data: [{ id: "act_1", name: "Un", currency: "EUR", timezone_name: "Europe/Paris" }], paging: { next: "https://graph.facebook.com/v26.0/me/adaccounts?after=p2" } }],
    ]);
    expect((await platform.listAccounts("EAAB")).map((a) => a.externalId)).toEqual(["act_1", "act_2"]);
  });

  it("lit les campagnes d'un compte, budgets convertis", async () => {
    const { platform } = graph([
      [/act_42\/campaigns/, { data: [{ id: "c1", name: "Pointage", objective: "OUTCOME_LEADS", status: "PAUSED", effective_status: "CAMPAIGN_PAUSED", daily_budget: "2550" }] }],
    ]);
    expect(await platform.listCampaigns(acc)).toEqual([
      { externalId: "c1", name: "Pointage", objective: "leads", status: "en-pause", externalStatus: "CAMPAIGN_PAUSED", dailyBudget: 25.5 },
    ]);
  });

  it("lit les métriques jour par jour, au niveau demandé", async () => {
    const { platform, seen } = graph([
      [
        /act_42\/insights/,
        {
          data: [
            { date_start: "2026-09-27", campaign_id: "c1", campaign_name: "Pointage", adset_id: "s1", adset_name: "BTP 11-50", spend: "12.34", impressions: "1500", clicks: "20", actions: [{ action_type: "lead", value: "2" }] },
          ],
        },
      ],
    ]);
    const rows = await platform.fetchMetrics(acc, { since: "2026-09-27", until: "2026-09-27" }, "adset");
    expect(rows).toEqual([
      { level: "adset", externalId: "s1", name: "BTP 11-50", campaignExternalId: "c1", day: "2026-09-27", spend: 12.34, impressions: 1500, clicks: 20, leads: 2 },
    ]);
    const q = seen[0].searchParams;
    expect(q.get("level")).toBe("adset");
    expect(q.get("time_increment")).toBe("1");
    expect(JSON.parse(q.get("time_range")!)).toEqual({ since: "2026-09-27", until: "2026-09-27" });
  });

  it("un jeton expiré ou révoqué lève AdTokenError — le compte passera « expiré », pas « en erreur »", async () => {
    const { platform } = graph([[/campaigns/, { error: { message: "Session has expired", type: "OAuthException", code: 190 } }, 400]]);
    await expect(platform.listCampaigns(acc)).rejects.toBeInstanceOf(AdTokenError);
  });

  it("une autre erreur Graph reste une erreur ordinaire, message compris", async () => {
    const { platform } = graph([[/campaigns/, { error: { message: "User request limit reached", code: 17 } }, 400]]);
    const err = await platform.listCampaigns(acc).catch((e: Error) => e);
    expect(err).not.toBeInstanceOf(AdTokenError);
    expect((err as Error).message).toMatch(/17.*limit/);
  });

  it("ne déclare que la lecture : aucune méthode d'écriture", () => {
    const { platform } = graph([]);
    expect(platform.capabilities).toEqual(["lecture"]);
    expect(platform.setBudget).toBeUndefined();
    expect(platform.setStatus).toBeUndefined();
  });
});

describe("Meta simulé (ADS_META_MOCK=1)", () => {
  const mock = createMockMetaPlatform();
  const range = { since: "2026-09-01", until: "2026-09-07" };

  it("est choisi par le drapeau, et le vrai adaptateur exige ses clés", () => {
    expect(isMetaMock({ ADS_META_MOCK: "1" })).toBe(true);
    expect(isMetaMock({})).toBe(false);
    expect((getPlatform("meta", { ADS_META_MOCK: "1" }).listAccounts as unknown) instanceof Function).toBe(true);
    expect(() => getPlatform("meta", {})).toThrow(PlatformNotConfigured);
    expect(() => getPlatform("google", {})).toThrow(/Aucun adaptateur/);
  });

  it("est déterministe : les mêmes jours donnent les mêmes chiffres", async () => {
    expect(await mock.fetchMetrics({ ...acc, externalId: MOCK_ACCOUNT_ID }, range, "campaign")).toEqual(
      await mock.fetchMetrics({ ...acc, externalId: MOCK_ACCOUNT_ID }, range, "campaign"),
    );
  });

  it("donne une ligne par jour et par campagne, et rien pour une campagne en pause", async () => {
    const rows = await mock.fetchMetrics(acc, range, "campaign");
    const campaigns = await mock.listCampaigns(acc);
    expect(rows).toHaveLength(daysBetween(range).length * campaigns.length);
    const paused = campaigns.find((c) => c.status === "en-pause")!;
    expect(rows.filter((r) => r.externalId === paused.externalId).every((r) => r.spend === 0)).toBe(true);
  });

  it("retombe exactement sur la campagne quand on additionne ses ensembles et ses annonces", async () => {
    const [byCampaign, byAdset, byAd] = await Promise.all(
      (["campaign", "adset", "ad"] as const).map((l) => mock.fetchMetrics(acc, range, l)),
    );
    const total = (rows: typeof byCampaign, k: "spend" | "impressions" | "clicks" | "leads") =>
      Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;
    for (const k of ["spend", "impressions", "clicks", "leads"] as const) {
      expect(total(byAdset, k), k).toBe(total(byCampaign, k));
      expect(total(byAd, k), k).toBe(total(byCampaign, k));
    }
  });

  it("préfixe le compte et chaque campagne : dev et prod partagent la base", async () => {
    expect(MOCK_PREFIX).toBe("[SIMULÉ]");
    for (const a of await mock.listAccounts("x")) expect(a.name.startsWith(`${MOCK_PREFIX} `)).toBe(true);
    for (const c of await mock.listCampaigns(acc)) expect(c.name.startsWith(`${MOCK_PREFIX} `)).toBe(true);
  });

  it("compte les jours bornes incluses", () => {
    expect(daysBetween({ since: "2026-09-29", until: "2026-10-01" })).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });
});
