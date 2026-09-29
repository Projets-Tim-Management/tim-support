import { describe, expect, it } from "vitest";

import { encryptSecret } from "@/core/lib/secrets";
import { runAdsSync } from "@/modules/ads/lib/sync-run";
import { campaignKpis, dayInTz, sameValue, syncAccount, syncDecision, syncWindow, tokenAlertDue, type RawAccount } from "@/modules/ads/lib/sync";
import { MOCK_ACCOUNT_ID, createMockMetaPlatform } from "@/modules/ads/platforms/meta-mock";
import { AdTokenError, type AdPlatform } from "@/modules/ads/platforms/types";

process.env.PAYLOAD_SECRET = "secret-de-test-synchro";

const NOW = new Date("2026-09-29T08:00:00.000Z");

type Doc = Record<string, unknown> & { id: number };
type Where = Record<string, unknown>;

/** Une base en mémoire : juste ce que la synchro utilise (find, update, create, db.find, sendEmail). */
function memoryPayload(seed: Record<string, Doc[]> = {}) {
  const tables: Record<string, Doc[]> = { "ad-accounts": [], "ad-campaigns": [], "ad-metrics-daily": [], users: [], ...seed };
  let next = 1000;
  const mails: { to: string; subject: string; text: string }[] = [];
  const writes = { create: 0, update: 0 };
  const match = (d: Doc, w: Where): boolean =>
    Object.entries(w ?? {}).every(([k, cond]) => {
      if (k === "and") return (cond as Where[]).every((c) => match(d, c));
      const c = cond as Record<string, unknown>;
      const v = d[k];
      if ("equals" in c) return String(v) === String(c.equals);
      if ("in" in c) return (c.in as unknown[]).map(String).includes(String(v)) || (Array.isArray(v) && v.some((x) => (c.in as unknown[]).includes(x)));
      if ("greater_than_equal" in c) return String(v) >= String(c.greater_than_equal);
      if ("less_than_equal" in c) return String(v) <= String(c.less_than_equal);
      return true;
    });
  const payload = {
    find: async ({ collection, where }: { collection: string; where?: Where }) => ({ docs: tables[collection].filter((d) => match(d, where ?? {})) }),
    update: async ({ collection, id, data }: { collection: string; id: number; data: Doc }) => {
      writes.update++;
      const d = tables[collection].find((x) => String(x.id) === String(id))!;
      Object.assign(d, data);
      return d;
    },
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      writes.create++;
      const d = { ...data, id: next++ };
      tables[collection].push(d);
      return d;
    },
    db: { find: async ({ collection, where }: { collection: string; where?: Where }) => ({ docs: tables[collection].filter((d) => match(d, where ?? {})) }) },
    sendEmail: async (m: { to: string; subject: string; text: string }) => void mails.push(m),
    logger: { info() {}, warn() {}, error() {} },
  };
  return { payload: payload as never, tables, mails, writes };
}

const simulated = (over: Partial<RawAccount> = {}): Doc =>
  ({
    id: 1,
    name: "[SIMULÉ] TIM — compte simulé",
    platform: "meta",
    externalId: MOCK_ACCOUNT_ID,
    status: "connecte",
    currency: "EUR",
    timezone: "Europe/Paris",
    token: encryptSecret("jeton-simule"),
    tokenExpiresAt: "2026-11-28T08:00:00.000Z",
    ...over,
  }) as Doc;

describe("fenêtre et jour", () => {
  it("compte le jour dans le fuseau du compte, pas en UTC", () => {
    // 29/09 à 23 h 30 UTC = déjà le 30 à Paris.
    expect(dayInTz(new Date("2026-09-29T23:30:00Z"), "Europe/Paris")).toBe("2026-09-30");
    expect(dayInTz(new Date("2026-09-29T23:30:00Z"), "America/New_York")).toBe("2026-09-29");
  });

  it("relit les 7 derniers jours, aujourd'hui compris", () => {
    expect(syncWindow(NOW, "Europe/Paris")).toEqual({ since: "2026-09-23", until: "2026-09-29" });
  });
});

