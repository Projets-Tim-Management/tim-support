import { describe, expect, it } from "vitest";

import { departmentOf, regionOf } from "@/core/lib/regions";

describe("la région d'un code postal", () => {
  it("lit le département et sa région", () => {
    expect(regionOf("25270")).toBe("Bourgogne-Franche-Comté");
    expect(regionOf("92000")).toBe("Île-de-France");
    expect(regionOf("64480")).toBe("Nouvelle-Aquitaine");
    expect(regionOf("69730")).toBe("Auvergne-Rhône-Alpes");
  });
  it("sait la Corse et l'outre-mer", () => {
    expect(departmentOf("20000")).toBe("2A");
    expect(departmentOf("20200")).toBe("2B");
    expect(regionOf("97400")).toBe("La Réunion");
  });
  it("ne devine pas sur un code illisible", () => {
    expect(regionOf("")).toBeNull();
    expect(regionOf("ABCDE")).toBeNull();
    expect(regionOf(null)).toBeNull();
  });
});
