import { beforeEach, describe, expect, it, vi } from "vitest";

import { detectAlerts, type CampaignIn, type DayIn, type ObjectIn } from "@/modules/ads/lib/alerts";

const submitAction = vi.fn(async () => ({ decision: 77, verdict: { outcome: "executer", reasons: [] }, error: null }));
vi.mock("@/modules/ads/lib/actions-run", () => ({ submitAction: (...a: unknown[]) => submitAction(...(a as [])) }));

const { checkLanding, runAlerts } = await import("@/modules/ads/lib/alerts-run");

const NOW = new Date("2026-10-29T12:00:00.000Z");
const C: CampaignIn = { id: 7, name: "Campagne test", externalId: "120256556389760309", activatedAt: "2026-10-20T07:26:00.000Z" };
const adset = (over: Partial<ObjectIn> = {}): ObjectIn => ({ level: "adset", externalId: "120256556442340309", name: "BTP", campaignExternalId: C.externalId, status: "ACTIVE", effectiveStatus: "ACTIVE", dailyBudget: 9, issues: [], ...over });
const ad = (over: Partial<ObjectIn> = {}): ObjectIn => ({ level: "ad", externalId: "120256556940760309", name: "C19", campaignExternalId: C.externalId, status: "ACTIVE", effectiveStatus: "ACTIVE", dailyBudget: null, issues: [], ...over });
const day = (d: string, over: Partial<DayIn> = {}): DayIn => ({ campaignExternalId: C.externalId, day: d, spend: 8, impressions: 1200, landingViews: 10, leads: 0, siteLeads: 1, ...over });
const week = (over: Partial<DayIn> = {}) => ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"].map((d) => day(d, over));
const detect = (over: Partial<Parameters<typeof detectAlerts>[0]> = {}) =>
  detectAlerts({ campaigns: [C], objects: [adset(), ad()], days: week(), today: "2026-10-29", yesterday: "2026-10-28", now: NOW, landing: new Map(), ...over });

describe("les urgences, détectées par le code", () => {
  it("une campagne qui tourne normalement ne lève rien", () => {
    expect(detect()).toEqual([]);
  });

  it("une pub refusée se coupe en urgence, avec ce que Meta lui reproche", () => {
    const [a] = detect({ objects: [adset(), ad({ effectiveStatus: "DISAPPROVED", issues: ["Règle : texte trompeur"] })] });
    expect(a).toMatchObject({ kind: "pub-refusee", level: "ad", action: { kind: "pause", level: "ad", urgence: true } });
    expect(a.detail).toContain("texte trompeur");
    // Déjà en pause : plus rien à faire.
    expect(detect({ objects: [adset(), ad({ effectiveStatus: "DISAPPROVED", status: "PAUSED" })] })).toEqual([]);
  });

  it("au-delà de 175 % du budget du jour, la campagne se met en pause d'alerte", () => {
    const days = [...week().slice(0, 6), day("2026-10-29", { spend: 16 })];
    const [a] = detect({ days });
    expect(a).toMatchObject({ kind: "depense-anormale", action: { kind: "pause", level: "campaign", alerte: true } });
    expect(detect({ days: [...week().slice(0, 6), day("2026-10-29", { spend: 15.7 })] })).toEqual([]);
  });

  it("aucune impression hier ni aujourd'hui : diffusion nulle, sans action", () => {
    const days = [...week().slice(0, 5), day("2026-10-28", { impressions: 0, spend: 0 }), day("2026-10-29", { impressions: 0, spend: 0 })];
    expect(detect({ days })).toMatchObject([{ kind: "diffusion-nulle", action: null }]);
    // Activée il y a moins de 24 h : Meta n'a pas encore commencé.
    expect(detect({ days, campaigns: [{ ...C, activatedAt: "2026-10-29T08:00:00.000Z" }] })).toEqual([]);
  });

  it("une page d'arrivée qui ne répond pas propose la pause", () => {
    expect(detect({ landing: new Map([[7, { ok: false, detail: "réponse HTTP 502" }]]) })).toMatchObject([{ kind: "lien-casse", action: { alerte: true } }]);
  });

  it("des visites sans aucun lead se signalent, sans action", () => {
    const [a] = detect({ days: week({ landingViews: 48, siteLeads: 0 }) });
    expect(a).toMatchObject({ kind: "clics-sans-lead", action: null });
    expect(a.detail).toMatch(/^336 personnes/);
    expect(detect({ days: week({ landingViews: 48, siteLeads: 0, leads: 0 }).map((d, i) => (i === 3 ? { ...d, siteLeads: 1 } : d)) })).toEqual([]);
  });
});

