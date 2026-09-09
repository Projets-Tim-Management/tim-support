import { describe, expect, it } from "vitest";

// Posé AVANT les imports du module testé : les `describe` construisent des
// jetons dès la collecte, bien avant qu'un `beforeAll` ne puisse s'exécuter.
process.env.PAYLOAD_SECRET ??= "secret-de-test-pour-les-jetons-davis";

import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import {
  SATISFACTION_LEVELS,
  isSatisfactionLevel,
  readSatisfactionToken,
  satisfactionToken,
  satisfactionUrl,
} from "@/modules/marketing/lib/satisfaction";

/**
 * Les cinq visages de « Comment ça se passe ? ».
 *
 * Ce qui se joue ici : la réponse doit revenir dans LE BON parcours, et
 * seulement là. Un jeton devinable permettrait de noter le client de quelqu'un
 * d'autre — ou d'inventer une satisfaction sur un dossier qu'on veut pousser.
 */

describe("échelle de satisfaction", () => {
  it("compte cinq visages, de 1 à 5", () => {
    expect(SATISFACTION_LEVELS).toHaveLength(5);
    expect(SATISFACTION_LEVELS.map((l) => l.value)).toEqual([1, 2, 3, 4, 5]);
  });

  it("chacun porte un visage ET un mot : un emoji ne se rend pas partout", () => {
    for (const level of SATISFACTION_LEVELS) {
      expect(level.emoji.length).toBeGreaterThan(0);
      expect(level.label.length).toBeGreaterThan(0);
    }
  });

  it("n'accepte que ces cinq notes", () => {
    expect(isSatisfactionLevel(3)).toBe(true);
    expect(isSatisfactionLevel(0)).toBe(false);
    expect(isSatisfactionLevel(6)).toBe(false);
    expect(isSatisfactionLevel("4")).toBe(false);
    expect(isSatisfactionLevel(null)).toBe(false);
  });
});

describe("le jeton de réponse", () => {
  it("désigne le parcours, et se relit", () => {
    expect(readSatisfactionToken(satisfactionToken(42))).toBe("42");
  });

  it("refuse une signature fabriquée : sinon on noterait n'importe quel parcours", () => {
    const [encoded] = satisfactionToken(42).split(".");
    expect(readSatisfactionToken(`${encoded}.nimportequoi`)).toBeNull();
    // Le parcours d'un autre, signé pour le nôtre.
    const [autre] = satisfactionToken(43).split(".");
    const [, signature] = satisfactionToken(42).split(".");
    expect(readSatisfactionToken(`${autre}.${signature}`)).toBeNull();
  });

  it("refuse ce qui n'est pas un jeton", () => {
    expect(readSatisfactionToken(null)).toBeNull();
    expect(readSatisfactionToken("")).toBeNull();
    expect(readSatisfactionToken("42")).toBeNull();
    expect(readSatisfactionToken(".")).toBeNull();
  });

  /**
   * Pas d'expiration, volontairement : un client qui rouvre le message trois
   * semaines plus tard doit encore pouvoir répondre. C'est la page qui refuse
   * une réponse sur un test clos, pas le jeton.
   */
  it("ne porte aucune date : il ne peut donc pas expirer", () => {
    expect(satisfactionToken(42)).toBe(satisfactionToken(42));
  });

  it("compose une adresse qui porte la note", () => {
    const url = satisfactionUrl("https://support.tim-management.co/", 42, 5);
    expect(url).toContain("/avis/");
    expect(url).toMatch(/\?note=5$/);
    // Pas de double barre : l'adresse du site est parfois donnée avec.
    expect(url).not.toContain(".co//avis");
  });
});

describe("le message « Comment ça se passe ? »", () => {
  const mail = JOURNEY_EMAILS["check-in"]({ runId: 42, clientName: "Dupont BTP" });

  it("porte les cinq visages, chacun vers sa propre note", () => {
    for (const level of SATISFACTION_LEVELS) {
      expect(mail.html).toContain(`note=${level.value}`);
      expect(mail.html).toContain(level.emoji);
      expect(mail.text).toContain(level.label);
    }
  });

  it("garde l'appel à répondre : un visage ne dit pas ce qui coince", () => {
    expect(mail.text).toContain("Répondez directement à cet e-mail");
  });

  /**
   * Sans parcours, pas de lien possible. Le message doit rester ENVOYABLE :
   * amputé de ses visages, pas cassé — ni lien mort, ni « undefined ».
   */
  it("tient debout sans parcours : il perd ses visages, rien d'autre", () => {
    const seul = JOURNEY_EMAILS["check-in"]({ clientName: "Dupont BTP" });
    expect(seul.html).not.toContain("/avis/");
    expect(seul.html).not.toMatch(/undefined|\bnull\b/);
    expect(seul.text).toContain("Répondez directement à cet e-mail");
  });
});
