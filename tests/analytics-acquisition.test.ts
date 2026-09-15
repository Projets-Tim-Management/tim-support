import { describe, expect, it } from "vitest";

import { buildAcquisitionAnalytics } from "@/modules/analytics/lib/acquisition";

/** Acquisition : le volume par canal ne suffit pas, c'est la conversion qui dit si un canal rapporte. */
const NOW = new Date("2026-09-15T12:00:00.000Z");

describe("acquisition par canal", () => {
  const leads = [
    { id: 1, channel: "seo", createdAt: "2026-08-02T00:00:00.000Z" },
    { id: 2, channel: "seo", createdAt: "2026-09-02T00:00:00.000Z" },
    { id: 3, channel: "sea", createdAt: "2026-09-03T00:00:00.000Z" },
    { id: 4, channel: "sea", createdAt: "2026-05-03T00:00:00.000Z" }, // hors période (3 mois)
  ];
  const clients = [
    { formSubmission: 1, clientStatus: "actif" },
    { formSubmission: 2, clientStatus: "perdue" },
    { formSubmission: 3, clientStatus: "en-qualification" },
    { formSubmission: 4, clientStatus: "actif" },
    { formSubmission: null, clientStatus: "actif" }, // saisie manuelle : pas un lead
  ];
  const a = buildAcquisitionAnalytics(leads, clients, 3, NOW);

  it("mesure la conversion de chaque canal jusqu'à l'affaire gagnée", () => {
    expect(a.channels.map((c) => [c.key, c.leads, c.opportunities, c.won, c.lost, c.conversion])).toEqual([
      ["seo", 2, 2, 1, 1, 50],
      ["sea", 1, 1, 0, 0, 0],
    ]);
    expect(a.kpis).toEqual({ leads: { current: 3, previous: 1, pct: 200 }, won: 1, conversion: 33.33 });
  });

  it("étale les leads mois par mois, une colonne par canal", () => {
    expect(a.monthly.map((m) => [m.month.slice(0, 7), m.seo, m.sea])).toEqual([
      ["2026-07", 0, 0],
      ["2026-08", 1, 0],
      ["2026-09", 1, 1],
    ]);
    expect(a.channelKeys.map((c) => c.key)).toEqual(["seo", "sea"]);
  });
});
