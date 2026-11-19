import { describe, expect, it } from "vitest";

import { criteriaEvidence, MIN_GROUP, quartiles, verdictOf, type ContentRow } from "@/modules/editorial/lib/score/evidence";
import { withPrecedent } from "@/modules/editorial/lib/score/run";

const row = (ok: boolean, clicks: number, position: number, extra: Partial<ContentRow["outcome"]> = {}): ContentRow => ({
  title: "t",
  kind: "article",
  seo: clicks,
  geo: 50,
  coverage: null,
  criteria: [{ id: "GEO-10", jauge: "geo", libelle: "FAQ présente", poids: 10, preuve: "D", statut: "info", resultat: ok ? 1 : 0 }],
  outcome: { clicks28: clicks, position, aiSessions: 0, aiShown: null, aiCited: null, ...extra },
});

describe("boucle de mesure", () => {
  it("trop peu de contenus d'un côté : aucune conclusion", () => {
    const e = criteriaEvidence([...Array.from({ length: 10 }, () => row(true, 50, 5)), row(false, 0, 40)]);
    expect(e[0].verdict).toMatch(/trop peu/);
    expect(e[0].poids).toBe(0);
  });
  it("écart grossier en faveur, confirmé par la position", () => {
    const e = criteriaEvidence([...Array.from({ length: MIN_GROUP }, () => row(true, 40, 6)), ...Array.from({ length: MIN_GROUP }, () => row(false, 5, 25))]);
    expect(e[0].verdict).toMatch(/EN FAVEUR/);
    expect(e[0].verdict).toMatch(/pas une preuve/);
  });
  it("écart grossier contre le critère : propose un test", () => {
    const e = criteriaEvidence([...Array.from({ length: MIN_GROUP }, () => row(true, 3, 30)), ...Array.from({ length: MIN_GROUP }, () => row(false, 30, 8))]);
    expect(e[0].verdict).toMatch(/CONTRE/);
  });
  it("quelques clics (2 contre 0) : jamais un écart", () => {
    const e = criteriaEvidence([...Array.from({ length: MIN_GROUP }, () => row(true, 2, 8)), ...Array.from({ length: MIN_GROUP }, () => row(false, 0, 12))]);
    expect(e[0].verdict).toMatch(/trop faibles/);
  });
  it("clics et position en désaccord : pas d'écart net", () => {
    const a = { contenus: 10, clics28jMedian: 40, positionMediane: 30, visitesIAMoyenne: 0, citeDansLaReponseIAdeGoogle: "" };
    const b = { contenus: 10, clics28jMedian: 5, positionMediane: 8, visitesIAMoyenne: 0, citeDansLaReponseIAdeGoogle: "" };
    expect(verdictOf(a, b)).toBe("pas d'écart net");
  });
  it("citations IA comptées seulement quand Google affiche une réponse IA", () => {
    const e = criteriaEvidence([row(true, 1, 1, { aiShown: true, aiCited: true }), row(true, 1, 1, { aiShown: true, aiCited: false }), row(true, 1, 1)]);
    expect(e[0].respecte.citeDansLaReponseIAdeGoogle).toBe("1/2");
  });
  it("quartiles : il faut assez de contenus notés", () => {
    expect(quartiles([row(true, 1, 1)], "seo")).toMatch(/trop peu/);
    expect(quartiles(Array.from({ length: 40 }, (_, i) => row(true, i, 10)), "seo")).toHaveLength(4);
  });
});

describe("note d'avant une nouvelle version des règles", () => {
  it("gardée au changement de version, puis conservée", () => {
    const first = withPrecedent({ seo: 71 }, { scoreRulesVersion: 2, scoreSeo: 78, scoreGeo: 80, scoreDetail: {} }, 3);
    expect(first.precedent).toEqual({ version: 2, seo: 78, geo: 80 });
    const later = withPrecedent({ seo: 72 }, { scoreRulesVersion: 3, scoreSeo: 71, scoreDetail: first }, 3);
    expect(later.precedent).toEqual({ version: 2, seo: 78, geo: 80 });
    expect(withPrecedent({ seo: 50 }, { scoreRulesVersion: null }, 3).precedent).toBeUndefined();
  });
});