describe("la page d'arrivée", () => {
  it("répond, ou pas", async () => {
    expect(await checkLanding("https://x.test", (async () => new Response("", { status: 200 })) as never)).toEqual({ ok: true, detail: "HTTP 200" });
    expect(await checkLanding("https://x.test", (async () => new Response("", { status: 404 })) as never)).toEqual({ ok: false, detail: "réponse HTTP 404" });
    expect((await checkLanding("https://x.test", (async () => { throw new Error("ENOTFOUND"); }) as never)).ok).toBe(false);
  });
});

type Doc = Record<string, unknown> & { id: number };
function memory(seed: Record<string, Doc[]>) {
  const tables: Record<string, Doc[]> = { "ad-campaigns": [], "ad-objects": [], "ad-metrics-daily": [], "ad-alerts": [], users: [{ id: 1, email: "direction@tim.test", roles: ["admin"] }], ...seed };
  let next = 500;
  const mails: { subject: string; text: string }[] = [];
  const ok = (d: Doc, w: Record<string, unknown>): boolean =>
    Object.entries(w).every(([k, c]) => {
      if (k === "and") return (c as Record<string, unknown>[]).every((x) => ok(d, x));
      const cond = c as Record<string, unknown>;
      if ("equals" in cond) return String(d[k]) === String(cond.equals);
      if ("in" in cond) return (cond.in as unknown[]).map(String).includes(String(d[k]));
      if ("exists" in cond) return cond.exists ? d[k] != null : d[k] == null;
      if ("greater_than_equal" in cond) return String(d[k]) >= String(cond.greater_than_equal);
      return true;
    });
  const payload = {
    find: async ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => ({ docs: tables[collection].filter((d) => ok(d, where ?? {})) }),
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      const d = { ...data, id: next++ };
      tables[collection].push(d);
      return d;
    },
    update: async ({ collection, id, data }: { collection: string; id: number; data: Doc }) => Object.assign(tables[collection].find((d) => d.id === id)!, data),
    sendEmail: async (m: { subject: string; text: string }) => void mails.push(m),
    logger: { error() {}, warn() {}, info() {} },
  };
  return { payload: payload as never, tables, mails };
}

describe("le cycle d'une alerte", () => {
  beforeEach(() => submitAction.mockClear());
  const seed = (effectiveStatus = "DISAPPROVED") => ({
    "ad-campaigns": [{ id: 7, name: C.name, externalId: C.externalId, status: "active", publicationStatus: "active", publication: { activatedAt: C.activatedAt }, account: { timezone: "Europe/Paris" } } as Doc],
    "ad-objects": [{ id: 1, ...adset() } as Doc, { id: 2, ...ad({ effectiveStatus }) } as Doc],
    "ad-metrics-daily": week().map((d, i) => ({ id: 100 + i, level: "campaign", externalId: d.campaignExternalId, ...d }) as Doc),
  });

  it("s'ouvre, agit, prévient une fois, puis se clôt seule", async () => {
    const { payload, tables, mails } = memory(seed());
    expect(await runAlerts(payload, NOW)).toMatchObject({ opened: 1, notified: 1 });
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(tables["ad-alerts"][0]).toMatchObject({ kind: "pub-refusee", decision: 77, notifiedAt: NOW.toISOString() });
    expect(mails[0].subject).toBe("Publicité — Publicité refusée : « C19 »");

    // Toujours refusée une heure plus tard : rien de neuf, ni action ni e-mail.
    expect(await runAlerts(payload, new Date(NOW.getTime() + 3_600_000))).toMatchObject({ opened: 0, notified: 0 });
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(mails).toHaveLength(1);

    // Corrigée : l'alerte se clôt.
    (tables["ad-objects"][1] as Doc).effectiveStatus = "ACTIVE";
    expect(await runAlerts(payload, new Date(NOW.getTime() + 7_200_000))).toMatchObject({ resolved: 1 });
    expect(tables["ad-alerts"][0].resolvedAt).toBeTruthy();
  });

  it("une page en panne attend une deuxième constatation avant d'agir", async () => {
    const { payload, tables, mails } = memory(seed("ACTIVE"));
    (tables["ad-campaigns"][0] as Doc).brief = { landingUrl: "https://tim.test/lp" };
    const down = (async () => new Response("", { status: 503 })) as never;
    expect(await runAlerts(payload, NOW, { fetch: down })).toMatchObject({ opened: 1, notified: 0 });
    expect(submitAction).not.toHaveBeenCalled();
    expect(tables["ad-alerts"][0]).toMatchObject({ kind: "lien-casse", stage: "a-confirmer" });
    expect(await runAlerts(payload, new Date(NOW.getTime() + 3_600_000), { fetch: down })).toMatchObject({ confirmed: 1, notified: 1 });
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(mails).toHaveLength(1);
  });
});
