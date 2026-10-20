import { describe, expect, it } from "vitest";

import { BASE_V1_BEATS, baseV1Text } from "@/modules/ads/lib/design-brief/base-v1";
import { checkFile, formatOf, parseFileName, safeBox, FORMATS } from "@/modules/ads/lib/meta-specs";

describe("formats Meta", () => {
  it("reconnaît le format aux proportions, avec une petite tolérance", () => {
    expect([formatOf(1080, 1080), formatOf(1080, 1350), formatOf(1080, 1920), formatOf(1080, 1352), formatOf(1920, 1080)]).toEqual(["1x1", "4x5", "9x16", "4x5", null]);
  });

  it("garde la zone sûre unifiée du 9:16", () => {
    expect(safeBox(FORMATS["9x16"])).toEqual({ x: 65, y: 269, width: 950, height: 979 });
  });
});

describe("vérification d'un fichier importé", () => {
  it("accepte une vidéo 9:16 de 17 s", () => {
    expect(checkFile({ mime: "video/mp4", bytes: 20e6, width: 1080, height: 1920, durationSec: 17 }, "9x16")).toMatchObject({ ok: true, format: "9x16", kind: "video", problems: [], warnings: [] });
  });

  it("refuse un type inconnu, des proportions fausses, un nom qui ment", () => {
    expect(checkFile({ mime: "image/gif", bytes: 1e5, width: 1080, height: 1080 }).problems[0]).toMatch(/Type de fichier/);
    expect(checkFile({ mime: "image/png", bytes: 1e5, width: 1920, height: 1080 }).problems[0]).toMatch(/ni 1:1/);
    expect(checkFile({ mime: "image/png", bytes: 1e5, width: 1080, height: 1080 }, "9x16").problems[0]).toMatch(/Le nom annonce Plein écran 9:16/);
  });

  it("refuse une vidéo hors durée, prévient hors de la cible Base V1, et une image peu nette", () => {
    expect(checkFile({ mime: "video/mp4", bytes: 1e6, width: 1080, height: 1920, durationSec: 75 }).ok).toBe(false);
    expect(checkFile({ mime: "video/quicktime", bytes: 1e6, width: 1080, height: 1920, durationSec: 30 }).warnings[0]).toMatch(/vise 15 à 20 s/);
    expect(checkFile({ mime: "image/jpeg", bytes: 1e5, width: 720, height: 720 })).toMatchObject({ ok: true, warnings: [expect.stringMatching(/moins nette/)] });
    expect(checkFile({ mime: "image/jpeg", bytes: 1e5, width: 400, height: 400 }).ok).toBe(false);
  });
});

describe("nom d'un fichier exporté", () => {
  it("lit le code de la créa et le format", () => {
    expect(parseFileName("C12-9x16.mp4")).toEqual({ creative: 12, format: "9x16" });
    expect(parseFileName("c12_4x5.png")).toEqual({ creative: 12, format: "4x5" });
    expect(parseFileName("TIM C7 1x1 v2.png")).toEqual({ creative: 7, format: "1x1" });
    expect(parseFileName("export final.mp4")).toEqual({ creative: null, format: null });
  });
});

describe("Base V1 en texte", () => {
  it("donne les six temps pour une vidéo, les règles seules pour un visuel fixe", () => {
    expect(BASE_V1_BEATS.map((b) => b.role)).toEqual(["accroche", "retournement", "geste", "consequence", "preuve", "fin"]);
    expect(baseV1Text(true)).toMatch(/STRUCTURE DE LA VIDÉO/);
    expect(baseV1Text(false)).not.toMatch(/STRUCTURE/);
    expect(baseV1Text(false)).toMatch(/Le rouge est une TOUCHE/);
  });
});
