import { describe, expect, it, vi } from "vitest";

import { buildZip } from "@/modules/ads/lib/download";
import { defaultScore, pickRush } from "@/modules/ads/video/default-score";
import { processNextRender, queueVideosFor } from "@/modules/ads/video/render";

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
  function fake(score: unknown = GOOD, claimed = true, music: number | null = null) {
    const updates: Record<string, unknown>[] = [];
    const docs: Record<string, Record<string, unknown>> = {
      "ad-creatives": { id: 9, campaign: 4, style: 2, cta: "en-savoir-plus", video: { status: "en-cours", score, music } },
      "ad-media": { id: 20, kind: "musique", url: "https://cdn/e.mp3", beat: { bpm: 120, bestStartSec: 12 } },
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

  it("sur une musique : coupes calées sur les temps, musique prise à son passage", async () => {
    const { payload } = fake({ shots: [{ kind: "ouverture", seconds: 2.2, text: "Fini la ressaisie." }, { kind: "rush", seconds: 4.1, rush: 1, from: 0, to: 4 }, { kind: "fin", seconds: 2.4 }] }, true, 20);
    const render = vi.fn(async (list: { format: string }[]) => list.map((p) => ({ format: p.format as "9x16", data: Buffer.from("mp4") })));
    await processNextRender(payload, { render, store });
    const props = render.mock.calls[0][0][0] as unknown as { music: unknown; shots: { frames: number }[] };
    expect(props.music).toEqual({ src: "https://cdn/e.mp3", startSec: 12, beatFrames: 15 });
    // 120 BPM = un temps toutes les 15 images : chaque coupe tombe dessus.
    let at = 0;
    for (const sh of props.shots) {
      at += sh.frames;
      expect(at % 15).toBe(0);
    }
  });

  it("sans musique : rien à caler, aucun son", async () => {
    const { payload } = fake();
    const render = vi.fn(async (list: { format: string }[]) => list.map((p) => ({ format: p.format as "9x16", data: Buffer.from("mp4") })));
    await processNextRender(payload, { render, store });
    expect((render.mock.calls[0][0][0] as unknown as { music: unknown }).music).toBeNull();
  });

  it("les affiches dans le style remplacent les visuels de la créa, une par format", async () => {
    const { payload } = fake();
    const created: Record<string, unknown>[] = [];
    (payload as unknown as { create: unknown }).create = vi.fn(async (a: Record<string, unknown>) => (created.push(a), { id: 70 + created.length }));
    const assetsUpdates: Record<string, unknown>[] = [];
    const update = (payload as unknown as { update: ReturnType<typeof vi.fn> }).update;
    update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => assetsUpdates.push(data));
    const render = vi.fn(async (list: { format: string }[], posters?: { format: string; poster?: { hook: string } | null }[]) => {
      expect(posters?.map((p) => p.format)).toEqual(["9x16", "4x5", "1x1"]);
      // Sans accroche sur la créa, l'affiche reprend le texte de l'ouverture.
      expect(posters?.[0].poster?.hook).toBe("Fini la ressaisie.");
      return list.map((p) => ({ format: p.format as "9x16", data: Buffer.from("mp4"), poster: Buffer.from("jpg") }));
    });
    await processNextRender(payload, { render, store });
    expect(created.map((c) => (c.data as { kind: string }).kind)).toEqual(["crea", "crea", "crea"]);
    expect(assetsUpdates.at(-1)).toEqual({ assets: [{ format: "9x16", type: "image", template: "affiche-a-le-geste-en-gros-plan", media: 71 }, expect.any(Object), expect.any(Object)] });
  });

  it("sans affiche pour un format, les visuels restent ceux d'avant", async () => {
    const { payload, updates } = fake();
    const render = vi.fn(async (list: { format: string }[]) => list.map((p, i) => ({ format: p.format as "9x16", data: Buffer.from("mp4"), poster: i ? Buffer.from("jpg") : null })));
    await processNextRender(payload, { render, store });
    expect(updates.some((u) => "assets" in u)).toBe(false);
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

describe("après « Générer des créas »", () => {
  it("chaque créa reçoit un premier montage IA, en alternant les styles actifs", async () => {
    const created: { collection: string; data: Record<string, unknown> }[] = [];
    const payload = {
      find: vi.fn(async () => ({ docs: [{ id: 1, name: "A" }, { id: 2, name: "B" }] })),
      findByID: vi.fn(async ({ id }: { id: unknown }) => ({ id, campaign: 4, status: "a-valider" })),
      count: vi.fn(async () => ({ totalDocs: 0 })),
      create: vi.fn(async (a: { collection: string; data: Record<string, unknown> }) => (created.push(a), { id: created.length })),
    };
    expect(await queueVideosFor(payload as never, [11, 12, 13])).toEqual({ queued: 3, skipped: null });
    expect(created.map((c) => [c.collection, c.data.creative, String(c.data.instruction).match(/style « (\w) »/)?.[1]])).toEqual([
      ["ad-retouches", 11, "A"],
      ["ad-retouches", 12, "B"],
      ["ad-retouches", 13, "A"],
    ]);
    expect(String(created[0].data.instruction)).toMatch(/SCÈNES de motion design/);
  });
});
