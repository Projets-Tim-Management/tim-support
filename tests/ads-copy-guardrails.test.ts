import { describe, expect, it } from "vitest";

import {
  allowedNumbers,
  charCount,
  checkForbidden,
  checkLength,
  checkNumbers,
  checkPersonalAttributes,
  checkTestimonial,
  checkTone,
  guard,
  numbersIn,
} from "@/modules/ads/lib/copy/guardrails";

describe("longueur (limites Meta)", () => {
  it("rejette au-delà de la limite dure, jamais ne tronque", () => {
    expect(checkLength("titre", "x".repeat(40))).toBeNull();
    expect(checkLength("titre", "x".repeat(41))).toMatch(/41 caractères/);
    expect(checkLength("description", "x".repeat(31))).toMatch(/limite de 30/);
    expect(checkLength("principal", "   ")).toMatch(/vide/);
  });
  it("compte un accent ou un emoji pour un caractère", () => {
    expect(charCount("Été ✅")).toBe(5);
  });
});

describe("mentions interdites", () => {
  it("sans tenir compte des majuscules ni des accents, aux bornes de mot", () => {
    expect(checkForbidden("Le NUMÉRO 1 du pointage", ["numero 1"])).toMatch(/numero 1/);
    expect(checkForbidden("Arrêtez le papier, stop !", ["top"])).toBeNull();
    expect(checkForbidden("Le meilleur logiciel", ["meilleur"])).toMatch(/meilleur/);
  });
});

describe("aucun chiffre non sourcé", () => {
  const allowed = allowedNumbers(["Nos clients gagnent 2 h par semaine", "Démo de 30 minutes"]);
  it("accepte les chiffres des faits et de l'offre", () => {
    expect(checkNumbers("Gagnez 2 h par semaine, démo de 30 min", allowed)).toBeNull();
  });
  it("rejette un chiffre qui sort du modèle", () => {
    expect(checkNumbers("Gagnez 3 h par semaine", allowed)).toMatch(/non sourcé : 3/);
    expect(checkNumbers("Déjà 1 200 entreprises", allowed)).toMatch(/1200/);
  });
  it("lit les décimales et les milliers à la française", () => {
    expect(numbersIn("1,5 jour et 10 000 heures, 30 %")).toEqual([1.5, 10000, 30]);
  });
});

describe("aucun témoignage inventé", () => {
  it.each([
    "« J'ai gagné un temps fou » — Marc, conducteur de travaux",
    "Nos clients disent qu'ils ne reviendraient pas en arrière",
    "Noté 4,8/5 par nos utilisateurs",
    "⭐⭐⭐⭐⭐ Le pointage enfin simple",
    "Découvrez les témoignages de nos clients",
  ])("rejette : %s", (t) => expect(checkTestimonial(t)).not.toBeNull());
  it("laisse passer une promesse ordinaire", () => {
    expect(checkTestimonial("Le pointage de vos équipes, en 2 clics depuis le chantier")).toBeNull();
  });
});

describe("pas d'attribut personnel supposé (politique Meta)", () => {
  it.each(["Vous êtes endetté ?", "Êtes-vous stressé par vos plannings ?", "Tu es au chômage ?", "Vous avez des dettes ?"])("rejette : %s", (t) =>
    expect(checkPersonalAttributes(t)).not.toBeNull(),
  );
  it("laisse passer un métier", () => {
    expect(checkPersonalAttributes("Vous êtes conducteur de travaux ?")).toBeNull();
  });
});

describe("le ton annoncé est le ton écrit", () => {
  it("un texte « vous » ne tutoie pas", () => {
    expect(checkTone("Simplifiez ton pointage", "vous")).toMatch(/Tutoie/);
    expect(checkTone("T'as encore des feuilles de temps ?", "vous")).toMatch(/Tutoie/);
    expect(checkTone("Simplifiez votre pointage, prenez rendez-vous", "vous")).toBeNull();
  });
  it("un texte « tu » ne vouvoie pas — « rendez-vous » n'est pas du vouvoiement", () => {
    expect(checkTone("Simplifie votre pointage", "tu")).toMatch(/Vouvoie/);
    expect(checkTone("Prends rendez-vous pour une démo", "tu")).toBeNull();
  });
});

describe("tous les garde-fous", () => {
  const ctx = { tone: "vous" as const, forbidden: ["révolutionnaire"], allowed: allowedNumbers(["2 h"]) };
  it("donne la première raison", () => {
    expect(guard("titre", "Un outil révolutionnaire", ctx)).toEqual({ ok: false, reason: "Mention interdite : « révolutionnaire »." });
    expect(guard("titre", "Gagnez 2 h chaque semaine", ctx)).toEqual({ ok: true });
  });
});
