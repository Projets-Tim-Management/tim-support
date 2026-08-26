import { describe, expect, it } from "vitest";

import {
  buildLead,
  fallbackCompanyName,
  formatPhone,
  splitName,
  statusForStage,
} from "@/modules/partner/lib/brevo-deals";
import { isBillableClient } from "@/modules/partner/lib/pricing";

/**
 * Entrée des leads du site vitrine et bascule en facturation.
 *
 * Deux endroits où une erreur ne se voit pas tout de suite : un lead rangé dans
 * la mauvaise colonne (ou pas rangé du tout), et un client facturé avant que son
 * contrat n'ait commencé.
 */

const deal = (over: Record<string, unknown> = {}) => ({
  id: "deal-1",
  attributes: { deal_name: "Contact_WP pibled@instalclim.fr", created_at: "2026-08-25T11:04:37Z" },
  ...over,
});

describe("étapes Brevo importées", () => {
  it("range chaque étape amont dans sa colonne", () => {
    expect(statusForStage("Nouvelle")).toBe("nouvelle");
    expect(statusForStage("En qualification")).toBe("en-qualification");
    expect(statusForStage("Démo programmée")).toBe("demo-programmee");
    expect(statusForStage("En attente d'engagement")).toBe("attente-engagement");
    expect(statusForStage("En attente longue")).toBe("attente-longue");
  });

  it("ignore les étapes déjà suivies dans TIM", () => {
    expect(statusForStage("Préparation phase de test")).toBeNull();
    expect(statusForStage("En phase de test")).toBeNull();
    expect(statusForStage("Gagnée")).toBeNull();
    expect(statusForStage("Perdue")).toBeNull();
  });

  it("tolère casse, accents et apostrophe typographique", () => {
    expect(statusForStage("  DÉMO PROGRAMMÉE ")).toBe("demo-programmee");
    expect(statusForStage("En attente d’engagement")).toBe("attente-engagement");
  });

  it("ignore une étape inconnue plutôt que de deviner", () => {
    expect(statusForStage("Étape inventée")).toBeNull();
    expect(statusForStage(undefined)).toBeNull();
  });
});

describe("téléphone", () => {
  it("met un numéro Brevo au format lisible", () => {
    expect(formatPhone("33620311882")).toBe("+33 6 20 31 18 82");
    expect(formatPhone("0620311882")).toBe("+33 6 20 31 18 82");
  });

  it("ne fabrique rien à partir de rien", () => {
    expect(formatPhone(undefined)).toBeUndefined();
    expect(formatPhone("12")).toBeUndefined();
  });
});

describe("nom du contact", () => {
  it("sépare prénom et nom", () => {
    expect(splitName("Pierre Ibled")).toEqual({ firstName: "Pierre", lastName: "Ibled" });
    expect(splitName("Jean Pierre De La Tour")).toEqual({
      firstName: "Jean Pierre De La",
      lastName: "Tour",
    });
    expect(splitName("Pierre")).toEqual({ firstName: "Pierre" });
    expect(splitName(undefined)).toEqual({});
  });
});

describe("nom d'entreprise de repli", () => {
  it("préfère le nom saisi dans le formulaire", () => {
    expect(
      fallbackCompanyName({ email: "p@instalclim.fr", attributes: { JOB_TITLE: "INSTAL'CLIM" } }, deal()),
    ).toBe("INSTAL'CLIM");
  });

  it("déduit l'entreprise du domaine professionnel", () => {
    expect(fallbackCompanyName({ email: "p@instalclim.fr", attributes: {} }, deal())).toBe("Instalclim");
  });

  it("ne prend pas un webmail pour une entreprise", () => {
    expect(fallbackCompanyName({ email: "oat@gmail.com", attributes: { NOM: "Olivier Tahi" } }, deal())).toBe(
      "Olivier Tahi",
    );
  });
});

describe("composition du lead", () => {
  const contact = {
    email: "Pibled@Instalclim.fr",
    attributes: { NOM: "Pierre Ibled", SMS: "33620311882", BESOINS: ["Pointage", "Planning"] },
  };

  it("compose une opportunité complète", () => {
    const built = buildLead(deal(), "Démo programmée", contact, {
      attributes: { name: "Instalclim" },
    });
    expect(built).toEqual({
      lead: {
        dealId: "deal-1",
        clientStatus: "demo-programmee",
        companyName: "Instalclim",
        email: "pibled@instalclim.fr",
        phone: "+33 6 20 31 18 82",
        contactName: { firstName: "Pierre", lastName: "Ibled" },
        besoins: ["Pointage", "Planning"],
        createdAt: "2026-08-25T11:04:37Z",
      },
    });
  });

  it("écarte les étapes non importées et dit pourquoi", () => {
    expect(buildLead(deal(), "Gagnée", contact, null)).toEqual({ skip: "etape:Gagnée" });
    expect(buildLead(deal(), undefined, contact, null)).toEqual({ skip: "etape_inconnue" });
  });

  it("refuse un lead dont on ne sait pas nommer l'entreprise", () => {
    expect(buildLead(deal({ attributes: {} }), "Nouvelle", { attributes: {} }, null)).toEqual({
      skip: "sans_entreprise",
    });
  });
});

describe("bascule en facturation", () => {
  const hier = new Date(Date.now() - 86_400_000).toISOString();
  const demain = new Date(Date.now() + 86_400_000).toISOString();

  it("facture une affaire gagnée dont le contrat a commencé", () => {
    expect(isBillableClient({ clientStatus: "actif", contractStartDate: hier })).toBe(true);
  });

  it("ne facture pas un contrat qui commence plus tard", () => {
    expect(isBillableClient({ clientStatus: "actif", contractStartDate: demain })).toBe(false);
  });

  it("ne facture pas une affaire gagnée sans date de contrat", () => {
    expect(isBillableClient({ clientStatus: "actif" })).toBe(false);
    expect(isBillableClient({ clientStatus: "actif", contractStartDate: "n'importe quoi" })).toBe(false);
  });

  it("ne facture aucune étape du pipeline, ni les fins de contrat", () => {
    for (const clientStatus of ["nouvelle", "en-qualification", "demo-programmee", "attente-engagement", "attente-longue", "en-test", "perdue", "resilie", "archive"]) {
      expect(isBillableClient({ clientStatus, contractStartDate: hier })).toBe(false);
    }
    expect(isBillableClient(null)).toBe(false);
  });
});
