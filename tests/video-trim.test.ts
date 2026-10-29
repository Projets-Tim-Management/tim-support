import { describe, expect, it } from "vitest";

import {
  MAX_SEGMENTS,
  keptDuration,
  keptRanges,
  nextKeptTime,
  segmentCount,
  segmentDuration,
  sourceTimes,
  toggleRange,
} from "@/core/lib/video-trim";

describe("retoucher une capture", () => {
  it("découpe en tranches de 0,25 s, sans dépasser 200 vignettes", () => {
    expect(segmentDuration(10)).toBe(0.25);
    expect(segmentCount(10)).toBe(40);
    expect(segmentCount(120)).toBeLessThanOrEqual(MAX_SEGMENTS);
    expect(segmentCount(10.1)).toBe(41);
  });

  it("garde toute la vidéo quand rien n'est retiré", () => {
    expect(keptRanges(10, new Set())).toEqual([{ start: 0, end: 10 }]);
  });

  it("fusionne les tranches gardées voisines, et coupe la dernière à la durée réelle", () => {
    // Tranches 4 à 7 retirées = 1 s à 2 s.
    const ranges = keptRanges(10.1, new Set([4, 5, 6, 7]));
    expect(ranges).toEqual([{ start: 0, end: 1 }, { start: 2, end: 10.1 }]);
    expect(keptDuration(ranges)).toBeCloseTo(9.1);
  });

  it("encode les passages gardés bout à bout, à cadence régulière", () => {
    const times = sourceTimes([{ start: 0, end: 0.5 }, { start: 2, end: 2.25 }], 4);
    expect(times).toEqual([0, 0.25, 2]);
    expect(sourceTimes([], 24)).toEqual([]);
  });

  it("l'aperçu saute les passages retirés et reboucle", () => {
    const r = [{ start: 0, end: 1 }, { start: 2, end: 3 }];
    expect(nextKeptTime(r, 0.5)).toBe(0.5);
    expect(nextKeptTime(r, 1.2)).toBe(2);
    expect(nextKeptTime(r, 3.5)).toBe(0);
  });

  it("retire ou remet tout un passage, dans un sens ou dans l'autre", () => {
    const a = toggleRange(new Set(), 5, 2, true);
    expect([...a].sort((x, y) => x - y)).toEqual([2, 3, 4, 5]);
    expect([...toggleRange(a, 3, 4, false)].sort((x, y) => x - y)).toEqual([2, 5]);
  });
});
