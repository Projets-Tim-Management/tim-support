import { describe, expect, it } from "vitest";

import { PLANCHE_STYLES } from "@/modules/ads/collections/AdStyles";
import { buildRenderProps, figureOf, renderStyleOf } from "@/modules/ads/video/props";
import { parseScore, scoreProblems, totalFrames, type ScoreContext } from "@/modules/ads/video/score";

/**
 * La partition d'une vidéo (plan Publicité, §9 sexies, D3) : ce que le code
 * refuse avant tout rendu, et ce que le moteur reçoit.
 */

const ctx: ScoreContext = {
  rushes: new Map([
    [1, { id: 1, ready: true, durationSec: 12.48, framing: { crop: { x: 0, y: 0.05, w: 1, h: 0.9 }, protect: { x: 0.1, y: 0.6, w: 0.6, h: 0.12 } } }],
    [3, { id: 3, ready: false, durationSec: null, framing: null }],
  ]),
  facts: new Map([
    [5, { id: 5, statement: "plus de 5 000 utilisateurs dans le BTP", source: "Site tim-management.co" }],
    [6, { id: 6, statement: "noté 4,9/5", source: "Avis App Store" }],
  ]),
  offer: "essai gratuit de 30 jours",
  forbidden: ["révolutionnaire"],
};

const GOOD = {
  shots: [
    { kind: "ouverture", seconds: 2, text: "Fini la ressaisie du vendredi.", highlight: "ressaisie" },
    { kind: "rush", seconds: 4, rush: 1, from: 1, to: 6, caption: "Vos équipes pointent sur leur téléphone." },
    { kind: "preuve", seconds: 1.5, fact: 5 },
    { kind: "fin", seconds: 2.5, line: "Essai gratuit de 30 jours." },
  ],
};

describe("une partition vérifiée", () => {
  it("bonne partition : rien à redire", () => {
    expect(scoreProblems(parseScore(GOOD), ctx)).toEqual([]);
    expect(totalFrames(parseScore(GOOD))).toBe(300);
  });

  it("refuse une vidéo sans fin, sans rush, trop longue", () => {
    const p = scoreProblems(parseScore({ shots: [{ kind: "ouverture", seconds: 6, text: "Bonjour" }, { kind: "preuve", seconds: 6, fact: 5 }, { kind: "ouverture", seconds: 6, text: "x" }, { kind: "ouverture", seconds: 5, text: "y" }] }), ctx);
    expect(p).toEqual(expect.arrayContaining([expect.stringMatching(/dernier plan est la fin/), expect.stringMatching(/montre un rush/), expect.stringMatching(/Durée totale de 23 s/)]));
  });

  it("refuse un passage hors du rush, une vitesse illisible, un rush non converti", () => {
    expect(scoreProblems(parseScore({ shots: [{ kind: "rush", seconds: 4, rush: 1, from: 10, to: 14 }, { kind: "fin", seconds: 3 }] }), ctx)).toEqual(expect.arrayContaining([expect.stringMatching(/hors du rush/)]));
    expect(scoreProblems(parseScore({ shots: [{ kind: "rush", seconds: 1, rush: 1, from: 0, to: 12 }, { kind: "fin", seconds: 5 }] }), ctx)).toEqual(expect.arrayContaining([expect.stringMatching(/vitesse ×12/)]));
    expect(scoreProblems(parseScore({ shots: [{ kind: "rush", seconds: 4, rush: 3, from: 0, to: 4 }, { kind: "fin", seconds: 3 }] }), ctx)).toEqual(expect.arrayContaining([expect.stringMatching(/pas encore converti/)]));
  });

  it("refuse un zoom qui couperait la zone à ne jamais couper", () => {
    const zoomed = (zoom: Record<string, number>) => parseScore({ shots: [{ kind: "rush", seconds: 4, rush: 1, from: 0, to: 4, zoom }, { kind: "fin", seconds: 3 }] });
    expect(scoreProblems(zoomed({ x: 0, y: 0.5, w: 0.8, h: 0.35 }), ctx)).toEqual([]);
    expect(scoreProblems(zoomed({ x: 0.4, y: 0.5, w: 0.5, h: 0.35 }), ctx)).toEqual(expect.arrayContaining([expect.stringMatching(/coupe la zone à ne jamais couper/)]));
    expect(scoreProblems(zoomed({ x: 0, y: 0.5, w: 0.2, h: 0.2 }), ctx)).toEqual(expect.arrayContaining([expect.stringMatching(/trop serré/)]));
  });

  it("aucun chiffre inventé, aucun mot interdit, aucun faux témoignage à l'écran", () => {
    const withText = (text: string) => parseScore({ shots: [{ kind: "ouverture", seconds: 2, text }, { kind: "rush", seconds: 4, rush: 1, from: 0, to: 4 }, { kind: "fin", seconds: 3 }] });
    expect(scoreProblems(withText("Gagnez 3 heures par semaine"), ctx)).toEqual(expect.arrayContaining([expect.stringMatching(/Chiffre non sourcé : 3/)]));
    expect(scoreProblems(withText("Essai gratuit de 30 jours"), ctx)).toEqual([]);
    expect(scoreProblems(withText("Un outil révolutionnaire"), ctx).join(" ")).toMatch(/révolutionnaire/);
  });

  it("une preuve est toujours un fait sourcé", () => {
    const p = scoreProblems(parseScore({ shots: [{ kind: "rush", seconds: 4, rush: 1, from: 0, to: 4 }, { kind: "preuve", seconds: 2, fact: 99 }, { kind: "fin", seconds: 3 }] }), ctx);
    expect(p).toEqual(expect.arrayContaining([expect.stringMatching(/fait 99 introuvable/)]));
  });
});

