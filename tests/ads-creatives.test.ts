import { describe, expect, it } from "vitest";

import { AdCreatives } from "@/modules/ads/collections/AdCreatives";
import { CREATIVE_FORMATS } from "@/modules/ads/lib/creative-options";

type AnyField = { name?: string; fields?: AnyField[]; access?: Record<string, () => unknown>; defaultValue?: unknown };
const find = (fields: AnyField[], name: string): AnyField | undefined => {
  for (const f of fields) {
    if (f.name === name) return f;
    const inner = f.fields && find(f.fields, name);
    if (inner) return inner;
  }
  return undefined;
};
const derive = AdCreatives.hooks!.beforeChange![0] as (a: unknown) => Record<string, unknown>;
const admin = { req: { user: { roles: ["admin"] } } } as never;

describe("créas", () => {
  it("vouvoient par défaut, et déclarent ce qu'elles testent", () => {
    expect(find(AdCreatives.fields as AnyField[], "tone")!.defaultValue).toBe("vous");
    const out = derive({ data: { tests: [{ dimension: "ton", value: "tu" }], copy: [] } });
    expect(out.isTest).toBe(true);
    expect(derive({ data: { tests: [], copy: [] } }).isTest).toBe(false);
  });

  it("compte les caractères comme Meta (accents et emojis comptent pour un)", () => {
    const out = derive({ data: { copy: [{ text: "Évitez le pointage papier ✅" }] } });
    expect((out.copy as { chars: number }[])[0].chars).toBe(27);
  });

  it("le statut et la décision ne s'écrivent pas par l'API : ce sont les gestes de validation", () => {
    for (const name of ["status", "refusalReason", "refusalDetail", "decidedBy", "decidedAt"]) {
      const f = find(AdCreatives.fields as AnyField[], name)!;
      expect(f.access!.create(), name).toBe(false);
      expect(f.access!.update(), name).toBe(false);
    }
  });

  it("ne se créent pas à la main ; seuls brouillons et refusées se suppriment", () => {
    expect((AdCreatives.access!.create as (a: unknown) => boolean)(admin)).toBe(false);
    expect((AdCreatives.access!.delete as (a: unknown) => unknown)(admin)).toEqual({ status: { in: ["brouillon", "refusee"] } });
  });

  it("connaît les trois formats Meta", () => {
    expect(CREATIVE_FORMATS.map((f) => f.value)).toEqual(["1x1", "4x5", "9x16"]);
  });
});
