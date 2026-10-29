import { describe, expect, it } from "vitest";

import { loopSize } from "@/core/lib/video-loop";
import { featureMediaIds, replacedMediaIds } from "@/modules/editorial/lib/feature-media";
import { extOf, featureMediaName, mediaPlace } from "@/modules/editorial/lib/media-name";

const NOW = 1_761_480_000_000; // marque fixe pour les tests

describe("nom d'un visuel de feature", () => {
  it("tire le nom de la feature, de la partie et du format", () => {
    expect(
      featureMediaName({ slug: "pointer-plusieurs-cdc", path: "doc.1.mediaDoc.0.image", ext: "mp4", format: "mobile", now: NOW }),
    ).toBe(`pointer-plusieurs-cdc-partie-2-mobile-${NOW.toString(36).slice(-5)}.mp4`);
  });

  it("se rabat sur le titre, sans accents ni ponctuation", () => {
    const name = featureMediaName({ title: "Gérer les congés : l'essentiel", path: "doc.0.mediaDoc.0.image", ext: ".GIF", now: NOW });
    expect(name.startsWith("gerer-les-conges-l-essentiel-partie-1-")).toBe(true);
    expect(name.endsWith(".gif")).toBe(true);
  });

  it("distingue la vignette, un second média, et les images d'une galerie", () => {
    expect(mediaPlace("thumbnail")).toBe("vignette");
    expect(mediaPlace("doc.2.mediaDoc.1.image")).toBe("partie-3-media-2");
    expect(featureMediaName({ slug: "x", path: "doc.0.mediaDoc.0.images", ext: "png", index: 3, now: NOW })).toMatch(
      /^x-partie-1-3-[a-z0-9]{5}\.png$/,
    );
  });

  it("change d'adresse à chaque dépôt (le cache ne garde pas l'ancienne capture)", () => {
    const a = featureMediaName({ slug: "x", path: "doc.0.mediaDoc.0.image", ext: "mp4", now: NOW });
    const b = featureMediaName({ slug: "x", path: "doc.0.mediaDoc.0.image", ext: "mp4", now: NOW + 60_000 });
    expect(a).not.toBe(b);
  });

  it("lit l'extension", () => {
    expect(extOf("Enregistrement 14.02.11.MOV")).toBe("mov");
    expect(extOf("sans-extension")).toBe("");
  });
});

describe("dimensions de la vidéo convertie", () => {
  it("ramène un écran d'ordinateur à 1200 px de large, en paysage", () => {
    expect(loopSize(2880, 1800)).toEqual({ width: 1200, height: 750 });
  });
  it("garde le portrait d'une capture mobile", () => {
    expect(loopSize(1179, 2556)).toEqual({ width: 1180, height: 2558 });
    expect(loopSize(1290, 2796)).toEqual({ width: 1200, height: 2600 });
  });
  it("n'agrandit jamais une petite capture, et reste en nombres pairs", () => {
    expect(loopSize(801, 451)).toEqual({ width: 802, height: 452 });
  });
});

describe("visuels utilisés par une feature", () => {
  const feature = (img: number, extra: Record<string, unknown> = {}) => ({
    thumbnail: 1,
    doc: [
      { mediaDoc: [{ blockType: "img", image: img }] },
      { mediaDoc: [{ blockType: "galerie", images: [20, { id: 21 }] }, { blockType: "fichier", file: 30 }] },
      { mediaDoc: [{ blockType: "editeur", content: {} }] },
    ],
    ...extra,
  });

  it("compte vignette, image, galerie et fichier", () => {
    expect([...featureMediaIds(feature(10))].sort()).toEqual(["1", "10", "20", "21", "30"]);
  });

  it("ne retient comme remplacé que ce qui a disparu de la version publiée", () => {
    expect(replacedMediaIds(feature(11), [feature(10), feature(12), feature(11)]).sort()).toEqual(["10", "12"]);
  });

  it("ne voit rien de remplacé quand rien n'a changé", () => {
    expect(replacedMediaIds(feature(10), [feature(10)])).toEqual([]);
    expect(replacedMediaIds(null, [])).toEqual([]);
  });
});
