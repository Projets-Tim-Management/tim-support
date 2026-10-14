import { describe, expect, it, vi } from "vitest";

import { buildZip } from "@/modules/ads/lib/download";
import { defaultScore, pickRush } from "@/modules/ads/video/default-score";
import { processNextRender } from "@/modules/ads/video/render";

/**
 * Le rendu des vidéos (plan Publicité, §9 sexies, D3) : la partition par
 * défaut d'une créa, le cycle de rendu (en file, rendue, échec), et le ZIP.
 */

const rush = (id: number, features: string[], validated = false, durationSec = 8) => ({ id, durationSec, features, validated, source: "app-mobile" });

describe("la partition par défaut", () => {
  it("prend le rush de la fonctionnalité que l'angle évoque, puis le validé", () => {
    const rushes = [rush(1, ["planning"], true), rush(2, ["pointage"]), rush(3, ["documents"], true)];
    expect(pickRush("La fin de la ressaisie du vendredi : pointage sur téléphone", rushes)?.id).toBe(2);
    expect(pickRush("Un angle sans fonctionnalité", rushes)?.id).toBe(1);
    expect(pickRush("x", [])).toBeNull();
  });

  it("ouverture, rush, preuve s'il y a un fait, fin", () => {
    const d = defaultScore({ hook: "Fini la ressaisie", angle: "pointage", titles: ["Le pointage sans ressaisie"], descriptions: ["Essai gratuit de 30 jours"], rushes: [rush(2, ["pointage"], false, 12)], factIds: [5] });
    expect(d.ok && d.score.shots.map((s) => s.kind)).toEqual(["ouverture", "rush", "preuve", "fin"]);
    if (d.ok) expect(d.score.shots[1]).toMatchObject({ rush: 2, from: 0, to: 5, seconds: 5, caption: "Le pointage sans ressaisie" });
  });

  it("sans rush prêt : on le dit", () => {
    expect(defaultScore({ hook: "x", angle: "x", titles: [], descriptions: [], rushes: [], factIds: [] })).toEqual({ ok: false, error: expect.stringMatching(/Aucun rush prêt/) });
  });
});

describe("le cycle de rendu", () => {
  const GOOD = { shots: [{ kind: "ouverture", seconds: 2, text: "Fini la ressaisie." }, { kind: "rush", seconds: 4, rush: 1, from: 0, to: 4 }, { kind: "fin", seconds: 2.5 }] };

  /** Une base minimale : une créa réclamée, son style, le kit, un rush prêt, la campagne et son brief. */
  function fake(score: unknown = GOOD, claimed = true) {
    const updates: Record<string, unknown>[] = [];
    const docs: Record<string, Record<string, unknown>> = {
      "ad-creatives": { id: 9, campaign: 4, style: 2, cta: "en-savoir-plus", video: { status: "en-cours", score } },
      "ad-styles": { id: 2, name: "A · Le geste en gros plan", opening: "titre-mot-a-mot", phoneFrame: "maquette", pace: "dynamique", subtitles: "mot-a-mot", titleFont: "archivo-black", bodyFont: "archivo" },
      "ad-campaigns": { id: 4, name: "Démos", status: "brouillon", brief: { audience: "BTP", pain: "Papier", offer: "essai gratuit de 30 jours", proofs: [], angles: [] } },
    };
    const payload = {
      db: { drizzle: { execute: vi.fn(async () => ({ rows: claimed ? [{ id: 9, video_attempts: 1 }] : [] })) } },
      findByID: vi.fn(async ({ collection }: { collection: string }) => docs[collection]),
      findGlobal: vi.fn(async ({ slug }: { slug: string }) => (slug === "ads-brand-kit" ? { palette: {}, forbidden: [] } : slug === "ads-settings" ? { creativesPerCampaignPerWeek: 6 } : {})),
      find: vi.fn(async ({ collection }: { collection: string }) =>
        collection === "ad-rushes" ? { docs: [{ id: 1, processing: { status: "pret" }, working: { url: "https://cdn/r1.mp4", meta: { width: 732, height: 1510, durationSec: 12 } }, framing: null }] } : { docs: [] },
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => updates.push(data)),
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    };
    return { payload: payload as never, updates };
  }
  const store = vi.fn(async (p: string) => `https://cdn/${p}`);

  it("rien en file : rien ne se passe", async () => {
    expect(await processNextRender(fake(GOOD, false).payload)).toBeNull();
  });

  it("rendue aux trois formats, rangée à part, créa « prête »", async () => {
    const { payload, updates } = fake();
    const render = vi.fn(async (list: { format: string }[]) => list.map((p) => ({ format: p.format as "9x16", data: Buffer.from("mp4") })));
    expect(await processNextRender(payload, { render, store })).toEqual({ id: 9, outcome: "prete" });
    expect(render.mock.calls[0][0].map((p) => p.format)).toEqual(["9x16", "4x5", "1x1"]);
    expect(store.mock.calls.map((c) => c[0])).toEqual(["ads/creas/videos/9/a-le-geste-en-gros-plan-9x16.mp4", "ads/creas/videos/9/a-le-geste-en-gros-plan-4x5.mp4", "ads/creas/videos/9/a-le-geste-en-gros-plan-1x1.mp4"]);
    expect(updates[0]).toMatchObject({ video: { status: "prete", error: null, renders: [{ format: "9x16", url: expect.stringContaining("9x16.mp4"), seconds: 8.5 }, {}, {}] } });
  });

  it("une partition refusée échoue tout de suite, avec la raison — rien n'est rendu", async () => {
    const { payload, updates } = fake({ shots: [{ kind: "ouverture", seconds: 2, text: "Gagnez 3 heures" }, { kind: "rush", seconds: 4, rush: 1, from: 0, to: 4 }, { kind: "fin", seconds: 2.5 }] });
    const render = vi.fn();
    expect(await processNextRender(payload, { render, store })).toMatchObject({ outcome: "echec", error: expect.stringMatching(/Chiffre non sourcé : 3/) });
    expect(render).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ video: { status: "echec" } });
  });

  it("une panne de la Sandbox est retentée", async () => {
    const { payload } = fake();
    const render = vi.fn(async () => {
      throw new Error("Sandbox indisponible");
    });
    expect(await processNextRender(payload, { render, store })).toMatchObject({ outcome: "reessai" });
  });
});

describe("le téléchargement", () => {
  it("les vidéos prêtes entrent dans le ZIP, à côté des images, en .mp4", async () => {
    const load = vi.fn(async () => ({ data: Buffer.from("x"), mime: "video/mp4" }));
    const zip = await buildZip(
      { id: 4, name: "Démos" },
      [{ id: 9, angle: "Pointage", tone: "vous", assets: [], video: { status: "prete", renders: [{ format: "9x16", url: "https://cdn/v.mp4" }] } }],
      {},
      load,
    );
    expect(load).toHaveBeenCalledWith("https://cdn/v.mp4");
    expect(Buffer.from(zip).toString("latin1")).toContain("tim_demos_pointage_9x16.mp4");
  });
});
