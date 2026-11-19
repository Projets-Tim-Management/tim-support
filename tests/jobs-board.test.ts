import { describe, expect, it } from "vitest";

import { parseJobProposals, planJobProposals } from "@/modules/editorial/lib/jobs/proposals";
import { jobFieldsFromWp, jobStatusFromWp } from "@/modules/editorial/lib/jobs/sync";

describe("fiches métier : synchronisation depuis WordPress", () => {
  it("reprend le métier, le code ROME, la date des chiffres et le statut", () => {
    const f = jobFieldsFromWp({
      id: 7400,
      slug: "magasinier-negoce-materiaux-construction",
      status: "publish",
      link: "https://tim-management.co/fiche-metier/magasinier-negoce-materiaux-construction",
      date_gmt: "2026-11-17T09:00:57",
      modified_gmt: "2026-11-17T09:00:57",
      title: { raw: "Magasinier en négoce de matériaux" },
      acf: { rome: "n1103", derniere_mise_a_jour: "20261117", definition: "…" },
    });
    expect(f.wpLink).toBe("https://tim-management.co/fiche-metier/magasinier-negoce-materiaux-construction");
    expect(f).toMatchObject({ title: "Magasinier en négoce de matériaux", rome: "N1103", figuresUpdatedAt: "2026-11-17", wpModified: "2026-11-17T09:00:57.000Z" });
    expect(jobStatusFromWp(null, "publish")).toBe("publiee");
    expect(jobStatusFromWp("arretee", "publish")).toBe("arretee");
  });
});

describe("fiches métier : les métiers choisis par l'équipe", () => {
  const sheets = [
    { title: "Magasinier en négoce de matériaux", rome: "N1103", status: "publiee" },
    { title: "Coffreur bancheur", rome: "F1701", status: "arretee" },
  ];
  it("lit la balise <metiers>", () => {
    expect(parseJobProposals('<metiers>[{"metier":"Grutier","codeRome":"f1301","pourquoi":"recherches"}]</metiers>')).toEqual([{ title: "Grutier", rome: "F1301", why: "recherches" }]);
    expect(parseJobProposals("rien")).toEqual([]);
  });
  it("code ROME bien formé, pas déjà couvert ni arrêté, une par semaine", () => {
    const { keep, skipped } = planJobProposals(
      [
        { title: "Grutier", rome: "F13", why: "" },
        { title: "Magasinier cariste", rome: "N1103", why: "" },
        { title: "Coffreur", rome: "F1701", why: "" },
        { title: "Grutier", rome: "F1301", why: "" },
        { title: "Électricien du bâtiment", rome: "F1602", why: "" },
      ],
      sheets,
    );
    expect(keep.map((k) => k.title)).toEqual(["Grutier"]);
    expect(skipped.map((s) => s.motive)).toEqual([
      "Code ROME invalide (« F13 »).",
      "Déjà couvert : « Magasinier en négoce de matériaux ».",
      "Métier déjà arrêté par Charlie.",
      "Une fiche par semaine au plus (ou 2 déjà en attente de rédaction).",
    ]);
  });
  it("rien de nouveau tant que 2 fiches attendent leur rédaction", () => {
    const busy = [...sheets, { title: "A", rome: "F1101", status: "a-rediger" }, { title: "B", rome: "F1102", status: "redaction" }];
    expect(planJobProposals([{ title: "Grutier", rome: "F1301", why: "" }], busy).keep).toEqual([]);
  });
});
