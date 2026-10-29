import { describe, expect, it } from "vitest";

import {
  MAX_FRAMES,
  WRITTEN_FEATURE_SCHEMA,
  assignVideo,
  attachMedia,
  framesPerStep,
  keepReused,
  oneVideoPerPart,
  reuseMedia,
  toImportJson,
  withoutReused,
  writerBrief,
} from "@/modules/editorial/lib/feature-writer";

describe("rédiger avec Claude", () => {
  it("partage les 15 images entre les vidéos, au moins une chacune", () => {
    expect(framesPerStep(1)).toBe(15);
    expect(framesPerStep(2)).toBe(7);
    expect(framesPerStep(3)).toBe(5);
    expect(framesPerStep(4)).toBe(3);
    expect(framesPerStep(20)).toBe(1);
    expect(framesPerStep(0)).toBe(0);
    for (let n = 1; n <= MAX_FRAMES; n++) expect(n * framesPerStep(n)).toBeLessThanOrEqual(MAX_FRAMES);
  });

  it("dit à Claude le contexte, les vidéos dans l'ordre, et la fiche à mettre à jour", () => {
    const brief = writerBrief({
      mode: "update",
      notes: "Le bouton Valider devient Envoyer.",
      platforms: ["Mobile"],
      sections: ["Mobile › Pointage"],
      profiles: ["Compagnon"],
      captions: ["choisir le chantier", ""],
      examples: [],
      current: { title: "Pointer" },
    });
    expect(brief).toContain("Mise à jour d'une fiche existante.");
    expect(brief).toContain("Le bouton Valider devient Envoyer.");
    expect(brief).toContain("Pour : Compagnon");
    expect(brief).toContain("1. choisir le chantier");
    expect(brief).toContain("2. (sans légende)");
    expect(brief).toContain('Fiche actuelle, à mettre à jour :\n{"title":"Pointer"}');
  });

  it("ne demande une correction que si on en a écrit une", () => {
    const base = { mode: "new" as const, notes: "x", platforms: [], sections: [], profiles: [], captions: [], examples: [] };
    expect(writerBrief({ ...base, previous: { title: "A" } })).not.toContain("À changer");
    expect(writerBrief({ ...base, previous: { title: "A" }, instruction: "plus court" })).toContain("À changer : plus court");
  });

  it("rend le JSON de l'import, sans le rattachement des vidéos", () => {
    const json = toImportJson({
      title: "T",
      titleFeature: "",
      shortDescription: "S",
      keywords: ["k"],
      intro: "I",
      parties: [{ titre: "P", description: "D", mediaPosition: "droite", video: 2 }],
    });
    expect(json.parties).toEqual([{ titre: "P", description: "D", mediaPosition: "droite" }]);
  });

  it("pose la vidéo dans sa partie : remplace l'image existante, sinon l'ajoute en tête", () => {
    const parts = [
      { titleDoc: "A", mediaDoc: [{ blockType: "img", image: 5 }, { blockType: "fichier", file: 9 }] },
      { titleDoc: "B" },
      { titleDoc: "C", mediaDoc: [{ blockType: "fichier", file: 9 }] },
    ];
    const out = attachMedia(parts, [
      { part: 0, mediaId: 50 },
      { part: 1, mediaId: 51 },
      { part: 2, mediaId: 52 },
      { part: 7, mediaId: 99 },
    ]);
    expect(out[0].mediaDoc).toEqual([{ blockType: "img", image: 50 }, { blockType: "fichier", file: 9 }]);
    expect(out[1].mediaDoc).toEqual([{ blockType: "img", image: 51 }]);
    expect(out[2].mediaDoc?.[0]).toEqual({ blockType: "img", image: 52 });
    // L'entrée n'est pas modifiée.
    expect(parts[0].mediaDoc?.[0]).toEqual({ blockType: "img", image: 5 });
  });

  it("impose une sortie stricte : chaque champ requis, rien en plus", () => {
    expect(WRITTEN_FEATURE_SCHEMA.additionalProperties).toBe(false);
    expect(WRITTEN_FEATURE_SCHEMA.properties.parties.items.required).toContain("video");
  });

  it("une vidéo n'illustre qu'une partie : la première la garde", () => {
    const parts = [{ video: 1 }, { video: 1 }, { video: 1 }, { video: 2 }];
    expect(oneVideoPerPart(parts, 2).map((p) => p.video)).toEqual([1, 0, 0, 2]);
  });

  it("retire un numéro de vidéo qui n'existe pas", () => {
    expect(oneVideoPerPart([{ video: 3 }, { video: -1 }, { video: 1 }], 1).map((p) => p.video)).toEqual([0, 0, 1]);
  });

  it("choisir une vidéo déjà placée la déplace, « aucune » la retire", () => {
    const parts = [{ video: 1 }, { video: 0 }, { video: 2 }];
    expect(assignVideo(parts, 1, 1).map((p) => p.video)).toEqual([0, 1, 2]);
    expect(assignVideo(parts, 2, 0).map((p) => p.video)).toEqual([1, 0, 0]);
  });
});

describe("médias repris de la médiathèque", () => {
  const m = { id: 42, url: "/m.mp4", filename: "pointage-ordinateur.mp4", mimeType: "video/mp4" };
  const parts = (): { titre: string; video: number; existing?: typeof m }[] => [
    { titre: "A", video: 1 },
    { titre: "B", video: 2 },
  ];

  it("reprendre un média remplace la vidéo déposée de la partie, et elle seule", () => {
    const out = reuseMedia(parts(), 0, m);
    expect(out[0]).toMatchObject({ video: 0, existing: m });
    expect(out[1]).toEqual({ titre: "B", video: 2 });
  });

  it("retirer le média repris laisse la partie sans visuel repris", () => {
    const out = reuseMedia(reuseMedia(parts(), 0, m), 0, null);
    expect(out[0].existing).toBeUndefined();
  });

  it("une vidéo déposée choisie ensuite efface le média repris", () => {
    const out = assignVideo(reuseMedia(parts(), 0, m), 0, 2);
    expect(out[0]).toMatchObject({ video: 2, existing: undefined });
    expect(out[1].video).toBe(0);
  });

  it("une réécriture par Claude garde les médias repris sur leur partie", () => {
    const prev = reuseMedia(parts(), 1, m);
    const next = [
      { titre: "A2", video: 1 },
      { titre: "B2", video: 1 },
    ];
    expect(keepReused(next, prev)[1]).toMatchObject({ titre: "B2", video: 0, existing: m });
  });

  it("Claude ne reçoit pas les médias repris", () => {
    const f = { title: "t", titleFeature: "", shortDescription: "", keywords: [], intro: "", parties: reuseMedia([{ titre: "A", description: "", mediaPosition: "droite" as const, video: 0 }], 0, m) };
    expect(withoutReused(f).parties[0]).not.toHaveProperty("existing");
  });
});
