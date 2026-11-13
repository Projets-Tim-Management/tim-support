import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", async (orig) => ({ ...(await orig<typeof import("@/modules/ads/lib/spend")>()), assertAdsBudget: vi.fn(async () => undefined), recordAdsUsage: vi.fn(async () => ({ id: 1 })) }));

import { parseAuthority, runAuthority } from "@/modules/ai-team/lib/authority";
import type { WebCall } from "@/modules/ai-team/lib/web-model";

const target = (over: Record<string, unknown>) => ({ site: "Capterra", url: "https://www.capterra.fr/", type: "comparateur", etat: "absent", pourquoi: "Cité 6 fois par les IA ; Kalitics y est.", etapes: ["Créer le compte", "Remplir la fiche"], minutes: 60, impact: "fort", prompt: "Écris la fiche…", ...over });
const answer = (targets: unknown[], mentions: unknown[] = []) => `<synthese>TIM manque sur les comparateurs.</synthese><mentions>${JSON.stringify(mentions)}</mentions><cibles>${JSON.stringify(targets)}</cibles>`;

describe("Le rapport de Linda, vérifié", () => {
  it("garde les cibles avec un prompt : fortes, puis absentes d'abord ; 10 au plus", () => {
    const out = parseAuthority(
      answer([target({ site: "Batiactu", type: "media", etat: "present", impact: "moyen" }), target({ site: "Appvizer", etat: "incomplet" }), target({}), target({ site: "Sans prompt", prompt: "" }), target({ site: "Type inconnu", type: "x", impact: "faible", minutes: 0, url: "http://pas-https.fr" })]),
    )!;
    expect(out.findings.map((t) => [t.site, t.state])).toEqual([
      ["Capterra", "absent"],
      ["Appvizer", "incomplet"],
      ["Batiactu", "present"],
      ["Type inconnu", "absent"],
    ]);
    expect(out.findings[3]).toMatchObject({ type: "annuaire", minutes: 30, url: "" });
    expect(parseAuthority("rien")).toBeNull();
  });

  it("les mentions : https, hors du site de TIM, sans doublon", () => {
    const out = parseAuthority(
      answer([target({})], [
        { url: "https://www.batiactu.com/tim", titre: "TIM lève", ton: "positif" },
        { url: "https://www.batiactu.com/tim", titre: "doublon" },
        { url: "https://tim-management.co/blog", titre: "chez nous" },
        { url: "http://vieux.fr", titre: "pas https" },
        { url: "https://forum.fr/x", titre: "Avis", ton: "bizarre" },
      ]),
    )!;
    expect(out.mentions).toEqual([
      { url: "https://www.batiactu.com/tim", title: "TIM lève", tone: "positif" },
      { url: "https://forum.fr/x", title: "Avis", tone: "neutre" },
    ]);
  });
});

describe("Le déroulé du rapport de Linda", () => {
  let audits: Record<string, unknown>[];
  const payloadWith = (opts: { georges?: string | null } = {}) => ({
    find: vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
      if (collection === "ai-team-members") return { docs: [{ id: 80, name: "Linda", active: true }] };
      if (collection === "ai-team-audits" && JSON.stringify(where).includes('"ia"')) return { docs: opts.georges ? [{ createdAt: "2026-11-02T06:00:00Z", period: opts.georges, findings: [], summary: "" }] : [] };
      return { docs: [] };
    }),
    count: vi.fn(async () => ({ totalDocs: 0 })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), { id: audits.length, ...data })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (Object.assign(audits.at(-1)!, data), data)),
    logger: { warn: vi.fn() },
  });
  const call: WebCall = async () => ({ content: [{ type: "text", text: answer([target({})], [{ url: "https://www.batiactu.com/tim", titre: "TIM", ton: "neutre" }]), citations: null }] as never, usage: { input: 20_000, output: 3_000, cacheRead: 0, cacheWrite: 0 }, searches: 6, stopReason: "end_turn" });
  beforeEach(() => {
    audits = [];
  });

  it("attend le rapport de Georges du mois (au plus tard le 7) ; garde les mentions avec le rapport", async () => {
    const tuesday3 = new Date("2026-11-03T06:00:00Z"); // 7 h à Paris
    expect((await runAuthority(payloadWith({ georges: null }) as never, { now: tuesday3, call })).status).toBe("pas-encore");
    expect((await runAuthority(payloadWith({ georges: "2026-11" }) as never, { now: tuesday3, call })).status).toBe("fait");
    expect(audits[0]).toMatchObject({ kind: "autorite", period: "2026-11", status: "fait", measure: { mentions: [{ url: "https://www.batiactu.com/tim", title: "TIM", tone: "neutre" }] } });
  });

  it("le 7 (jour ouvré), n'attend plus Georges ; le week-end, ne part pas seul", async () => {
    expect((await runAuthority(payloadWith() as never, { now: new Date("2026-12-07T06:00:00Z"), call })).status).toBe("fait");
    expect((await runAuthority(payloadWith() as never, { now: new Date("2026-11-08T09:00:00Z"), call })).status).toBe("pas-encore");
  });
});
