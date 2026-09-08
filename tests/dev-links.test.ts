import { describe, expect, it } from "vitest";

import { hostOf, linkLabel, normalizeUrl, serviceOf } from "@/modules/dev/lib/links";

/**
 * Les liens externes d'un développement.
 *
 * Ce qui est en jeu : un lien enregistré doit s'ouvrir. Une URL collée depuis
 * une barre d'adresse arrive sans protocole ; la refuser pour ça serait
 * pédant, l'enregistrer telle quelle donnerait un lien mort.
 */

describe("compléter une saisie", () => {
  it("ajoute le protocole manquant", () => {
    expect(normalizeUrl("figma.com/file/abc")).toBe("https://figma.com/file/abc");
    expect(normalizeUrl("  www.notion.so/page  ")).toBe("https://www.notion.so/page");
  });

  it("respecte le protocole donné", () => {
    expect(normalizeUrl("http://intranet.tim.fr/doc")).toBe("http://intranet.tim.fr/doc");
    expect(normalizeUrl("https://figma.com/x")).toBe("https://figma.com/x");
  });

  it("refuse ce qui ne peut pas être une adresse", () => {
    // Un hôte sans point est une faute de frappe plus probablement qu'une
    // intention — et le lien n'ouvrirait rien.
    expect(normalizeUrl("maquette")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });
});

describe("reconnaître le service", () => {
  it("nomme les services courants", () => {
    expect(serviceOf("https://www.figma.com/file/x").label).toBe("Figma");
    expect(serviceOf("https://notion.so/page").label).toBe("Notion");
    expect(serviceOf("https://docs.google.com/document/d/x").label).toBe("Google");
    expect(serviceOf("https://github.com/tim/repo").label).toBe("GitHub");
  });

  it("ne confond pas un domaine qui CONTIENT le nom d'un service", () => {
    // « figma.com.exemple.fr » n'est pas Figma.
    expect(serviceOf("https://figma.com.exemple.fr/x").label).toBe("Lien");
    expect(serviceOf("https://monfigma.com/x").label).toBe("Lien");
  });

  it("retombe sur le lien générique pour un domaine inconnu", () => {
    expect(serviceOf("https://intranet.tim.fr/doc").icon).toBe("🔗");
  });
});

describe("ce qui s'affiche sur la pastille", () => {
  it("l'intitulé donné passe avant tout", () => {
    expect(linkLabel({ label: "Maquette v3", url: "https://figma.com/x" })).toBe("Maquette v3");
  });

  it("à défaut, le nom du service", () => {
    expect(linkLabel({ url: "https://figma.com/x" })).toBe("Figma");
  });

  it("à défaut encore, l'hôte sans www", () => {
    expect(linkLabel({ url: "https://www.intranet.tim.fr/doc" })).toBe("intranet.tim.fr");
    expect(hostOf("https://www.exemple.fr/a/b")).toBe("exemple.fr");
  });
});
