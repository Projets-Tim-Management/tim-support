import { describe, expect, it } from "vitest";

import { creaPathname, expectedFormats, isCreaBlobUrl, isCreaPathname, missingFiles, withImported } from "@/modules/ads/lib/creative-files";
import { checkImport, ImportError } from "@/modules/ads/lib/creative-import";
import { buildDesignPrompt, expectedFileNames, type DesignKit } from "@/modules/ads/lib/design-brief/prompt";
import { BriefError, checkIntent } from "@/modules/ads/lib/design-brief/write";

const KIT: DesignKit = {
  palette: { primary: "#1F2A44", accent: "#E63946", darkBg: "#1F2A44", lightBg: "#F4F1EA", textOnDark: "#FFFFFF", textOnLight: "#1F2A44" },
  titleFont: "Montserrat",
  bodyFont: "Inter",
  titleCase: "normale",
  logos: ["logo-couleur.png"],
  endUrl: "tim-management.co",
  voice: "Direct, concret.",
  forbidden: ["révolutionnaire"],
};
const CREA = { id: 12, angle: "Le planning prévient l'équipe", hook: "Lundi. Tout change.", cta: "En savoir plus", texts: [{ kind: "titre", text: "Le planning qui prévient" }] };
const INTENT = { kind: "video" as const, formats: ["9x16" as const, "4x5" as const], durationSec: 18, rationale: "Les concurrents montrent des tableaux ; personne ne montre l'équipe prévenue.", scenario: "1. Accroche : « Lundi. » puis « Tout change. » …" };

describe("le prompt Claude Design", () => {
  const prompt = buildDesignPrompt(CREA, INTENT, KIT, [{ id: 1, title: "Planning chantier", filename: "planning.mov", description: "Le conducteur déplace une équipe." }]);

  it("porte l'intention de l'agent, les textes, le kit, la Base V1, les rushes et les formats", () => {
    expect(prompt).toMatch(/VIDÉO de 18 s/);
    expect(prompt).toContain(INTENT.rationale);
    expect(prompt).toContain(INTENT.scenario);
    expect(prompt).toContain("« Lundi. Tout change. »");
    expect(prompt).toContain("Titre (sous la pub) : « Le planning qui prévient »");
    expect(prompt).toContain("accent #E63946 (en touche seulement)");
    expect(prompt).toContain("Montserrat pour les titres");
    expect(prompt).toContain("Mots interdits : révolutionnaire");
    expect(prompt).toMatch(/STRUCTURE DE LA VIDÉO/);
    expect(prompt).toContain("planning.mov — Planning chantier");
    expect(prompt).toMatch(/Plein écran 9:16 : 1080×1920 px — .* zone sûre de 950×979 px/);
    expect(prompt).toContain("C12-9x16.mp4, C12-4x5.mp4");
  });

  it("un visuel fixe n'a pas de structure vidéo, et s'exporte en PNG", () => {
    const p = buildDesignPrompt(CREA, { ...INTENT, kind: "image", durationSec: null }, KIT, []);
    expect(p).toMatch(/un VISUEL FIXE/);
    expect(p).not.toMatch(/STRUCTURE DE LA VIDÉO/);
    expect(expectedFileNames(12, { kind: "les-deux", formats: ["1x1"] })).toEqual(["C12-1x1.mp4", "C12-1x1.png"]);
  });
});

describe("l'intention de l'agent, vérifiée", () => {
  const raw = { kind: "video" as const, formats: ["9x16" as const], durationSec: 18, rationale: INTENT.rationale, scenario: "x".repeat(100), rushes: [3, "3", "a"] };
  it("garde ce qui est valide", () => {
    expect(checkIntent(raw, [])).toMatchObject({ kind: "video", formats: ["9x16"], durationSec: 18, rushes: [3] });
    expect(checkIntent({ ...raw, kind: "image" }, []).durationSec).toBeNull();
  });
  it("refuse une intention incomplète, une durée hors bornes, un mot interdit, un faux témoignage", () => {
    expect(() => checkIntent({ ...raw, kind: "gif" as never }, [])).toThrow(BriefError);
    expect(() => checkIntent({ ...raw, formats: [] }, [])).toThrow(/format/);
    expect(() => checkIntent({ ...raw, durationSec: 90 }, [])).toThrow(/Durée/);
    expect(() => checkIntent({ ...raw, rationale: "court" }, [])).toThrow(/pourquoi cette pub/);
    expect(() => checkIntent({ ...raw, scenario: `${"x".repeat(100)} révolutionnaire` }, ["révolutionnaire"])).toThrow();
  });
});

describe("les fichiers d'une créa", () => {
  it("attend les formats et la nature du brief", () => {
    expect(expectedFormats({})).toEqual(["1x1", "4x5", "9x16"]);
    const c = { brief: { kind: "les-deux", formats: ["9x16"] }, files: [{ format: "9x16", kind: "video", url: "u" }] };
    expect(missingFiles(c)).toEqual(["9:16 image"]);
  });

  it("un réimport remplace le fichier du même format et de la même nature", () => {
    const a = { format: "9x16", kind: "video", url: "a" };
    const b = { format: "9x16", kind: "video", url: "b" };
    const img = { format: "9x16", kind: "image", url: "i" };
    expect(withImported([a, img], b)).toEqual({ files: [img, b], replaced: a });
  });

  it("range le fichier dans le dossier de sa créa, et n'accepte que ce dossier", () => {
    expect(creaPathname(12, "9x16", "export final.MP4")).toBe("ads/creas/12/C12-9x16.mp4");
    expect(isCreaPathname(12, "ads/creas/12/C12-9x16.mp4")).toBe(true);
    expect(isCreaPathname(12, "ads/creas/13/C13-9x16.mp4")).toBe(false);
    expect(isCreaPathname(12, "ads/creas/12/../rushes/x.mp4")).toBe(false);
    expect(isCreaBlobUrl(12, "https://abc.public.blob.vercel-storage.com/ads/creas/12/C12-9x16-AbC.mp4")).toBe(true);
    expect(isCreaBlobUrl(12, "https://ailleurs.fr/ads/creas/12/a.mp4")).toBe(false);
  });
});

describe("l'import d'un fichier fini, vérifié", () => {
  const URL12 = "https://abc.public.blob.vercel-storage.com/ads/creas/12/C12-9x16-AbC.mp4";
  const req = { url: URL12, filename: "C12-9x16.mp4", mime: "video/mp4", bytes: 2e7, width: 1080, height: 1920, durationSec: 17 };
  it("accepte un fichier conforme et en déduit format et nature", () => {
    expect(checkImport(12, "a-valider", req)).toMatchObject({ format: "9x16", kind: "video" });
  });
  it("refuse une créa décidée, un fichier d'ailleurs, un nom d'une autre créa, ce que Meta refuserait", () => {
    expect(() => checkImport(12, "validee", req)).toThrow(/ne changent plus/);
    expect(() => checkImport(12, "a-valider", { ...req, url: "https://ailleurs.fr/x.mp4" })).toThrow(ImportError);
    expect(() => checkImport(12, "a-valider", { ...req, filename: "C13-9x16.mp4" })).toThrow(/créa C13/);
    expect(() => checkImport(12, "a-valider", { ...req, width: 1920, height: 1080 })).toThrow(/ni 1:1/);
  });
});
