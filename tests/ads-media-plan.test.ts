import { describe, expect, it } from "vitest";

import { metaTargeting, planProblems, planSummary, readPlan } from "@/modules/ads/lib/media-plan";
import { createMetaPlatform } from "@/modules/ads/platforms/meta";

const ens = { nom: "Conducteurs", part: 100, pays: ["fr"], age_min: 25, age_max: 60, metiers: [{ id: "108001", name: "Conducteur de travaux" }], interets: [{ id: "6003001", name: "BTP" }, { id: "x y", name: "faux" }] };

describe("lire le plan de l'agent", () => {
  it("ramène aux types, avec les défauts (FR, Advantage+, première optimisation de l'objectif)", () => {
    const p = readPlan({ objectif: "notoriete", ensembles: [{ nom: "A", part: 100 }] });
    expect(p).toMatchObject({ objectif: "notoriete", optimisation: "couverture", ensembles: [{ pays: ["FR"], advantage: true, ageMin: 18, ageMax: 65, genres: "tous" }] });
  });
  it("écarte un identifiant de ciblage qui n'en est pas un", () => {
    expect(readPlan({ objectif: "trafic", ensembles: [ens] }).ensembles[0].interets).toEqual([{ id: "6003001", name: "BTP" }]);
  });
});

describe("ce qui ne se tient pas", () => {
  const plan = (over: Record<string, unknown> = {}) => readPlan({ objectif: "trafic", optimisation: "vues-page", ensembles: [ens], ...over });
  it("un plan simple se tient", () => {
    expect(planProblems(plan(), { metaDailyEur: 20 })).toEqual([]);
  });
  it("refuse une optimisation hors de l'objectif, les conversions sans pixel, des parts qui ne font pas 100", () => {
    expect(planProblems(plan({ optimisation: "couverture" }))[0]).toMatch(/optimiser sur : vues-page, clics/);
    expect(planProblems(readPlan({ objectif: "prospects", ensembles: [ens] }), { hasPixel: false })[0]).toMatch(/pixel/);
    expect(planProblems(plan({ ensembles: [{ ...ens, part: 60 }] }))[0]).toMatch(/60 %/);
  });
  it("refuse un ensemble sous le budget minimal, des âges impossibles, trop d'ensembles", () => {
    expect(planProblems(plan(), { metaDailyEur: 0.5 }).join(" ")).toMatch(/sous le minimum/);
    expect(planProblems(plan({ ensembles: [{ ...ens, age_min: 70 }] })).join(" ")).toMatch(/âges/);
    expect(planProblems(plan({ ensembles: Array.from({ length: 5 }, () => ({ ...ens, part: 20 })) })).join(" ")).toMatch(/4 ensembles au plus/);
  });
  it("un test à plusieurs ensembles exige ses chiffres", () => {
    const two = [{ ...ens, part: 50 }, { ...ens, nom: "Large", part: 50 }];
    expect(planProblems(plan({ ensembles: two })).join(" ")).toMatch(/Plusieurs ensembles/);
    expect(planProblems(plan({ ensembles: two, chiffres: { budget_meta_quotidien_eur: 40, cout_cible_eur: 20, resultats_semaine_par_ensemble: 7 } }))).toEqual([]);
  });
});

describe("traduction en ciblage Meta", () => {
  it("pays, âges, intérêts et métiers dans un même OU, Advantage+ audience", () => {
    const t = metaTargeting(readPlan({ objectif: "trafic", ensembles: [{ ...ens, genres: "femmes", regions: [{ id: "3000", name: "Auvergne" }] }] }).ensembles[0]);
    expect(t).toEqual({
      geo_locations: { countries: ["FR"], regions: [{ key: "3000" }] },
      age_min: 25,
      age_max: 60,
      genders: [2],
      flexible_spec: [{ interests: [{ id: "6003001", name: "BTP" }], work_positions: [{ id: "108001", name: "Conducteur de travaux" }] }],
      targeting_automation: { advantage_audience: 1 },
    });
  });
  it("se résume en une phrase", () => {
    expect(planSummary(readPlan({ objectif: "interaction", ensembles: [ens] }))).toBe("Interaction (vidéo, publication), optimisé sur vues de vidéo (thruplay) — Conducteurs 100 % (Advantage+)");
  });
});

describe("recherche de ciblage chez Meta", () => {
  it("interroge la bonne recherche et rend identifiants, noms, audience", async () => {
    const seen: URL[] = [];
    const fetch = async (u: string) => {
      seen.push(new URL(u));
      return new Response(JSON.stringify({ data: [{ id: "108001", name: "Conducteur de travaux", audience_size_lower_bound: 90000 }, { key: "3000", name: "Auvergne", country_code: "FR" }] }));
    };
    const p = createMetaPlatform({ appId: "a", appSecret: "s", version: "v26.0", fetch, now: () => new Date() });
    const r = await p.searchTargeting!({ externalId: "act_1", token: "T" }, "metier", "conducteur");
    expect(seen[0].searchParams.get("type")).toBe("adworkposition");
    expect(r).toEqual([
      { id: "108001", name: "Conducteur de travaux", audience: 90000, path: null },
      { id: "3000", name: "Auvergne", audience: null, path: "FR" },
    ]);
    await p.searchTargeting!({ externalId: "act_1", token: "T" }, "region", "auv");
    expect(seen[1].searchParams.get("type")).toBe("adgeolocation");
    expect(seen[1].searchParams.get("country_code")).toBe("FR");
  });
});