describe("qui est synchronisé (base partagée dev / production)", () => {
  it("jamais un compte archivé", () => {
    expect(syncDecision({ status: "archive", externalId: "act_1" }, false)).toBe("archive");
  });
  it("un compte simulé seulement en mode simulé — la production n'envoie pas le jeton factice à Meta", () => {
    expect(syncDecision({ externalId: MOCK_ACCOUNT_ID }, true)).toBe("ok");
    expect(syncDecision({ externalId: MOCK_ACCOUNT_ID }, false)).toBe("simule-hors-mode-simule");
  });
  it("un compte réel jamais en mode simulé — aucun chiffre inventé sur un vrai compte", () => {
    expect(syncDecision({ externalId: "act_42" }, false)).toBe("ok");
    expect(syncDecision({ externalId: "act_42" }, true)).toBe("reel-en-mode-simule");
  });
});

describe("alerte J-7", () => {
  const base = { id: 1, token: "x", tokenExpiresAt: "2026-10-04T08:00:00.000Z" };
  it("part à 7 jours ou moins d'une échéance OAuth, une seule fois", () => {
    expect(tokenAlertDue(base, NOW)).toBe(true);
    expect(tokenAlertDue({ ...base, tokenAlertSentAt: "2026-09-28T00:00:00Z" }, NOW)).toBe(false);
    expect(tokenAlertDue({ ...base, tokenExpiresAt: "2026-10-20T08:00:00.000Z" }, NOW)).toBe(false);
    expect(tokenAlertDue({ ...base, tokenExpiresAt: "2026-09-28T08:00:00.000Z" }, NOW)).toBe(false); // déjà échu : c'est l'état « expiré »
  });
  it("jamais pour un jeton d'utilisateur système", () => {
    expect(tokenAlertDue({ ...base, systemUserToken: "y" }, NOW)).toBe(false);
  });
});

