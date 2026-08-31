import { describe, expect, it } from "vitest";

import {
  MAX_UPLOAD_BYTES,
  formatOctets,
  messageErreurUpload,
  refusPourTaille,
} from "@/core/lib/media-upload";

/**
 * Ce que l'utilisateur LIT quand un envoi de média échoue.
 *
 * Le champ avalait l'erreur (`if (!res.ok) return null`) : la zone de dépôt
 * restait vide, sans un mot, et il fallait ouvrir la console du navigateur pour
 * apprendre qu'un 400 était passé par là. Constaté le 31/08/2026 sur l'ajout
 * d'un GIF à une feature.
 *
 * Ces règles décident donc d'un texte destiné à quelqu'un qui ne lira jamais
 * les journaux — d'où leur place ici, hors du composant, et ces tests.
 */

const Mo = 1024 * 1024;

describe("taille lisible", () => {
  it("écrit à la française, avec une virgule", () => {
    expect(formatOctets(4_964_352)).toBe("4,7 Mo");
    expect(formatOctets(1536)).toBe("1,5 Ko");
  });

  it("laisse tomber la décimale au-delà de cent", () => {
    // « 128 Mo » se lit ; « 128,4 Mo » n'apporte rien.
    expect(formatOctets(128 * Mo)).toBe("128 Mo");
  });

  it("garde les tout petits fichiers en octets", () => {
    expect(formatOctets(396)).toBe("396 o");
  });

  it("ne produit jamais « NaN » ni « Infinity » sous les yeux de quelqu'un", () => {
    expect(formatOctets(Number.NaN)).toBe("taille inconnue");
    expect(formatOctets(-1)).toBe("taille inconnue");
  });
});

describe("refus avant envoi", () => {
  it("laisse passer un fichier dans les clous", () => {
    expect(refusPourTaille(20 * Mo)).toBeNull();
    expect(refusPourTaille(MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("refuse au-delà, en disant le poids ET le plafond", () => {
    // Sans les deux chiffres, le message oblige à deviner de combien on dépasse.
    const message = refusPourTaille(150 * Mo);
    expect(message).toContain("150 Mo");
    expect(message).toContain("100 Mo");
  });

  it("couvre le plus gros média réellement en base (97 Mo)", () => {
    // Le plafond doit accepter ce qui existe déjà, sinon on interdit de
    // remplacer un fichier qu'on a soi-même publié.
    expect(refusPourTaille(97 * Mo)).toBeNull();
  });

  it("le plafond n'est plus celui des fonctions Vercel", () => {
    // Tout l'objet de l'envoi direct au CDN : 4,5 Mo ne borne plus rien.
    expect(refusPourTaille(Math.round(4.6 * Mo))).toBeNull();
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(4.5 * Mo);
  });
});

describe("message d'erreur", () => {
  it("préfère le message de Payload à toute supposition", () => {
    const m = messageErreurUpload(400, { errors: [{ message: "Le fichier est corrompu." }] });
    expect(m).toBe("Le fichier est corrompu.");
  });

  it("réunit plusieurs erreurs plutôt que d'en cacher", () => {
    const m = messageErreurUpload(400, { errors: [{ message: "A" }, { message: "B" }] });
    expect(m).toBe("A · B");
  });

  it("explique le 400 générique des uploads, qui ne dit rien de lui-même", () => {
    const m = messageErreurUpload(400, {});
    expect(m).toMatch(/GIF|traitement|journaux/i);
    expect(m).not.toMatch(/^400$/);
  });

  it("distingue une session perdue d'un problème de fichier", () => {
    expect(messageErreurUpload(403)).toMatch(/session|reconnect/i);
    expect(messageErreurUpload(401)).toMatch(/session|reconnect/i);
  });

  it("nomme le plafond quand le serveur refuse pour le poids", () => {
    expect(messageErreurUpload(413)).toContain("100 Mo");
  });

  it("dit qu'il faut réessayer sur une panne serveur", () => {
    expect(messageErreurUpload(500)).toMatch(/Réessayez/i);
  });

  it("reste compréhensible sur un statut inattendu ou une coupure", () => {
    expect(messageErreurUpload(0)).toMatch(/connexion/i);
    expect(messageErreurUpload(418)).toContain("418");
  });

  it("ignore un corps de réponse inexploitable au lieu de planter", () => {
    for (const corps of [null, undefined, "texte brut", { errors: "pas un tableau" }, { errors: [{}] }]) {
      expect(typeof messageErreurUpload(400, corps)).toBe("string");
      expect(messageErreurUpload(400, corps).length).toBeGreaterThan(10);
    }
  });
});
