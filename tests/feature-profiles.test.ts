import { describe, expect, it } from "vitest";

import { FEATURE_PROFILES, concerns, isFeatureProfile, profileLabel } from "@/modules/editorial/lib/feature-profiles";
import { PROFILS } from "@/modules/partner/lib/pricing";

describe("« Pour qui ? » d'une feature", () => {
  it("une fiche sans profil coché concerne tout le monde", () => {
    expect(concerns([], "compagnon")).toBe(true);
    expect(concerns(undefined, "bureau")).toBe(true);
  });

  it("une fiche cochée ne concerne que ses profils", () => {
    expect(concerns(["compagnon", "visuel"], "compagnon")).toBe(true);
    expect(concerns(["compagnon", "visuel"], "conducteur")).toBe(false);
  });

  it("sans profil choisi, tout est visible", () => {
    expect(concerns(["bureau"], "")).toBe(true);
    expect(concerns(["bureau"], null)).toBe(true);
  });

  it("parle le vocabulaire des licences, avec les mots des équipes", () => {
    const licences = PROFILS.map((p) => p.key as string);
    for (const p of FEATURE_PROFILES) expect(licences, p.value).toContain(p.value);
    expect(profileLabel("visuel")).toBe("Compagnon visuel");
    expect(isFeatureProfile("admin")).toBe(false);
  });
});
