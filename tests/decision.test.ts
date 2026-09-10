import { describe, expect, it } from "vitest";

process.env.PAYLOAD_SECRET ??= "secret-de-test";

import { CLIENT_DECISIONS, RUN_DECISIONS, isClientDecision } from "@/modules/marketing/lib/journey";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { readRunToken, runToken } from "@/modules/marketing/lib/run-token";
import { satisfactionToken } from "@/modules/marketing/lib/satisfaction";

/**
 * « Fin de votre test — votre décision » : trois boutons plutôt qu'une liste.
 *
 * C'est la réponse la plus utile du parcours, et c'était celle qu'on obtenait le
 * moins : il fallait rédiger un message pour dire laquelle des trois.
 */

const CTX = { runId: 42, clientName: "Dupont BTP", contactFirstName: "Marie" };

describe("les trois réponses", () => {
  it("correspondent une à une aux décisions du back-office", () => {
    expect(CLIENT_DECISIONS.map((d) => d.value)).toEqual(RUN_DECISIONS.map((d) => d.value));
  });

  it("portent chacune sa conséquence : on ne choisit pas à l'aveugle", () => {
    for (const d of CLIENT_DECISIONS) {
      expect(d.label.trim(), d.value).not.toBe("");
      expect(d.hint.trim(), d.value).not.toBe("");
    }
  });

  it("n'accepte que ces trois valeurs", () => {
    expect(isClientDecision("contrat")).toBe(true);
    expect(isClientDecision("abandon")).toBe(true);
    expect(isClientDecision("go")).toBe(false);
    expect(isClientDecision(null)).toBe(false);
    expect(isClientDecision(1)).toBe(false);
  });
});

describe("le message de décision", () => {
  const mail = JOURNEY_EMAILS.decision(CTX);

  it("porte un lien par réponse, chacun avec son choix", () => {
    for (const d of CLIENT_DECISIONS) {
      expect(mail.html, d.value).toContain(`choix=${d.value}`);
      expect(mail.text, d.value).toContain(`choix=${d.value}`);
      expect(mail.text, d.value).toContain(d.label);
    }
  });

  it("garde l'appel à répondre : un bouton ne dit pas POURQUOI", () => {
    expect(mail.text).toMatch(/répondez/i);
  });

  /**
   * Sans parcours, pas de lien possible. Le message doit rester ENVOYABLE :
   * il retombe sur la liste, jamais sur un lien mort.
   */
  it("tient debout sans parcours : il retombe sur la liste", () => {
    const seul = JOURNEY_EMAILS.decision({ clientName: "Dupont BTP" });
    expect(seul.html).not.toContain("/decision/");
    expect(seul.html).not.toMatch(/undefined|\bnull\b/);
    for (const d of CLIENT_DECISIONS) expect(seul.text).toContain(d.label);
  });
});

describe("le jeton, par SUJET", () => {
  it("désigne le parcours et se relit", () => {
    expect(readRunToken("decision", runToken("decision", 42))).toBe("42");
  });

  /**
   * Le garde-fou qui compte : un lien reçu pour donner son ressenti ne doit pas
   * ouvrir la page qui engage la suite commerciale.
   */
  it("un jeton d'avis ne permet PAS de décider, et réciproquement", () => {
    expect(readRunToken("decision", satisfactionToken(42))).toBeNull();
    expect(readRunToken("avis", runToken("decision", 42))).toBeNull();
  });

  it("refuse une signature fabriquée", () => {
    const [encoded] = runToken("decision", 42).split(".");
    expect(readRunToken("decision", `${encoded}.nimportequoi`)).toBeNull();
    // Le parcours d'un autre, signé pour le nôtre.
    const [autre] = runToken("decision", 43).split(".");
    const [, signature] = runToken("decision", 42).split(".");
    expect(readRunToken("decision", `${autre}.${signature}`)).toBeNull();
  });

  it("refuse ce qui n'est pas un jeton", () => {
    for (const mauvais of [null, "", "42", ".", "a.b.c"]) {
      expect(readRunToken("decision", mauvais)).toBeNull();
    }
  });
});
