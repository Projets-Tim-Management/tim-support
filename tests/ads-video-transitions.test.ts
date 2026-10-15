import { describe, expect, it } from "vitest";

import { layoutShots, parseTransition, resolveCuts, styleTransition, transitionProblems } from "@/modules/ads/video/transitions";

/**
 * Les transitions entre plans (15/10/2026) : deux plans se chevauchent le
 * temps de la transition, centrée sur la coupe — la durée totale ne change pas.
 */

describe("les transitions", () => {
  it("se lisent depuis la partition, x/y gardés pour le cercle", () => {
    expect(parseTransition({ type: "cercle", seconds: 0.5, x: 0.4, y: 0.8 })).toEqual({ type: "cercle", seconds: 0.5, x: 0.4, y: 0.8 });
    expect(parseTransition("fondu")).toEqual({ type: "fondu" });
    expect(parseTransition(null)).toBeNull();
  });

  it("sont vérifiées : type connu, premier plan sec, au plus la moitié du plus court des deux plans", () => {
    expect(transitionProblems({ type: "tourbillon" as never }, 1, 2, 2)[0]).toMatch(/inconnue/);
    expect(transitionProblems({ type: "fondu", seconds: 0.4 }, 0, null, 2)[0]).toMatch(/premier plan entre sec/);
    expect(transitionProblems({ type: "fondu", seconds: 0.8 }, 1, 1, 3)[0]).toMatch(/moitié du plus court/);
    expect(transitionProblems({ type: "glisse", seconds: 0.3 }, 1, 2, 2)).toEqual([]);
  });

  it("sans choix, la transition du style ; une durée trop longue est bornée", () => {
    const fallback = styleTransition(["zoom"], "dynamique");
    expect(fallback).toEqual({ type: "zoom", seconds: 0.4 });
    expect(resolveCuts([null, null, { type: "fondu", seconds: 0.8 }], [60, 60, 20], fallback, 30)).toEqual([
      { type: "coupe", frames: 0 },
      { type: "zoom", frames: 12 },
      { type: "fondu", frames: 10 },
    ]);
  });

  it("les plans se chevauchent autour de la coupe, sans changer la durée totale", () => {
    const slots = layoutShots([60, 60], [{ type: "coupe", frames: 0 }, { type: "fondu", frames: 12 }]);
    expect(slots[0]).toMatchObject({ from: 0, duration: 66, outFrames: 12 });
    expect(slots[1]).toMatchObject({ from: 54, duration: 66, inFrames: 12 });
    expect(slots[1].from + slots[1].duration).toBe(120);
  });
});
