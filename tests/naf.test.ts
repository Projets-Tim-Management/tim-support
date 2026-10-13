import { afterEach, describe, expect, it, vi } from "vitest";

import { setNaf } from "@/modules/partner/hooks/setNaf";
import { NAF_DIVISIONS, NAF_SUBCLASSES } from "@/modules/partner/lib/naf-data";
import { isNafCode, nafDivision, nafLabel, normalizeNaf } from "@/modules/partner/lib/naf";

/**
 * Le métier d'un client (code NAF) : la forme, la table, la source qui suit le
 * geste, et ce que la recherche INSEE en retient.
 */

describe("nomenclature NAF rév. 2", () => {
  it("contient les 88 divisions et les 732 sous-classes officielles", () => {
    expect(Object.keys(NAF_DIVISIONS)).toHaveLength(88);
    expect(Object.keys(NAF_SUBCLASSES)).toHaveLength(732);
  });

  it("remet une saisie à la forme INSEE", () => {
    expect(normalizeNaf("4322a")).toBe("43.22A");
    expect(normalizeNaf(" 43 22 A ")).toBe("43.22A");
    expect(normalizeNaf("43.22A")).toBe("43.22A");
    expect(normalizeNaf("43.2")).toBeNull();
    expect(normalizeNaf(null)).toBeNull();
  });

  it("distingue la forme d'un code de son existence", () => {
    expect(isNafCode("43.22A")).toBe(true);
    expect(isNafCode("43.22Z")).toBe(false); // bonne forme, code inexistant
    expect(nafLabel("4322A")).toBe("Travaux d'installation d'eau et de gaz en tous locaux");
    expect(nafLabel("99.99Q")).toBeNull();
  });

  it("donne la division d'un code connu, rien pour un code inconnu", () => {
    expect(nafDivision("43.22A")).toEqual({ code: "43", label: "Travaux de construction spécialisés" });
    expect(nafDivision("43.22Z")).toBeNull();
  });
});

describe("setNaf — la source suit le geste", () => {
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    setNaf({ data, originalDoc } as never) as Record<string, unknown>;

  it("normalise le code et recalcule le libellé", () => {
    const out = run({ naf: "4322a", nafSource: "insee", nafLabel: "n'importe quoi" });
    expect(out).toMatchObject({ naf: "43.22A", nafSource: "insee" });
    expect(out.nafLabel).toBe("Travaux d'installation d'eau et de gaz en tous locaux");
  });

  it("un code changé sans source (API, import) est une saisie manuelle", () => {
    expect(run({ naf: "43.21A" }, { naf: "43.22A", nafSource: "insee" }).nafSource).toBe("manuel");
  });

  it("garde la source quand le code ne change pas", () => {
    expect(run({ companyName: "X" }, { naf: "43.22A", nafSource: "insee" })).toMatchObject({
      naf: "43.22A",
      nafSource: "insee",
    });
  });

  it("efface libellé et source avec le code", () => {
    expect(run({ naf: "" }, { naf: "43.22A", nafSource: "manuel" })).toMatchObject({
      naf: null,
      nafLabel: null,
      nafSource: null,
    });
  });
});

describe("recherche INSEE — le code NAF", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const etab = {
    siret: "55210055400013",
    siren: "552100554",
    uniteLegale: {
      denominationUniteLegale: "ACME",
      activitePrincipaleUniteLegale: "70.10Z",
      nomenclatureActivitePrincipaleUniteLegale: "NAFRev2",
    },
    periodesEtablissement: [
      { activitePrincipaleEtablissement: "43.22A", nomenclatureActivitePrincipaleEtablissement: "NAFRev2" },
    ],
  };

  async function search(q: string, body: unknown) {
    vi.stubEnv("INSEE_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const { inseeSearch } = await import("@/modules/partner/lib/insee");
    return inseeSearch(q);
  }

  it("par SIREN ou dénomination : l'activité de l'unité légale", async () => {
    const res = await search("552100554", { etablissements: [etab] });
    expect(res?.[0].naf).toBe("70.10Z");
  });

  it("par SIRET : l'activité de l'établissement", async () => {
    const res = await search("55210055400013", { etablissement: etab });
    expect(res?.[0].naf).toBe("43.22A");
  });

  it("ignore un code d'une autre nomenclature", async () => {
    const other = {
      ...etab,
      uniteLegale: { ...etab.uniteLegale, nomenclatureActivitePrincipaleUniteLegale: "NAFRev1" },
      periodesEtablissement: [],
    };
    const res = await search("552100554", { etablissements: [other] });
    expect(res?.[0].naf).toBeNull();
  });
});