describe("synchro d'un compte", () => {
  const mock = createMockMetaPlatform();

  it("écrit campagnes et chiffres aux trois niveaux, sur la fenêtre", async () => {
    const { payload, tables } = memoryPayload({ "ad-accounts": [simulated()] });
    const r = await syncAccount(payload, simulated(), mock, NOW);
    expect(r).toMatchObject({ status: "connecte", campaigns: 3, unchanged: 0 });
    // 7 jours × (3 campagnes + 6 ensembles + 12 annonces)
    expect(tables["ad-metrics-daily"]).toHaveLength(7 * 21);
    expect(r.written).toBe(7 * 21);
    const days = new Set(tables["ad-metrics-daily"].map((d) => d.day));
    expect([...days].sort()).toEqual(["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]);
    expect(tables["ad-campaigns"].map((c) => c.name)).toEqual(expect.arrayContaining([expect.stringMatching(/^\[SIMULÉ\] /)]));
    expect(tables["ad-accounts"][0]).toMatchObject({ status: "connecte", lastError: null, lastSyncAt: NOW.toISOString() });
  });

  it("rejouée, ne réécrit rien d'inchangé et ne crée aucun doublon", async () => {
    const { payload, tables, writes } = memoryPayload({ "ad-accounts": [simulated()] });
    await syncAccount(payload, simulated(), mock, NOW);
    const before = { ...writes };
    const r = await syncAccount(payload, simulated(), mock, NOW);
    expect(r).toMatchObject({ written: 0, unchanged: 7 * 21 });
    expect(tables["ad-metrics-daily"]).toHaveLength(7 * 21);
    expect(tables["ad-campaigns"]).toHaveLength(3);
    expect(writes.create).toBe(before.create); // aucune création au second passage
  });

  it("consolide les chiffres de la campagne (dépense, leads, CPL)", async () => {
    const { payload, tables } = memoryPayload({ "ad-accounts": [simulated()] });
    await syncAccount(payload, simulated(), mock, NOW);
    const leads = tables["ad-campaigns"].find((c) => c.objective === "leads")!;
    const k = leads.kpis as ReturnType<typeof campaignKpis>;
    const rows = tables["ad-metrics-daily"].filter((d) => d.level === "campaign" && d.externalId === leads.externalId);
    expect(k.spend).toBeCloseTo(rows.reduce((s, d) => s + (d.spend as number), 0), 2);
    expect(k.cpl).toBe(k.leads ? Math.round((k.spend / k.leads) * 100) / 100 : null);
  });

  it("jeton refusé par la régie → « expiré », avec le message sur la fiche", async () => {
    const failing: AdPlatform = { ...mock, listCampaigns: async () => { throw new AdTokenError("Meta 190 : Session has expired"); } };
    const { payload, tables } = memoryPayload({ "ad-accounts": [simulated()] });
    const r = await syncAccount(payload, simulated(), failing, NOW);
    expect(r.status).toBe("expire");
    expect(tables["ad-accounts"][0]).toMatchObject({ status: "expire", lastError: "Meta 190 : Session has expired" });
  });

  it("autre erreur → « en erreur », sans toucher aux chiffres déjà lus", async () => {
    const { payload, tables } = memoryPayload({ "ad-accounts": [simulated()] });
    await syncAccount(payload, simulated(), mock, NOW);
    const failing: AdPlatform = { ...mock, fetchMetrics: async () => { throw new Error("Meta 17 : User request limit reached"); } };
    const r = await syncAccount(payload, simulated(), failing, NOW);
    expect(r.status).toBe("erreur");
    expect(tables["ad-metrics-daily"]).toHaveLength(7 * 21);
  });

  it("jeton OAuth échu → « expiré » sans appeler la régie ; le jeton système, lui, n'expire pas", async () => {
    const expired = simulated({ tokenExpiresAt: "2026-09-01T00:00:00.000Z" });
    const { payload } = memoryPayload({ "ad-accounts": [expired] });
    let called = false;
    const spy: AdPlatform = { ...mock, listCampaigns: async (a) => ((called = true), mock.listCampaigns(a)) };
    expect((await syncAccount(payload, expired, spy, NOW)).status).toBe("expire");
    expect(called).toBe(false);
    const withSystem = simulated({ tokenExpiresAt: "2026-09-01T00:00:00.000Z", systemUserToken: encryptSecret("systeme") });
    expect((await syncAccount(memoryPayload({ "ad-accounts": [withSystem] }).payload, withSystem, spy, NOW)).status).toBe("connecte");
  });

  it("compare une colonne numérique revenue en chaîne", () => {
    expect(sameValue("12.3", 12.3)).toBe(true);
    expect(sameValue(null, 0)).toBe(false);
    expect(sameValue("abc", "abc")).toBe(true);
  });
});

describe("un passage complet", () => {
  it("isole les comptes : un compte réel est ignoré en mode simulé, l'archivé toujours", async () => {
    const { payload } = memoryPayload({
      "ad-accounts": [simulated(), simulated({ id: 2, name: "Vrai compte", externalId: "act_42" }), simulated({ id: 3, name: "Ancien", externalId: "act_7", status: "archive" })],
    });
    const { results } = await runAdsSync(payload, { now: NOW, env: { ADS_META_MOCK: "1" } });
    expect(results.map((r) => [r.name, r.decision, r.status ?? null])).toEqual([
      ["[SIMULÉ] TIM — compte simulé", "ok", "connecte"],
      ["Vrai compte", "reel-en-mode-simule", null],
      ["Ancien", "archive", null],
    ]);
  });

  it("un compte en erreur n'arrête pas les suivants", async () => {
    const { payload } = memoryPayload({ "ad-accounts": [simulated({ id: 1, externalId: "act_1" }), simulated({ id: 2, externalId: "act_2" })] });
    const ok = createMockMetaPlatform();
    let n = 0;
    const flaky = (): AdPlatform => (++n === 1 ? { ...ok, listCampaigns: async () => { throw new Error("panne"); } } : ok);
    const { results } = await runAdsSync(payload, { now: NOW, env: {}, platformFor: flaky });
    expect(results.map((r) => r.status)).toEqual(["erreur", "connecte"]);
  });

  it("envoie l'alerte J-7 aux admins une seule fois", async () => {
    const soon = simulated({ tokenExpiresAt: "2026-10-03T08:00:00.000Z" });
    const { payload, mails, tables } = memoryPayload({ "ad-accounts": [soon], users: [{ id: 9, email: "admin@tim.test", roles: ["admin"] }] });
    await runAdsSync(payload, { now: NOW, env: { ADS_META_MOCK: "1" } });
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("admin@tim.test");
    expect(mails[0].subject).toMatch(/1 compte\(s\) à reconnecter/);
    expect(tables["ad-accounts"][0].tokenAlertSentAt).toBe(NOW.toISOString());
    await runAdsSync(payload, { now: NOW, env: { ADS_META_MOCK: "1" } });
    expect(mails).toHaveLength(1);
  });

  it("à blanc : ne lit rien chez la régie et n'écrit rien", async () => {
    const { payload, writes } = memoryPayload({ "ad-accounts": [simulated()] });
    const { results } = await runAdsSync(payload, { now: NOW, env: { ADS_META_MOCK: "1" }, dry: true });
    expect(results[0].decision).toBe("ok");
    expect(writes).toEqual({ create: 0, update: 0 });
  });
});
