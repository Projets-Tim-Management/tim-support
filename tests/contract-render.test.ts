import { describe, expect, it } from "vitest";

import { DEFAULT_CONTRACT_SECTIONS, DEFAULT_CONTRACT_TITLE } from "@/modules/partner/lib/contract-template.default";
import {
  MISSING_TEXT,
  inlineRuns,
  parseBody,
  renderContract,
  resolveConditionals,
} from "@/modules/partner/lib/contract-render";

describe("contrat — rendu du texte", () => {
  it("remplit les variables et marque les vides", () => {
    const missing = new Set<string>();
    const runs = inlineRuns("La société {{client.denomination}}, SIREN {{client.siren}}", { "client.denomination": "SOUVET" }, missing);
    expect(runs.map((r) => r.text).join("")).toBe(`La société SOUVET, SIREN ${MISSING_TEXT}`);
    expect(runs.find((r) => r.missing)?.text).toBe(MISSING_TEXT);
    expect([...missing]).toEqual(["client.siren"]);
  });

  it("garde le gras, y compris autour d'une variable", () => {
    const runs = inlineRuns("**{{client.denomination}}** signe", { "client.denomination": "SOUVET" }, new Set());
    expect(runs[0]).toEqual({ text: "SOUVET", bold: true, filled: true });
    expect(runs[1]).toEqual({ text: " signe" });
  });

  it("choisit la bonne branche d'une condition", () => {
    const body = "[[si integration.offerte]]offerts[[sinon]]{{integration.montant}}[[/si]]";
    expect(resolveConditionals(body, { "integration.offerte": true })).toBe("offerts");
    expect(resolveConditionals(body, {})).toBe("{{integration.montant}}");
  });

  it("une variable dans une branche écartée ne manque pas", () => {
    const r = renderContract(
      { title: "T", sections: [{ key: "a", title: "A", kind: "article", body: "[[si x]]{{y}}[[/si]]ok" }] },
      {},
    );
    expect(r.missing).toEqual([]);
  });

  it("reconnaît listes, sous-titres, définitions, alignements et blocs spéciaux", () => {
    const blocks = parseBody(
      [
        "### Titre",
        "- un",
        "- deux",
        "",
        "Terme :: définition",
        "",
        ">à droite",
        "",
        "^centré",
        "",
        "{{licences.tableau}}",
        "{{signatures}}",
      ].join("\n"),
      {},
      new Set(),
    );
    expect(blocks.map((b) => b.type)).toEqual(["h", "list", "defs", "p", "p", "prices", "signatures"]);
    expect(blocks[1].type === "list" && blocks[1].items).toHaveLength(2);
    expect(blocks[3]).toMatchObject({ align: "right" });
    expect(blocks[4]).toMatchObject({ align: "center" });
  });

  it("une section personnalisée remplace celle du modèle, et elle seule", () => {
    const template = {
      title: "T",
      sections: [
        { key: "a", title: "A", kind: "article" as const, body: "modèle A" },
        { key: "b", title: "B", kind: "article" as const, body: "modèle B" },
      ],
    };
    const r = renderContract(template, {}, { b: "sur mesure" });
    expect(r.sections.map((s) => s.custom)).toEqual([false, true]);
    const text = (i: number) => {
      const b = r.sections[i].blocks[0];
      return b.type === "p" ? b.runs.map((x) => x.text).join("") : "";
    };
    expect(text(0)).toBe("modèle A");
    expect(text(1)).toBe("sur mesure");
  });

  it("le modèle livré se rend sans erreur et liste ses manques sans doublon", () => {
    const r = renderContract({ title: DEFAULT_CONTRACT_TITLE, sections: DEFAULT_CONTRACT_SECTIONS }, {});
    expect(r.sections).toHaveLength(DEFAULT_CONTRACT_SECTIONS.length);
    expect(new Set(r.missing).size).toBe(r.missing.length);
    expect(r.missing).toContain("client.denomination");
  });
});

import { mergeContractVars, paramsFromClient, usedVariables } from "@/modules/partner/lib/contract-vars";

