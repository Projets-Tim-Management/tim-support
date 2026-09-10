import { describe, expect, it } from "vitest";

import { buildStandaloneInvitation } from "@/modules/marketing/lib/portal-invite";

/**
 * L'invitation à l'espace client envoyée HORS phase de test.
 *
 * On ouvre parfois un espace à un prospect pour lui faire essayer le produit,
 * sans enclencher la séquence de quatre semaines. Le message est alors composé
 * sans parcours : ce qui est en jeu, c'est qu'il ne promette aucune date qui
 * n'existe pas, et qu'il reste utilisable — un e-mail sans lien vers l'espace
 * laisse le client dehors.
 */

describe("message composé sans parcours", () => {
  const mail = buildStandaloneInvitation({
    clientName: "Dupont BTP",
    contactFirstName: "Marie",
  });

  it("se compose", () => {
    expect(mail).not.toBeNull();
    expect(mail?.subject).toBeTruthy();
  });

  it("porte le lien de l'espace — sans lui, le client ne peut pas entrer", () => {
    expect(mail?.text).toMatch(/https?:\/\//);
    expect(mail?.html).toMatch(/https?:\/\//);
  });

  it("s'adresse à la personne et nomme l'entreprise", () => {
    expect(mail?.text).toContain("Marie");
    expect(mail?.text).toContain("Dupont BTP");
  });

  it("N'ANNONCE AUCUNE DATE : il n'y a pas de phase de test derrière", () => {
    // Le modèle bascule sur une phrase générale quand il n'a ni démarrage ni
    // échéance. Le vérifier ici, c'est empêcher qu'une évolution du modèle
    // promette un délai à un prospect qui n'en a pas.
    expect(mail?.text).not.toMatch(/qui démarre le/);
    expect(mail?.text).not.toMatch(/À COMPLÉTER AVANT LE/);
  });

  it("ne laisse fuiter ni « null » ni « undefined »", () => {
    for (const part of [mail?.subject, mail?.text, mail?.html]) {
      expect(part).not.toMatch(/undefined|\bnull\b/);
    }
  });

  it("tient debout sans nom de contact ni d'entreprise", () => {
    const anonyme = buildStandaloneInvitation({});
    expect(anonyme?.text).toMatch(/https?:\/\//);
    expect(anonyme?.text).not.toMatch(/undefined|\bnull\b/);
  });
});
