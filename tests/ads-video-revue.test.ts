import { describe, expect, it } from "vitest";

import { BASE_V1_EXAMPLES, baseV1Problems, readingNeed } from "@/modules/ads/video/base-v1";
import { beatAlign } from "@/modules/ads/video/beat";
import { featuresOf } from "@/modules/ads/video/default-score";
import { buildPosterProps } from "@/modules/ads/video/props";
import { parseScore, scoreProblems } from "@/modules/ads/video/score";

/**
 * Les corrections de la revue du 16/10/2026 sur les vidéos : chacune verrouillée
 * ici pour ne pas revenir.
 */

const example = (i: number) => parseScore(BASE_V1_EXAMPLES[i].partition);
const ctx = (i: number) => ({ angleFeatures: featuresOf(BASE_V1_EXAMPLES[i].angle), rushFeatures: new Map([[1, ["pointage"]], [2, ["planning"]]]), facts: new Set([1]), maxTotal: 20 });

describe("le calage sur la musique", () => {
  it("garde la base de la partition et ne raccourcit jamais un plan", () => {
    const score = example(0);
    const timed = beatAlign(score, 97);
    expect(timed.base).toBe("v1");
    let planned = 0;
    let aligned = 0;
    score.shots.forEach((s, i) => {
      planned += s.seconds;
      aligned += timed.shots[i].seconds;
      if (i < score.shots.length - 1) expect(aligned).toBeGreaterThanOrEqual(planned - 1e-6);
    });
    expect(timed.shots.map((s) => s.role)).toEqual(score.shots.map((s) => s.role));
  });
});

describe("le temps de lecture compte comme le moteur", () => {
  const typed = { type: "titre", data: { texte: "Et l'équipe n'est pas au courant.", animation: "frappe" }, x: 0.5, y: 0.5, debut: 0 } as never;
  const swap = { type: "titre", data: { texte: "Appeler chaque compagnon", animation: "barre-remplace", remplacement: "Le planning prévient l'équipe." }, x: 0.5, y: 0.5, debut: 0 } as never;

  it("une variante ralentie (vitesse 0,5) double le temps d'animation", () => {
    expect(readingNeed(typed, { speed: 0.5 }) - 1).toBeCloseTo((readingNeed(typed) - 1) * 2, 5);
  });

  it("un style posé allonge la lecture de l'ancienne façon", () => {
    expect(readingNeed(swap, { pace: 1.4 })).toBeGreaterThan(readingNeed(swap, { pace: 1 }));
  });

  it("la Base V1 refuse un exemple dont la variante ralentit trop la phrase tapée", () => {
    expect(baseV1Problems(example(0), ctx(0))).toEqual([]);
    const slow = parseScore(JSON.parse(JSON.stringify(BASE_V1_EXAMPLES[0].partition)));
    ((slow.shots[0] as { elements: { variante?: number }[] }).elements[2]).variante = 99;
    expect(baseV1Problems(slow, { ...ctx(0), speeds: new Map([[99, 0.5]]) }).join(" ")).toMatch(/pour le lire/);
  });
});

describe("les contrôles resserrés", () => {
  it("un type de plan mal écrit est signalé comme tel, pas pris pour une fin", () => {
    const score = parseScore({ shots: [{ kind: "Compo", seconds: 3 }, { kind: "fin", seconds: 2 }] });
    expect(scoreProblems(score, { rushes: new Map(), facts: new Map() }).join(" ")).toMatch(/type « Compo » inconnu/);
  });

  it("la conséquence : une seule notification seulement si c'est la confirmation en grand", () => {
    const raw = JSON.parse(JSON.stringify(BASE_V1_EXAMPLES[0].partition)) as { shots: Record<string, unknown>[] };
    const cons = raw.shots.find((s) => s.role === "consequence")!;
    cons.elements = (cons.elements as Record<string, unknown>[]).slice(0, 1);
    expect(baseV1Problems(parseScore(raw), ctx(0)).join(" ")).toMatch(/confirmation en grand \(variante\), ou 2 à 3 notifications/);
    (cons.elements as Record<string, unknown>[])[0].variante = 20;
    expect(baseV1Problems(parseScore(raw), ctx(0)).join(" ")).not.toMatch(/notifications qui se valident/);
  });
});

describe("l'affiche d'un montage en Base V1", () => {
  it("montre l'écran de l'app pris dans le téléphone du geste, au milieu de son passage", () => {
    const score = example(0);
    const props = buildPosterProps(
      score,
      {
        format: "9x16",
        style: {},
        kit: {},
        cta: "En savoir plus",
        rushes: new Map([
          [1, { url: "https://cdn/1.mp4", width: 732, height: 1510, framing: null }],
          [2, { url: "https://cdn/2.mp4", width: 732, height: 1510, framing: null }],
        ]),
        facts: new Map([[1, { statement: "plus de 5 000 utilisateurs dans le BTP", source: "site" }]]),
      },
      "Lundi. Tout change.",
    );
    expect(props.poster?.rush).toMatchObject({ kind: "rush", src: "https://cdn/2.mp4", fromSec: 2.1, playbackRate: 1 });
  });
});
