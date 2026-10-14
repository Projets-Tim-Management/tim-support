import type { Field } from "payload";
import { describe, expect, it } from "vitest";

import { AdsBrandKit } from "@/modules/ads/globals/AdsBrandKit";
import { contrastRatio, contrastVerdict, fontFamily, paletteChecks, paletteOf, PALETTE_DEFAULTS, templateColors } from "@/modules/ads/lib/style";

/**
 * La charte des pubs (Kit de marque) : contraste, palette résolue, polices, et
 * la garantie que la mise en onglets n'a rien changé aux champs existants.
 */

describe("le contraste", () => {
  it("rapport WCAG : 21 pour blanc sur noir, 1 pour une couleur sur elle-même", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBe(21);
    expect(contrastRatio("#252B59", "#252B59")).toBe(1);
    expect(contrastRatio("nope", "#000000")).toBe(0);
  });

  it("lisible à 4,5, titres seulement entre 3 et 4,5, illisible en dessous", () => {
    expect(contrastVerdict(4.5)).toBe("ok");
    expect(contrastVerdict(3.2)).toBe("titres");
    expect(contrastVerdict(2.1)).toBe("illisible");
  });

  it("la palette livrée est lisible : blanc sur le marine TIM", () => {
    const checks = paletteChecks({ ...PALETTE_DEFAULTS });
    expect(checks.find((c) => c.label === "Texte sur fond sombre")?.verdict).toBe("ok");
    expect(checks.map((c) => c.label)).toHaveLength(4);
  });
});

describe("la palette résolue", () => {
  it("chaque couleur absente ou invalide reprend Apparence, puis la couleur livrée", () => {
    const p = paletteOf({ palette: { accent: "#FF0000", primary: "rouge" } }, { brandPrimary: "#111111", brandOther: "#EEEEEE" });
    expect(p).toEqual({ primary: "#111111", accent: "#FF0000", darkBg: "#111111", lightBg: "#EEEEEE", textOnDark: "#FFFFFF", textOnLight: "#111111" });
    expect(paletteOf(null).primary).toBe(PALETTE_DEFAULTS.primary);
  });

  it("les gabarits statiques lisent la palette des pubs au format d'Apparence", () => {
    expect(templateColors({ ...PALETTE_DEFAULTS, accent: "#00AA00" })).toMatchObject({ primary: PALETTE_DEFAULTS.darkBg, red: "#00AA00" });
  });

  it("une police inconnue retombe sur Lato, celle du contrat", () => {
    expect(fontFamily("bebas-neue")).toBe("Bebas Neue");
    expect(fontFamily("comic-sans")).toBe("Lato");
  });
});

describe("le Kit de marque en onglets", () => {
  /** Les noms enregistrés en base, à plat : les onglets et lignes sans nom n'en ajoutent pas. */
  const names = (fields: Field[]): string[] =>
    fields.flatMap((f) => {
      const any = f as { name?: string; type: string; fields?: Field[]; tabs?: { fields: Field[] }[] };
      if (any.type === "tabs") return any.tabs!.flatMap((t) => names(t.fields));
      if (any.type === "row" || any.type === "collapsible") return names(any.fields!);
      return any.name ? [any.name] : [];
    });

  it("garde les champs d'avant sous le même nom : la mise en onglets ne touche pas la base", () => {
    const all = names(AdsBrandKit.fields);
    for (const old of ["defaultTone", "voice", "goodExamples", "badExamples", "forbidden", "logoOnDark", "fonts", "advertiser", "legalNotice"]) expect(all).toContain(old);
  });

  it("ajoute logos, palette, typographie, formes, mouvement et inspirations", () => {
    const all = names(AdsBrandKit.fields);
    for (const added of ["logoOnLight", "logoSymbol", "palette", "titleFont", "bodyFont", "titleCase", "corners", "phoneFrame", "graphics", "pace", "transitions", "subtitles", "music", "endCard", "inspirations"]) expect(all).toContain(added);
  });
});
