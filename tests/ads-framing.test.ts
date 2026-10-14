import { describe, expect, it } from "vitest";

import { AdRushes } from "@/modules/ads/collections/AdRushes";
import { cleanRect, contains, coverRect, FULL, validateFraming, viewAllowed } from "@/modules/ads/lib/framing";

/**
 * Le recadrage d'un rush (plan Publicité, §9 sexies, D1d) : zone utile, zone à
 * ne jamais couper, et le cadrage de chaque format — le même calcul pour
 * l'aperçu de la fiche et pour le moteur vidéo.
 */

// Un enregistrement d'écran d'iPhone : 732 × 1510, plus haut que le 9:16.
const IPHONE = 732 / 1510;

describe("les zones tracées", () => {
  it("ramène un rectangle dans l'image ; refuse ce qui n'en est pas un", () => {
    expect(cleanRect({ x: 0.9, y: -0.2, w: 0.5, h: 0.5 })).toEqual({ x: 0.9, y: 0, w: 0.1, h: 0.5 });
    expect(cleanRect({ x: "a" })).toBeNull();
    expect(cleanRect(null)).toBeNull();
  });

  it("la zone protégée doit être dans la zone utile ; un clic raté n'est pas une zone", () => {
    expect(validateFraming({ crop: { x: 0, y: 0.1, w: 1, h: 0.8 }, protect: { x: 0.1, y: 0.5, w: 0.5, h: 0.2 } })).toMatchObject({ ok: true });
    expect(validateFraming({ crop: { x: 0, y: 0.1, w: 1, h: 0.5 }, protect: { x: 0.1, y: 0.5, w: 0.5, h: 0.3 } })).toEqual({ ok: false, error: expect.stringMatching(/à l'intérieur de la zone utile/) });
    expect(validateFraming({ crop: { x: 0, y: 0, w: 0.05, h: 0.5 } })).toEqual({ ok: false, error: expect.stringMatching(/trop petite/) });
    expect(validateFraming({})).toEqual({ ok: true, framing: { crop: null, protect: null } });
  });
});

describe("le cadrage d'un format", () => {
  it("sans recadrage, l'iPhone en 9:16 : toute la largeur, coupé en haut et en bas, centré", () => {
    const { rect, fits } = coverRect(IPHONE, { crop: null, protect: null }, 9 / 16);
    expect(fits).toBe(true);
    expect(rect.w).toBe(1);
    expect(rect.h).toBeCloseTo(0.862, 3);
    expect(rect.y).toBeCloseTo((1 - rect.h) / 2, 3);
  });

  it("cadre sur la zone protégée, et la garde entière", () => {
    const framing = { crop: null, protect: { x: 0.05, y: 0.8, w: 0.9, h: 0.15 } };
    const { rect, fits } = coverRect(IPHONE, framing, 1);
    expect(fits).toBe(true);
    expect(contains(rect, framing.protect)).toBe(true);
    // Le carré se décale vers le bas pour contenir le bouton, sans sortir de l'image.
    expect(rect.y + rect.h).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("une zone protégée trop haute pour le carré : montrée en entier sur fond, rien n'est coupé", () => {
    // 85 % de la hauteur : tient en 9:16 (qui en garde 86 %), pas dans le carré.
    const framing = { crop: null, protect: { x: 0, y: 0.05, w: 1, h: 0.85 } };
    expect(coverRect(IPHONE, framing, 1).fits).toBe(false);
    expect(coverRect(IPHONE, framing, 9 / 16).fits).toBe(true);
  });

  it("reste dans la zone utile", () => {
    const framing = { crop: { x: 0, y: 0.08, w: 1, h: 0.84 }, protect: null };
    const { rect } = coverRect(IPHONE, framing, 4 / 5);
    expect(contains(framing.crop, rect)).toBe(true);
  });
});

describe("un zoom proposé par un montage", () => {
  const framing = { crop: { x: 0, y: 0.05, w: 1, h: 0.9 }, protect: { x: 0.2, y: 0.6, w: 0.3, h: 0.1 } };

  it("permis s'il garde la zone protégée entière, dans la zone utile", () => {
    expect(viewAllowed({ x: 0.1, y: 0.5, w: 0.6, h: 0.3 }, framing)).toBe(true);
  });

  it("refusé s'il coupe la zone protégée ou sort de la zone utile", () => {
    expect(viewAllowed({ x: 0.3, y: 0.5, w: 0.6, h: 0.3 }, framing)).toBe(false);
    expect(viewAllowed({ x: 0, y: 0, w: 1, h: 0.5 }, framing)).toBe(false);
    expect(viewAllowed(FULL, { crop: null, protect: null })).toBe(true);
  });
});

describe("la fiche", () => {
  const prepare = AdRushes.hooks!.beforeChange![0] as unknown as (a: unknown) => Record<string, unknown>;
  const original = { url: "https://abc.public.blob.vercel-storage.com/ads/rushes/a.mov", contentType: "video/quicktime" };

  it("refuse un recadrage incohérent, même venu de l'API", () => {
    expect(() => prepare({ data: { framing: { crop: { x: 0, y: 0, w: 1, h: 0.3 }, protect: { x: 0, y: 0.5, w: 0.5, h: 0.2 } } }, originalDoc: { original }, operation: "update" })).toThrow(/à l'intérieur/);
  });

  it("enregistre un recadrage propre", () => {
    const out = prepare({ data: { framing: { crop: { x: 0, y: 0.05, w: 1, h: 0.9 }, protect: null } }, originalDoc: { original }, operation: "update" });
    expect(out.framing).toEqual({ crop: { x: 0, y: 0.05, w: 1, h: 0.9 }, protect: null });
  });
});
