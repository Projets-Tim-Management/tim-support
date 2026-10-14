import { describe, expect, it } from "vitest";

import { analyseBeat, ANALYSIS_RATE, beatAlign } from "@/modules/ads/video/beat";
import { MAX_SHOT, MIN_SHOT, type Score } from "@/modules/ads/video/score";

/**
 * Le rythme d'une musique et le calage des coupes (plan Publicité, §9 sexies,
 * M) : sur des morceaux synthétiques dont on connaît le tempo.
 */

/** Un morceau de `seconds` s : un coup sec à chaque temps, plus fort à partir de `loudFrom`. */
function clicks(bpm: number, seconds: number, { offset = 0, loudFrom = 0 } = {}): Int16Array {
  const pcm = new Int16Array(Math.round(seconds * ANALYSIS_RATE));
  // Un fond léger, pour que le silence ne soit pas parfait.
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i * 0.05) * 200);
  for (let t = offset; t < seconds; t += 60 / bpm) {
    const gain = t >= loudFrom ? 24_000 : 6_000;
    const s = Math.round(t * ANALYSIS_RATE);
    for (let j = 0; j < 300 && s + j < pcm.length; j++) pcm[s + j] = Math.round(gain * Math.exp(-j / 60) * (j % 2 ? 1 : -1));
  }
  return pcm;
}

describe("l'analyse d'un morceau", () => {
  it.each([90, 120, 128, 150])("retrouve un tempo de %s", (bpm) => {
    const b = analyseBeat(clicks(bpm, 40));
    expect(Math.abs(b.bpm - bpm)).toBeLessThanOrEqual(1.5);
    expect(b.confidence).toBeGreaterThan(0.15);
  });

  it("place le premier temps", () => {
    const b = analyseBeat(clicks(120, 30, { offset: 0.3 }));
    // Le premier temps est à 0,3 s, ou un temps plus loin (0,8 s) : dans les deux cas sur la grille.
    const off = ((b.firstBeatSec - 0.3) % 0.5 + 0.5) % 0.5;
    expect(Math.min(off, 0.5 - off)).toBeLessThan(0.05);
  });

  it("le meilleur passage commence là où le morceau monte, sur un temps", () => {
    const b = analyseBeat(clicks(120, 60, { loudFrom: 20 }));
    expect(b.bestStartSec).toBeGreaterThanOrEqual(19);
    expect(b.bestStartSec).toBeLessThanOrEqual(40);
    // Sur un temps, à une image près (1/30 s) : le tempo est estimé au dixième de BPM.
    const off = (b.bestStartSec - b.firstBeatSec) % (60 / b.bpm);
    expect(Math.min(off, 60 / b.bpm - off)).toBeLessThan(1 / 30);
  });

  it("durée, et refus d'un morceau trop court", () => {
    expect(analyseBeat(clicks(120, 30)).durationSec).toBe(30);
    expect(() => analyseBeat(clicks(120, 2))).toThrow(/trop court/);
  });
});

describe("le calage des coupes sur les temps", () => {
  const S: Score = {
    shots: [
      { kind: "ouverture", seconds: 2.2, text: "Fini la ressaisie" },
      { kind: "rush", seconds: 4.1, rush: 1, from: 0, to: 4 },
      { kind: "preuve", seconds: 1.8, fact: 5 },
      { kind: "fin", seconds: 2.5 },
    ],
  };
  const ends = (s: Score) => s.shots.reduce<number[]>((a, x) => [...a, (a.at(-1) ?? 0) + x.seconds], []);

  it("à 120 BPM, chaque coupe tombe sur un temps (toutes les 0,5 s)", () => {
    const a = beatAlign(S, 120);
    for (const e of ends(a)) expect(Math.abs(e * 2 - Math.round(e * 2))).toBeLessThan(0.005);
    expect(a.shots.map((x) => x.kind)).toEqual(["ouverture", "rush", "preuve", "fin"]);
    expect(a.shots[1]).toMatchObject({ rush: 1, from: 0, to: 4 });
  });

  it("aucun plan sous la durée minimale ni au-dessus de la maximale", () => {
    const short: Score = { shots: [{ kind: "ouverture", seconds: 0.85, text: "x" }, { kind: "rush", seconds: 5.9, rush: 1, from: 0, to: 5 }, { kind: "fin", seconds: 2 }] };
    for (const bpm of [70, 95, 120, 175]) {
      for (const s of beatAlign(short, bpm).shots) {
        expect(s.seconds).toBeGreaterThanOrEqual(MIN_SHOT - 1e-9);
        expect(s.seconds).toBeLessThanOrEqual(MAX_SHOT + 1e-9);
      }
    }
  });

  it("un tempo très rapide se cale sur un temps sur deux", () => {
    const e = ends(beatAlign(S, 170));
    const grid = (60 / 170) * 2;
    for (const x of e) expect(Math.abs(x - Math.round(x / grid) * grid)).toBeLessThan(0.005);
  });

  it("la durée totale reste dans les bornes", () => {
    const total = beatAlign(S, 72).shots.reduce((t, x) => t + x.seconds, 0);
    expect(total).toBeGreaterThanOrEqual(6);
    expect(total).toBeLessThanOrEqual(20);
  });
});