describe("contrat — informations propres au contrat", () => {
  it("une valeur saisie pour le contrat prime sur la fiche, sans la toucher", () => {
    const base = { "client.denomination": "SOUVET", "client.capital": "10 000" };
    const merged = mergeContractVars(base, { "client.denomination": "SOUVET VMB SAS", "client.capital": "  " });
    expect(merged["client.denomination"]).toBe("SOUVET VMB SAS");
    // Vidée exprès : redevient « à compléter ».
    expect(merged["client.capital"]).toBeNull();
    expect(base["client.denomination"]).toBe("SOUVET");
  });

  it("liste les variables citées par le texte, hors blocs spéciaux", () => {
    const used = usedVariables(["{{a.b}} [[si c]]x[[/si]]", "{{licences.tableau}}\n{{signatures}}"]);
    expect([...used].sort()).toEqual(["a.b", "c"]);
  });

  it("le premier contrat reprend les conditions commerciales de la fiche", () => {
    expect(paramsFromClient({ engagementMonths: "12", integrationOffered: true })).toMatchObject({
      engagementMonths: "12",
      integrationOffered: true,
      preferentialYears: null,
    });
  });
});

import { longDate, isoDay } from "@/modules/partner/lib/contract-vars";

describe("contrat — date de début", () => {
  it("écrit la date en toutes lettres, le jour de Paris", () => {
    expect(longDate("2026-10-01")).toBe("1er octobre 2026");
    expect(longDate("2026-03-15")).toBe("15 mars 2026");
    // Minuit à Paris l'été = 22 h UTC la veille : le jour reste le bon.
    expect(isoDay("2026-06-30T22:00:00.000Z")).toBe("2026-07-01");
  });

  it("l'article 4 cite la date si elle est connue, la signature sinon", () => {
    const body = "Le Contrat prend effet [[si contrat.dateDebut]]le {{contrat.dateDebut}}[[sinon]]à compter de sa signature[[/si]].";
    const text = (vars: Record<string, string | null>) => {
      const b = renderContract({ title: "", sections: [{ key: "a", title: "", kind: "article", body }] }, vars).sections[0].blocks[0];
      return b.type === "p" ? b.runs.map((r) => r.text).join("") : "";
    };
    expect(text({ "contrat.dateDebut": "1er octobre 2026" })).toBe("Le Contrat prend effet le 1er octobre 2026.");
    expect(text({})).toBe("Le Contrat prend effet à compter de sa signature.");
  });
});

import { applyDraft, missingList } from "@/modules/partner/lib/contracts-server";
import { withSectionKeys } from "@/modules/partner/globals/ContractSettings";

describe("contrat — tableau des licences", () => {
  const annexe = { key: "annexe-2", title: "Annexe 2", kind: "annexe" as const, body: "{{licences.tableau}}" };

  it("sans licence tarifée, le tableau manque et bloque l'envoi", () => {
    const r = renderContract({ title: "", sections: [annexe] }, {}, {}, { hasPrices: false });
    expect(r.missing).toEqual(["licences.tableau"]);
    expect(missingList(r)[0]).toMatchObject({ name: "licences.tableau", where: "Fiche → Licences par profil" });
  });

  it("avec des tarifs, ou si le texte n'affiche pas le tableau, rien ne manque", () => {
    expect(renderContract({ title: "", sections: [annexe] }, {}, {}, { hasPrices: true }).missing).toEqual([]);
    const sansTableau = { ...annexe, body: "Pas de tarifs ici." };
    expect(renderContract({ title: "", sections: [sansTableau] }, {}, {}, { hasPrices: false }).missing).toEqual([]);
  });
});

describe("contrat — date de début saisie", () => {
  const params = (contractStartDate: string) =>
    applyDraft({ id: 1 }, { params: { contractStartDate } }).inputs.params?.contractStartDate;

  it("refuse un jour qui n'existe pas", () => {
    expect(params("2026-02-31")).toBeNull();
    expect(params("2026-02-29")).toBeNull();
    expect(params("2026-13-01")).toBeNull();
  });

  it("garde un jour valide, 29 février bissextile compris", () => {
    expect(params("2026-10-01")).toBe("2026-10-01");
    expect(params("2028-02-29")).toBe("2028-02-29");
  });
});

describe("modèle — clé des sections ajoutées dans l'admin", () => {
  it("donne une clé unique aux sections qui n'en ont pas, sans toucher les autres", () => {
    const out = withSectionKeys([
      { key: "article-1", title: "Article 1" },
      { key: null, title: "Article 1" },
      { key: "", title: "Données personnelles – RGPD" },
      { title: "" },
    ]);
    expect(out.map((sec) => sec.key)).toEqual(["article-1", "article-1-2", "donnees-personnelles-rgpd", "section"]);
  });
});
