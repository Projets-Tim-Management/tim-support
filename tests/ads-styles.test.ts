import { describe, expect, it } from "vitest";

import { AdStyles, PLANCHE_STYLES } from "@/modules/ads/collections/AdStyles";
import { AdsBrandKit } from "@/modules/ads/globals/AdsBrandKit";
import { testLabel, TEST_DIMENSIONS } from "@/modules/ads/lib/dimensions";

/**
 * La bibliothèque de styles (plan Publicité, §9 sexies, D2b) : les trois styles
 * de la planche, l'agent qui choisit et teste, le kit qui ne garde que ce qui
 * vaut pour tous.
 */

type AnyField = { name?: string; type: string; fields?: AnyField[]; tabs?: { fields: AnyField[] }[]; options?: { value: string }[]; hasMany?: boolean; required?: boolean; admin?: { hidden?: boolean } };
const flat = (fields: AnyField[]): AnyField[] =>
  fields.flatMap((f) => (f.type === "tabs" ? flat(f.tabs!.flatMap((t) => t.fields)) : f.type === "row" || f.type === "collapsible" ? flat(f.fields!) : [f]));

describe("les styles de la planche", () => {
  const fields = flat(AdStyles.fields as AnyField[]);
  const byName = new Map(fields.map((f) => [f.name, f]));

  it("A, B et C, tous actifs", () => {
    expect(PLANCHE_STYLES.map((s) => s.name)).toEqual(["A · Le geste en gros plan", "B · Le chantier d'abord", "C · Clair et posé"]);
    expect(PLANCHE_STYLES.every((s) => s.active)).toBe(true);
  });

  it("chaque valeur existe dans sa liste de choix : le versement en base ne peut pas échouer", () => {
    for (const style of PLANCHE_STYLES) {
      for (const [key, value] of Object.entries(style)) {
        const field = byName.get(key);
        expect(field, `champ ${key}`).toBeDefined();
        if (field?.options) {
          const allowed = field.options.map((o) => o.value);
          for (const v of Array.isArray(value) ? value : [value]) expect(allowed, `${style.name} · ${key}`).toContain(v);
        }
      }
      for (const f of fields.filter((x) => x.required)) expect(style, `${style.name} · ${f.name} obligatoire`).toHaveProperty(f.name!);
    }
  });

  it("un style se distingue : ouvertures et rythmes différents", () => {
    expect(new Set(PLANCHE_STYLES.map((s) => s.opening)).size).toBe(3);
    expect(new Set(PLANCHE_STYLES.map((s) => s.pace)).size).toBe(3);
  });
});

describe("l'agent teste les styles entre eux", () => {
  it("« style » est une dimension de test, étiquetée", () => {
    expect(TEST_DIMENSIONS.map((d) => d.value)).toContain("style");
    expect(testLabel("style")).toBe("test de style");
  });
});

describe("le kit ne garde que ce qui vaut pour tous les styles", () => {
  const fields = flat(AdsBrandKit.fields as AnyField[]);

  it("formes et mouvement par style : les anciens réglages du kit sont masqués (colonnes conservées)", () => {
    for (const old of ["corners", "phoneFrame", "graphics", "pace", "transitions", "subtitles"]) {
      expect(fields.find((f) => f.name === old)?.admin?.hidden, old).toBe(true);
    }
  });

  it("musique et fin de vidéo restent communes", () => {
    expect(fields.find((f) => f.name === "music")?.admin?.hidden).toBeFalsy();
    expect(fields.find((f) => f.name === "endCard")).toBeDefined();
  });
});
