import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", () => ({ assertAdsBudget: vi.fn(async () => undefined), recordAdsUsage: vi.fn(async () => ({ id: 1 })) }));
vi.mock("@/modules/analytics/lib/seo-gsc", () => ({ loadGsc: vi.fn(async () => ({ status: "missing", missing: [] })) }));
vi.mock("@/modules/ai-team/lib/funnel", async (orig) => ({ ...(await orig<typeof import("@/modules/ai-team/lib/funnel")>()), loadFunnel: vi.fn(async () => null) }));
vi.mock("@/modules/ai-team/lib/competitor-maps", async (orig) => ({ ...(await orig<typeof import("@/modules/ai-team/lib/competitor-maps")>()), crawlSite: vi.fn(async () => [{ loc: "https://tim-management.co/pointage", lastmod: null }]) }));

import { parseContentPlan, runContentPlan } from "@/modules/ai-team/lib/content-plan";
import type { WebCall } from "@/modules/ai-team/lib/web-model";

const item = (over: Record<string, unknown>) => ({ type: "creer", titre: "Comparatif TIM vs Alobees", requete: "alobees avis", intention: "achat", pourquoi: "Guy : Alobees a 3 comparatifs.", structure: ["Ce que fait chacun", "Tarifs"], minutes: 90, impact: "fort", source: "guy", prompt: "Écris un comparatif…", ...over });
const answer = (items: unknown[]) => `<synthese>Les comparatifs d'abord.</synthese><plan>${JSON.stringify(items)}</plan>`;

describe("Plan de contenu : la réponse de Paige, vérifiée", () => {
  it("garde les actions complètes (un prompt est obligatoire), fortes et d'achat d'abord, 8 au plus", () => {
    const out = parseContentPlan(answer([item({ titre: "Guide RTT", intention: "information", impact: "moyen" }), item({}), item({ titre: "Sans prompt", prompt: "" }), item({ type: "inconnu", titre: "Type inconnu", impact: "faible", minutes: 5000 })]))!;
    expect(out.findings.map((f) => [f.title, f.type])).toEqual([
      ["Comparatif TIM vs Alobees", "creer"],
      ["Guide RTT", "creer"],
      ["Type inconnu", "creer"],
    ]);
    expect(out.findings[2].minutes).toBe(480);
    expect(out.findings[0].outline).toEqual(["Ce que fait chacun", "Tarifs"]);
    expect(parseContentPlan("rien")).toBeNull();
  });
});

describe("Le déroulé d'un rapport d'agent (Paige)", () => {
  let audits: Record<string, unknown>[];
  const payloadWith = (opts: { active?: boolean; guyWeek?: string | null } = {}) => ({
    find: vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
      if (collection === "ai-team-members") return { docs: [{ id: 70, name: "Paige", active: opts.active ?? true }] };
      if (collection === "ai-team-audits") {
        const w = JSON.stringify(where);
        if (w.includes('"concurrence"')) return { docs: opts.guyWeek ? [{ createdAt: "2026-11-16T05:10:00Z", period: opts.guyWeek, findings: [], summary: "" }] : [] };
        // Ce qui est déjà fait pour la période (le moteur lit l'état de chaque rapport, pour relancer un rapport coupé).
        if (w.includes('"period"')) return { docs: audits.filter((a) => w.includes(`"${a.period}"`) && a.kind === "contenu") };
        return { docs: [] };
      }
      return { docs: [] };
    }),
    count: vi.fn(async ({ where }: { where: unknown }) => ({ totalDocs: audits.filter((a) => JSON.stringify(where).includes(`"${a.period}"`) && a.kind === "contenu").length })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), { id: audits.length, ...data })),
    // Une mise à jour par critère (les rapports coupés en route) ne touche aucun rapport fini ici.
    update: vi.fn(async ({ data, where }: { data: Record<string, unknown>; where?: unknown }) => (where ? { docs: [] } : (Object.assign(audits.at(-1)!, data), data))),
    logger: { warn: vi.fn() },
  });
  const call: WebCall = async () => ({ content: [{ type: "text", text: answer([item({})]), citations: null }] as never, usage: { input: 10_000, output: 2_000, cacheRead: 0, cacheWrite: 0 }, searches: 1, stopReason: "end_turn" });
  beforeEach(() => {
    audits = [];
  });

  it("le lundi, attend le rapport de Guy — puis le fait une seule fois", async () => {
    const monday6h = new Date("2026-11-16T05:30:00Z"); // 6 h 30 à Paris
    expect((await runContentPlan(payloadWith({ guyWeek: null }) as never, { now: monday6h, call })).status).toBe("pas-encore");
    const p = payloadWith({ guyWeek: "2026-11-16" });
    expect(await runContentPlan(p as never, { now: monday6h, call })).toMatchObject({ status: "fait", findings: 1 });
    expect(audits[0]).toMatchObject({ kind: "contenu", period: "2026-11-16", status: "fait", summary: "Les comparatifs d'abord." });
    expect((await runContentPlan(p as never, { now: monday6h, call })).status).toBe("deja-fait");
  });

  it("à 7 h, n'attend plus Guy ; un mardi, ne part pas seul ; en pause, ne travaille pas", async () => {
    expect((await runContentPlan(payloadWith({ guyWeek: null }) as never, { now: new Date("2026-11-16T06:10:00Z"), call })).status).toBe("fait");
    expect((await runContentPlan(payloadWith() as never, { now: new Date("2026-11-17T06:10:00Z"), call })).status).toBe("pas-encore");
    expect((await runContentPlan(payloadWith({ active: false }) as never, { now: new Date("2026-11-17T06:10:00Z"), force: true, call })).status).toBe("pause");
  });
});
