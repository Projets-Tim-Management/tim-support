import { describe, expect, it, vi } from "vitest";

import { describeRush, insightPrompt, proposalText, type RushInsight } from "@/modules/ads/lib/rush-describe";

/**
 * La description d'un rush proposée par l'IA (plan Publicité, §9 sexies, D1c) :
 * ce que Claude lit, ce qui est rangé dans la fiche, et ce qui est compté.
 */

const RUSH = {
  id: 7,
  title: "Pointage du matin",
  source: "app-mobile",
  features: ["pointage"],
  description: "Un chef d'équipe pointe 3 compagnons.",
  working: { keyframes: [{ atSec: 1, url: "https://cdn/k1.jpg" }, { atSec: 3, url: "https://cdn/k2.jpg" }], meta: { kind: "video", durationSec: 4, orientation: "vertical" } },
};
const INSIGHT: RushInsight = {
  description: "Écran du téléphone : liste de compagnons, pointage d'arrivée.",
  plans: [{ a_sec: 1, ce_qu_on_voit: "Liste des compagnons", zones_importantes: "bouton Pointer, en bas" }],
  atouts_publicitaires: ["à 1 s, le bouton Pointer en gros plan"],
};

describe("ce que Claude lit", () => {
  it("le rush tel que Charlie l'a décrit, sa source et ses fonctionnalités en clair", () => {
    const p = insightPrompt(RUSH);
    expect(p.text).toContain("Écran de l'app mobile");
    expect(p.text).toContain("Fonctionnalités montrées : Pointage");
    expect(p.text).toContain("Vidéo de 4 s, vertical");
    expect(p.system).toMatch(/aucune invention/);
    expect(p.system).toMatch(/DONNÉES/);
  });

  it("le texte rangé : la description, puis les atouts pour une pub", () => {
    expect(proposalText(INSIGHT)).toBe("Écran du téléphone : liste de compagnons, pointage d'arrivée.\n\nAtouts pour une pub : à 1 s, le bouton Pointer en gros plan.");
  });
});

describe("proposer la description", () => {
  function fake(settings: Record<string, unknown> = { enabled: true }) {
    const created: { collection: string; data: Record<string, unknown> }[] = [];
    const updates: Record<string, unknown>[] = [];
    const payload = {
      findByID: vi.fn(async () => RUSH),
      findGlobal: vi.fn(async () => settings),
      find: vi.fn(async () => ({ docs: [] })),
      create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => created.push({ collection, data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => updates.push(data)),
    };
    return { payload: payload as never, created, updates };
  }
  const usage = { input: 3000, output: 400, cacheRead: 0, cacheWrite: 0 };

  it("Claude reçoit les images clés ; la fiche reçoit la proposition et les plans ; la dépense est inscrite", async () => {
    const { payload, created, updates } = fake();
    const call = vi.fn(async () => ({ result: INSIGHT, usage }));
    const fetcher = vi.fn(async () => new Response(Buffer.from("jpg"), { headers: { "content-type": "image/jpeg" } }));
    await describeRush(payload, 7, { call, fetch: fetcher as never });
    // Le serveur lit les images clés lui-même : Claude les reçoit, sans avoir à les télécharger.
    expect(fetcher.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(["https://cdn/k1.jpg", "https://cdn/k2.jpg"]);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ images: [expect.objectContaining({ atSec: 1, mediaType: "image/jpeg" }), expect.objectContaining({ atSec: 3 })] }));
    expect(updates[0]).toEqual({ ai: { proposal: proposalText(INSIGHT), timeline: INSIGHT.plans, status: "proposee" } });
    expect(created[0]).toMatchObject({ collection: "ad-ai-usage", data: { kind: "texte", model: "claude-sonnet-5-5" } });
  });

  it("interrupteur coupé : rien ne part, la fiche ne change pas", async () => {
    const { payload, updates } = fake({ enabled: false });
    const call = vi.fn();
    await expect(describeRush(payload, 7, { call })).rejects.toThrow(/Interrupteur/);
    expect(call).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("un appel facturé puis illisible reste compté", async () => {
    const { payload, created } = fake();
    const call = vi.fn(async () => {
      throw Object.assign(new Error("Réponse illisible"), { usage });
    });
    const fetcher = vi.fn(async () => new Response(Buffer.from("jpg")));
    await expect(describeRush(payload, 7, { call, fetch: fetcher as never })).rejects.toThrow(/illisible/);
    expect(created[0].data.detail).toMatch(/échec/);
  });
});
