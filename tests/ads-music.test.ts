import { describe, expect, it, vi } from "vitest";

import { AdMedia } from "@/modules/ads/collections/AdMedia";
import { decodeArgs, processNextMusic } from "@/modules/ads/lib/music";
import { ANALYSIS_RATE } from "@/modules/ads/video/beat";

/**
 * Les musiques (plan Publicité, §9 sexies, M) : une musique déposée part à
 * l'analyse du rythme ; le cron la décode et écrit tempo, premier temps et
 * meilleur passage sur le média.
 */

const queue = AdMedia.hooks!.beforeChange![0] as (a: unknown) => Record<string, unknown>;

describe("au dépôt, une musique part à l'analyse", () => {
  it("création d'une musique : en attente", () => {
    expect(queue({ data: { kind: "musique" }, operation: "create", req: {} })).toMatchObject({ beat: { status: "en-attente", bpm: null } });
  });
  it("une modification sans nouveau fichier ne relance pas une musique analysée", () => {
    const original = { kind: "musique", filename: "a.mp3", beat: { status: "pret", bpm: 120 } };
    expect(queue({ data: { kind: "musique", filename: "a.mp3", whenToUse: "x" }, originalDoc: original, operation: "update", req: {} })).not.toHaveProperty("beat");
    expect(queue({ data: { kind: "musique", filename: "b.mp3" }, originalDoc: original, operation: "update", req: {} })).toMatchObject({ beat: { status: "en-attente" } });
  });
  it("une musique déposée avant l'analyse (sans état) y part à sa prochaine modification ; une photo jamais", () => {
    expect(queue({ data: { kind: "musique", filename: "a.mp3" }, originalDoc: { kind: "musique", filename: "a.mp3" }, operation: "update", req: {} })).toMatchObject({ beat: { status: "en-attente" } });
    expect(queue({ data: { kind: "photo" }, operation: "create", req: {} })).not.toHaveProperty("beat");
  });
});

describe("l'analyse", () => {
  it("ffmpeg décode en mono, 11 025 Hz, 5 minutes au plus", () => {
    expect(decodeArgs("in", "out").join(" ")).toMatch(/-t 300 -vn -ac 1 -ar 11025 -f s16le out$/);
  });

  function fake(claimed = true) {
    const updates: Record<string, unknown>[] = [];
    const payload = {
      db: { drizzle: { execute: vi.fn(async () => ({ rows: claimed ? [{ id: 20, beat_attempts: 1 }] : [] })) } },
      findByID: vi.fn(async () => ({ id: 20, url: "https://cdn/e.mp3" })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => updates.push(data)),
      logger: { error: vi.fn() },
    };
    return { payload: payload as never, updates };
  }
  const clicks = (bpm: number, seconds: number) => {
    const pcm = new Int16Array(seconds * ANALYSIS_RATE);
    for (let t = 0; t < seconds; t += 60 / bpm) for (let j = 0; j < 200; j++) pcm[Math.round(t * ANALYSIS_RATE) + j] = j % 2 ? 20_000 : -20_000;
    return pcm;
  };

  it("rien en file : rien ne se passe", async () => {
    expect(await processNextMusic(fake(false).payload)).toBeNull();
  });

  it("analysée : tempo, passage et durée écrits sur le média", async () => {
    const { payload, updates } = fake();
    const decode = vi.fn(async () => clicks(120, 30));
    expect(await processNextMusic(payload, { decode })).toMatchObject({ id: 20, outcome: "pret" });
    expect(decode).toHaveBeenCalledWith("https://cdn/e.mp3");
    expect(updates[0]).toMatchObject({ beat: { status: "pret", error: null, durationSec: 30, bpm: expect.closeTo(120, 0) } });
  });

  it("un morceau trop court échoue tout de suite ; une panne de Sandbox est retentée", async () => {
    const a = fake();
    expect(await processNextMusic(a.payload, { decode: async () => clicks(120, 2) })).toMatchObject({ outcome: "echec", error: expect.stringMatching(/trop court/) });
    const b = fake();
    expect(
      await processNextMusic(b.payload, {
        decode: async () => {
          throw new Error("Sandbox indisponible");
        },
      }),
    ).toMatchObject({ outcome: "reessai" });
    expect(b.updates[0]).toMatchObject({ beat: { status: "en-attente" } });
  });
});
