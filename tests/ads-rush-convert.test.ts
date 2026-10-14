import { describe, expect, it, vi } from "vitest";

import { durationRefusal, keyframeTimes, parseProbe, stillArgs, transcodeArgs, videoFilters } from "@/modules/ads/lib/rush-convert";
import { FinalError, MAX_ATTEMPTS, processNextRush, type Outputs } from "@/modules/ads/lib/rush-process";

/**
 * La conversion d'un rush (plan Publicité, §9 sexies, D1b) : ce que ffprobe
 * dit d'une vidéo, ce que ffmpeg en fait, et ce que la fiche devient.
 */

// Une vidéo d'iPhone tenue droite : enregistrée couchée, avec une rotation, en HDR (HLG).
const IPHONE = {
  streams: [
    { codec_type: "video", codec_name: "hevc", width: 3840, height: 2160, avg_frame_rate: "60/1", color_transfer: "arib-std-b67", side_data_list: [{ rotation: -90 }] },
    { codec_type: "audio", codec_name: "aac" },
  ],
  format: { duration: "12.480000" },
};

describe("la fiche technique (ffprobe)", () => {
  it("rend les dimensions telles qu'on VOIT la vidéo, et repère le HDR", () => {
    expect(parseProbe(IPHONE)).toEqual({ durationSec: 12.48, width: 2160, height: 3840, orientation: "vertical", fps: 60, hasAudio: true, videoCodec: "hevc", hdr: true });
  });

  it("une capture d'écran web, carrée à 2 % près, sans son", () => {
    const m = parseProbe({ streams: [{ codec_type: "video", codec_name: "h264", width: 1000, height: 990, avg_frame_rate: "30000/1001" }], format: { duration: "4" } });
    expect(m).toMatchObject({ orientation: "carre", fps: 29.97, hasAudio: false, hdr: false });
  });

  it("un fichier sans piste vidéo est refusé, en le disant", () => {
    expect(() => parseProbe({ streams: [{ codec_type: "audio" }] })).toThrow(/Aucune piste vidéo/);
  });

  it("au-delà de 3 minutes, c'est un film : refusé", () => {
    expect(durationRefusal({ ...parseProbe(IPHONE), durationSec: 200 })).toMatch(/trop longue \(200 s\)/);
    expect(durationRefusal(parseProbe(IPHONE))).toBeNull();
  });
});

describe("la version de travail (ffmpeg)", () => {
  const m = parseProbe(IPHONE);

  it("SDR, 1920 px sur le grand côté, 30 i/s au plus", () => {
    const f = videoFilters(m, { tonemap: true });
    expect(f).toMatch(/^zscale=t=linear.*tonemap=hable/);
    expect(f).toContain("scale=-2:1920");
    expect(f).toContain("fps=30");
    expect(f.endsWith("format=yuv420p")).toBe(true);
    expect(videoFilters(m, { tonemap: false })).not.toContain("tonemap");
  });

  it("H.264, son en AAC s'il y en a, lecture progressive", () => {
    const a = transcodeArgs("in.src", "work.mp4", m, { tonemap: true });
    expect(a).toEqual(expect.arrayContaining(["libx264", "-crf", "20", "aac", "+faststart"]));
    expect(a.at(-1)).toBe("work.mp4");
    const silent = transcodeArgs("in.src", "work.mp4", { ...m, hasAudio: false }, { tonemap: true });
    expect(silent).toContain("-an");
    expect(silent).not.toContain("0:a:0");
  });

  it("six images clés réparties, en 720 px sur le grand côté", () => {
    expect(keyframeTimes(12)).toEqual([1, 3, 5, 7, 9, 11]);
    expect(stillArgs("work.mp4", "kf.jpg", 3, m)).toEqual(expect.arrayContaining(["-ss", "3", "scale=-2:720"]));
  });
});

describe("le cycle d'un rush", () => {
  const outputs: Outputs = {
    meta: { kind: "video", durationSec: 12, width: 1080, height: 1920, orientation: "vertical", fps: 30, hasAudio: true, videoCodec: "hevc", hdr: false },
    working: { data: Buffer.from("mp4"), contentType: "video/mp4", ext: "mp4" },
    poster: Buffer.from("jpg"),
    keyframes: [1, 3].map((t) => ({ atSec: t, data: Buffer.from(`kf${t}`) })),
  };

  /** Une base qui rend le rush réclamé (ou rien), et note les mises à jour. */
  function fake(claimed: Record<string, unknown> | null) {
    const updates: Record<string, unknown>[] = [];
    const payload = {
      db: { drizzle: { execute: vi.fn(async () => ({ rows: claimed ? [claimed] : [] })) } },
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => updates.push(data)),
      logger: { error: vi.fn() },
    };
    return { payload: payload as never, updates };
  }
  const row = (attempts = 1) => ({ id: 7, original_url: "https://x.public.blob.vercel-storage.com/ads/rushes/a.mov", original_content_type: "video/quicktime", media_type: "video", processing_attempts: attempts });
  const store = vi.fn(async (p: string) => `https://cdn/${p}`);

  it("rien à convertir : rien ne se passe", async () => {
    expect(await processNextRush(fake(null).payload)).toBeNull();
  });

  it("converti : sorties rangées à part, fiche « Prêt » avec sa fiche technique", async () => {
    const { payload, updates } = fake(row());
    const r = await processNextRush(payload, { convertVideo: async () => outputs, store });
    expect(r).toEqual({ id: 7, outcome: "pret" });
    expect(store.mock.calls.map((c) => c[0])).toEqual(["ads/rushes/travail/7/travail.mp4", "ads/rushes/travail/7/vignette.jpg", "ads/rushes/travail/7/image-1.jpg", "ads/rushes/travail/7/image-2.jpg"]);
    expect(updates[0]).toMatchObject({
      processing: { status: "pret", error: null, leaseUntil: null },
      working: { url: "https://cdn/ads/rushes/travail/7/travail.mp4", keyframes: [{ atSec: 1 }, { atSec: 3 }], meta: { orientation: "vertical" } },
    });
  });

  it("un échec passager repart en attente ; au troisième, « Échec » avec la raison", async () => {
    const boom = async () => {
      throw new Error("sandbox indisponible");
    };
    const first = fake(row(1));
    expect(await processNextRush(first.payload, { convertVideo: boom, store })).toMatchObject({ outcome: "reessai" });
    expect(first.updates[0]).toMatchObject({ processing: { status: "en-attente", error: "sandbox indisponible" } });
    const last = fake(row(MAX_ATTEMPTS));
    expect(await processNextRush(last.payload, { convertVideo: boom, store })).toMatchObject({ outcome: "echec" });
  });

  it("une vidéo trop longue échoue tout de suite : réessayer n'y changerait rien", async () => {
    const { payload, updates } = fake(row(1));
    const tooLong = async () => {
      throw new FinalError("Vidéo trop longue");
    };
    expect(await processNextRush(payload, { convertVideo: tooLong, store })).toMatchObject({ outcome: "echec" });
    expect(updates[0]).toMatchObject({ processing: { status: "echec" } });
  });
});
