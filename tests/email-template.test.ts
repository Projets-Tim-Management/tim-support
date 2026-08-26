import { describe, expect, it } from "vitest";

import { fillTemplate, templatePreview } from "@/modules/partner/lib/email-template";

/**
 * Modèles d'e-mail : remplacement des variables.
 *
 * C'est ici que se joue la différence entre « Bonjour Dupont BTP » et
 * « Bonjour {{entreprise}} » envoyé pour de vrai à un client — l'erreur qu'on ne
 * rattrape pas, puisque le message est parti.
 */

const ctx = {
  entreprise: "KUHN CONSTRUCTION",
  contact: "Béatrice Baptiste",
  prenom: "Béatrice",
  email: "beatrice@kuhn.lu",
  partenaire: "Charlie Piancatelli",
};

describe("remplacement des variables", () => {
  it("remplace chaque variable connue", () => {
    expect(fillTemplate("Bonjour {{prenom}}, pour {{entreprise}}.", ctx)).toBe(
      "Bonjour Béatrice, pour KUHN CONSTRUCTION.",
    );
  });

  it("efface une variable sans valeur AVEC son espace", () => {
    // « Bonjour  , » se remarque plus qu'un « Bonjour, ».
    expect(fillTemplate("Bonjour {{prenom}}, merci.", { prenom: null })).toBe("Bonjour, merci.");
  });

  it("garde l'espace dû à la ponctuation française", () => {
    expect(fillTemplate("Bonjour {{prenom}} ; à bientôt.", { prenom: null })).toBe(
      "Bonjour ; à bientôt.",
    );
  });

  it("nettoie une variable vide en fin de ligne", () => {
    expect(fillTemplate("Merci {{prenom}}\nSuite", { prenom: null })).toBe("Merci\nSuite");
  });

  it("laisse une variable inconnue telle quelle — c'est ainsi qu'on voit la faute", () => {
    expect(fillTemplate("Bonjour {{prenoom}}.", ctx)).toBe("Bonjour {{prenoom}}.");
  });

  it("ne prend pas une clé héritée du prototype pour une variable", () => {
    // `{{toString}}` existe sur tout objet : traité comme connu, il injectait le
    // code source d'une fonction native dans l'e-mail d'un client.
    expect(fillTemplate("x {{toString}} y", ctx)).toBe("x {{toString}} y");
    expect(fillTemplate("x {{constructor}} y", {})).toBe("x {{constructor}} y");
    expect(fillTemplate("x {{hasOwnProperty}} y", {})).toBe("x {{hasOwnProperty}} y");
  });

  it("ne traite pas l'identifiant du partenaire comme du texte", () => {
    expect(fillTemplate("x {{partnerId}} y", { partnerId: 4 })).toBe("x {{partnerId}} y");
  });

  it("remplace toutes les occurrences", () => {
    expect(fillTemplate("{{entreprise}} et {{entreprise}}", ctx)).toBe(
      "KUHN CONSTRUCTION et KUHN CONSTRUCTION",
    );
  });

  it("accepte un modèle sans variable", () => {
    expect(fillTemplate("Bonjour.", ctx)).toBe("Bonjour.");
    expect(fillTemplate("", ctx)).toBe("");
  });
});

describe("aperçu d'un modèle", () => {
  it("aplatit la mise en forme sur une ligne", () => {
    expect(templatePreview("# Titre\n\n- **un**\n- deux")).toBe("Titre un deux");
  });

  it("coupe un long message sans couper un mot en deux écrans", () => {
    const long = "a".repeat(300);
    const out = templatePreview(long, 50);
    expect(out).toHaveLength(50);
    expect(out.endsWith("…")).toBe(true);
  });
});