describe("ce que reçoit le moteur", () => {
  const resolve = (format: "9x16" | "1x1", styleIndex: number) =>
    buildRenderProps(parseScore(GOOD), {
      format,
      style: PLANCHE_STYLES[styleIndex] as unknown as Record<string, unknown>,
      kit: { palette: { accent: "#F05761" }, logoOnDark: { url: "https://cdn/logo.webp" }, endCard: { url: "tim-management.co" } },
      cta: "En savoir plus",
      rushes: new Map([[1, { url: "https://cdn/rush1.mp4", width: 732, height: 1510, framing: ctx.rushes.get(1)!.framing }]]),
      facts: new Map([[5, { statement: "plus de 5 000 utilisateurs dans le BTP", source: "Site" }]]),
    });

  it("format, cadence, durée de chaque plan en images", () => {
    const p = resolve("9x16", 0);
    expect(p).toMatchObject({ width: 1080, height: 1920, fps: 30, cta: "En savoir plus", logos: { dark: "https://cdn/logo.webp" } });
    expect(p.shots.map((x) => x.frames)).toEqual([60, 120, 45, 75]);
  });

  it("un passage de rush : vitesse, zone utile, cadrage plein cadre qui garde la zone protégée", () => {
    const rush = resolve("9x16", 1).shots[1];
    expect(rush).toMatchObject({ kind: "rush", src: "https://cdn/rush1.mp4", fromSec: 1, playbackRate: 1.25, crop: { y: 0.05, h: 0.9 } });
    if (rush.kind === "rush") expect(rush.cover).not.toBeNull();
  });

  it("la preuve en géant prend le chiffre du fait", () => {
    expect(figureOf("plus de 5 000 utilisateurs dans le BTP")).toBe("5 000");
    expect(figureOf("noté 4,9/5")).toBe("4,9/5");
    expect(resolve("1x1", 2).shots[2]).toMatchObject({ kind: "preuve", value: "5 000", source: "Site" });
  });

  it("le style de la planche, lu par le moteur", () => {
    expect(renderStyleOf(PLANCHE_STYLES[1] as unknown as Record<string, unknown>)).toMatchObject({ opening: "aplat-probleme", titleFont: "Bebas Neue", titleUpper: true, phoneFrame: "ecran-seul", pace: "rapide" });
    expect(renderStyleOf({}).opening).toBe("titre-mot-a-mot");
  });
});
