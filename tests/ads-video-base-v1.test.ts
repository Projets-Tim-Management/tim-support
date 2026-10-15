import { describe, expect, it } from "vitest";

import { BASE_V1_EXAMPLES, baseV1Guide, baseV1Problems, readingNeed, type BaseContext } from "@/modules/ads/video/base-v1";
import { featuresOf } from "@/modules/ads/video/default-score";
import { parseScore, scoreProblems, type ScoreContext } from "@/modules/ads/video/score";

/**
 * La Base V1 des vidéos (15/10/2026) : la structure et les règles arrêtées
 * avec Charlie. Ses deux exemples la respectent ; chaque écart connu est
 * refusé avec sa raison.
 */

const CTX: BaseContext = { angleFeatures: [], rushFeatures: new Map([[1, ["pointage"]], [2, ["planning"]]]), facts: new Set([1]), maxTotal: 20 };
const example = (i: number) => parseScore(BASE_V1_EXAMPLES[i].partition);
const ctxFor = (i: number): BaseContext => ({ ...CTX, angleFeatures: featuresOf(BASE_V1_EXAMPLES[i].angle) });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const withShot = (i: number, k: number, patch: (s: Record<string, unknown>) => void) => {
  const raw = clone(BASE_V1_EXAMPLES[i].partition);
  patch(raw.shots[k]);
  return parseScore(raw);
};

describe("la Base V1", () => {
  it("ses deux exemples (planning, pointage) la respectent", () => {
    expect(baseV1Problems(example(0), ctxFor(0))).toEqual([]);
    expect(baseV1Problems(example(1), ctxFor(1))).toEqual([]);
  });

  it("l'ordre des temps et le rôle de chaque plan sont imposés", () => {
    const raw = clone(BASE_V1_EXAMPLES[0].partition);
    [raw.shots[1], raw.shots[2]] = [raw.shots[2], raw.shots[1]];
    expect(baseV1Problems(parseScore(raw), ctxFor(0)).join(" ")).toMatch(/suivent l'ordre/);
    expect(baseV1Problems(withShot(0, 0, (s) => delete s.role), ctxFor(0)).join(" ")).toMatch(/chaque plan dit son rôle/);
  });

  it("le geste montre la fonctionnalité de l'angle : un angle planning refuse le rush du pointage", () => {
    const p = baseV1Problems(withShot(0, 2, (s) => ((s.fond as Record<string, unknown>).rush = 1)), ctxFor(0)).join(" ");
    expect(p).toMatch(/prends un rush de CETTE fonctionnalité/);
  });

  it("pas d'accent en aplat, des fonds qui alternent, un halo sur chaque fond plein", () => {
    expect(baseV1Problems(withShot(0, 1, (s) => ((s.fond as Record<string, unknown>).couleur = "accent")), ctxFor(0)).join(" ")).toMatch(/jamais l'accent/);
    expect(baseV1Problems(withShot(0, 4, (s) => ((s.fond as Record<string, unknown>).couleur = "accent-pale")), ctxFor(0)).join(" ")).toMatch(/même fond que le plan précédent/);
    expect(baseV1Problems(withShot(0, 1, (s) => delete (s.fond as Record<string, unknown>).halo), ctxFor(0)).join(" ")).toMatch(/son halo/);
  });

  it("caméra sur chaque plan composé, transitions variées, jamais l'éclair ni les confettis", () => {
    expect(baseV1Problems(withShot(0, 1, (s) => delete s.camera), ctxFor(0)).join(" ")).toMatch(/mouvement de caméra/);
    expect(baseV1Problems(withShot(0, 2, (s) => (s.transition = { type: "glisse", seconds: 0.3 })), ctxFor(0)).join(" ")).toMatch(/deux fois de suite/);
    expect(baseV1Problems(withShot(0, 1, (s) => (s.transition = { type: "flash", seconds: 0.3 })), ctxFor(0)).join(" ")).toMatch(/pas d'éclair/);
    expect(baseV1Problems(withShot(0, 3, (s) => (s.elements as unknown[]).push({ type: "confettis", data: {}, x: 0.5, y: 0.5, debut: 0.2 })), ctxFor(0)).join(" ")).toMatch(/pas de confettis/);
  });

  it("chaque texte a le temps d'être lu : la phrase tapée reste 1 s finie", () => {
    const typed = { type: "titre", data: { texte: "Et l'équipe n'est pas au courant.", animation: "frappe" }, x: 0.5, y: 0.5, debut: 0 } as never;
    expect(readingNeed(typed)).toBeCloseTo((2 + 33 * 1.6) / 30 + 1, 5);
    const late = withShot(0, 0, (s) => ((s.elements as Record<string, unknown>[])[2].debut = 2.5));
    expect(baseV1Problems(late, ctxFor(0)).join(" ")).toMatch(/il en faut .* pour le lire/);
  });

  it("le retournement : un seul titre barré-remplacé, avec un mot fort", () => {
    const p = baseV1Problems(withShot(0, 1, (s) => ((s.elements as Record<string, unknown>[])[0].data = { texte: "Avant", animation: "bloc" })), ctxFor(0)).join(" ");
    expect(p).toMatch(/barré-remplacé/);
  });

  it("imposée à un montage d'IA : une partition sans base est refusée, une partition V1 passe le contrôle complet", () => {
    const ctx: ScoreContext = {
      rushes: new Map([
        [1, { id: 1, ready: true, durationSec: 12.5, framing: null, srcAspect: 732 / 1510 }],
        [2, { id: 2, ready: true, durationSec: 6.4, framing: null, srcAspect: 732 / 1510 }],
      ]),
      facts: new Map([[1, { id: 1, statement: "plus de 5 000 utilisateurs dans le BTP", source: "site" }]]),
      offer: "essai gratuit de 30 jours",
      variants: new Map([[20, { type: "notification", status: "actif" }]]),
      requireBase: true,
      base: { angleFeatures: featuresOf(BASE_V1_EXAMPLES[0].angle), rushFeatures: CTX.rushFeatures },
    };
    expect(scoreProblems(example(0), ctx)).toEqual([]);
    const noBase: Record<string, unknown> = clone(BASE_V1_EXAMPLES[0].partition);
    delete noBase.base;
    expect(scoreProblems(parseScore(noBase), ctx).join(" ")).toMatch(/part de la Base V1/);
  });

  it("le guide lu par les IA porte les temps, les règles, le vocabulaire et les exemples", () => {
    const g = baseV1Guide() as { temps: { role: string; garde: string[]; libre: string[] }[]; regles: string[]; vocabulaire: Record<string, unknown>; exemples: unknown[] };
    expect(g.temps.map((t) => t.role)).toEqual(["accroche", "retournement", "geste", "consequence", "preuve", "fin"]);
    expect(g.temps.every((t) => t.garde.length && t.libre.length)).toBe(true);
    expect(g.regles.join(" ")).toMatch(/fonctionnalité/);
    expect(Object.keys(g.vocabulaire)).toEqual(expect.arrayContaining(["transitions", "camera", "fonds"]));
    expect(g.exemples).toHaveLength(2);
  });
});
