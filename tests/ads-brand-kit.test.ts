import { describe, expect, it } from "vitest";

import { AdFacts } from "@/modules/ads/collections/AdFacts";
import { AdMedia } from "@/modules/ads/collections/AdMedia";
import { AdsBrandKit } from "@/modules/ads/globals/AdsBrandKit";
import { DEFAULT_TONE, testLabel } from "@/modules/ads/lib/dimensions";

type AnyField = { name?: string; fields?: AnyField[]; tabs?: { fields: AnyField[] }[]; validate?: (v: unknown, o: unknown) => unknown; defaultValue?: unknown; required?: boolean };
/** Un champ par son nom, en descendant dans les lignes, groupes ET onglets (le Kit de marque est en onglets depuis le 14/10/2026). */
const find = (fields: AnyField[], name: string): AnyField | undefined => {
  for (const f of fields) {
    if (f.name === name) return f;
    const inner = (f.fields && find(f.fields, name)) || (f.tabs && find(f.tabs.flatMap((t) => t.fields), name));
    if (inner) return inner;
  }
  return undefined;
};
const validate = (field: string, value: unknown, sibling: Record<string, unknown>) =>
  find(AdMedia.fields as AnyField[], field)!.validate!(value, { siblingData: sibling });

describe("médias publicitaires : ce qui permet de s'en servir est exigé", () => {
  it("une capture exige l'absence de données réelles", () => {
    expect(validate("noClientData", false, { kind: "capture" })).toMatch(/aucune donnée réelle/);
    expect(validate("noClientData", true, { kind: "capture" })).toBe(true);
    expect(validate("noClientData", undefined, { kind: "logo" })).toBe(true);
  });

  it("une photo ou une musique exige ses droits", () => {
    expect(validate("rights", "", { kind: "photo" })).toMatch(/droits/);
    expect(validate("rights", "Photo TIM, chantier Lyon, accord signé", { kind: "photo" })).toBe(true);
    expect(validate("rights", "", { kind: "capture" })).toBe(true);
  });

  it("une police exige sa licence, et se dépose en TTF ou OTF", () => {
    expect(validate("license", "", { kind: "police" })).toMatch(/licence/);
    const hook = AdMedia.hooks!.beforeValidate![0] as (a: unknown) => unknown;
    expect(() => hook({ data: { kind: "police" }, req: { file: { name: "Brand.woff2" } } })).toThrow(/ttf ou \.otf/);
    expect(hook({ data: { kind: "police" }, req: { file: { name: "Brand-Bold.ttf" } } })).toEqual({ kind: "police" });
    expect(hook({ data: { kind: "photo" }, req: { file: { name: "chantier.webp" } } })).toEqual({ kind: "photo" });
  });

  it("n'est lisible que par l'admin", () => {
    const partner = { req: { user: { roles: ["partner-metier"] } } } as never;
    expect((AdMedia.access!.read as (a: unknown) => boolean)(partner)).toBe(false);
    expect((AdFacts.access!.read as (a: unknown) => boolean)(partner)).toBe(false);
  });
});

describe("faits sourcés", () => {
  it("un fait n'existe pas sans sa source ni sa date", () => {
    const fields = AdFacts.fields as AnyField[];
    expect(find(fields, "statement")?.required).toBe(true);
    expect(find(fields, "source")?.required).toBe(true);
    expect(find(fields, "date")?.required).toBe(true);
  });
});

describe("kit de marque", () => {
  it("vouvoie par défaut ; le tutoiement est un test étiqueté", () => {
    expect(DEFAULT_TONE).toBe("vous");
    expect(find(AdsBrandKit.fields as AnyField[], "defaultTone")?.defaultValue).toBe("vous");
    expect(testLabel("ton")).toBe("test de ton");
  });

  // Décision du 14/10/2026 (Charlie) : les couleurs des pubs vivent dans le kit, préremplies avec Apparence ;
  // celles du contrat (brandPrimary…) et le logo du menu restent dans Apparence, sans doublon.
  it("a sa propre palette, préremplie avec Apparence, sans redemander les couleurs du contrat", () => {
    const names = JSON.stringify(AdsBrandKit.fields);
    expect(names).not.toMatch(/"name":"(brandPrimary|brandSecondary|brandRed|brandOther|companyLogo|logo)"/);
    expect(find(AdsBrandKit.fields as AnyField[], "palette")).toBeDefined();
    expect(find(AdsBrandKit.fields as AnyField[], "primary")?.defaultValue).toBe("#252B59");
  });
});
