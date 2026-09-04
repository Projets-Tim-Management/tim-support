import { describe, expect, it } from "vitest";

import { DEMO_FORM } from "@/modules/forms/lib/form-schema";
import { toPublicForm } from "@/modules/forms/lib/public-schema";
import { MAX_VALUE_LENGTH, honeypotTripped, validateAnswers } from "@/modules/forms/lib/validate";

/**
 * Le contrôle des soumissions est l'endroit où un lead se perd. Deux façons de
 * le perdre, testées séparément : refuser ce qui était valable, et accepter ce
 * qui rendra la fiche inexploitable.
 */

const form = toPublicForm({
  formId: "demo",
  active: true,
  updatedAt: "2026-09-04T07:00:00.000Z",
  successText: "ok",
  errorText: "ko",
  fields: DEMO_FORM.fields,
})!;

/** Une soumission complète et valable, dont chaque test dévie d'un point. */
const valid = () => ({
  company_name: "Capblancq GT",
  collaborateurs: "11-25",
  fonction: "employe",
  pays: "france",
  besoins: ["pointage", "planning"],
  genre: "mme",
  nom: "Poulit",
  email: "contact@capblancq.fr",
  telephone: "+33 6 12 34 56 78",
});

const ok = (over: Record<string, unknown> = {}) => validateAnswers(form, { ...valid(), ...over });

describe("ce qui doit passer", () => {
  it("accepte une soumission complète", () => {
    const r = ok();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answers.company_name).toBe("Capblancq GT");
      expect(r.answers.besoins).toEqual(["pointage", "planning"]);
      expect(r.extras).toEqual([]);
    }
  });

  it("accepte l'absence des deux champs facultatifs", () => {
    const r = ok({ fonction: "", pays: undefined });
    expect(r.ok).toBe(true);
    // Absents plutôt que vides : une chaîne vide en base se relit comme une
    // réponse donnée, ce qu'elle n'est pas.
    if (r.ok) {
      expect(r.answers).not.toHaveProperty("fonction");
      expect(r.answers).not.toHaveProperty("pays");
    }
  });

  it("nettoie les espaces autour des valeurs", () => {
    const r = ok({ nom: "   Poulit   " });
    if (r.ok) expect(r.answers.nom).toBe("Poulit");
  });

  it("tolère un nombre là où un texte est attendu", () => {
    // Un proxy qui sérialise en JSON peut transmettre 42 ; refuser aurait perdu
    // le lead pour une question de type.
    const r = ok({ company_name: 42 });
    if (r.ok) expect(r.answers.company_name).toBe("42");
  });

  it("dédoublonne les choix multiples sans s'en plaindre", () => {
    const r = ok({ besoins: ["pointage", "pointage", "planning"] });
    if (r.ok) expect(r.answers.besoins).toEqual(["pointage", "planning"]);
  });

  it("accepte une valeur unique pour une liste à choix multiples", () => {
    const r = ok({ besoins: "pointage" });
    if (r.ok) expect(r.answers.besoins).toEqual(["pointage"]);
  });
});

describe("ce qui doit être refusé", () => {
  const errorsOf = (over: Record<string, unknown>) => {
    const r = ok(over);
    expect(r.ok).toBe(false);
    return r.ok ? {} : r.errors;
  };

  it("refuse un champ obligatoire manquant, et le désigne", () => {
    expect(Object.keys(errorsOf({ email: "" }))).toEqual(["email"]);
    expect(Object.keys(errorsOf({ company_name: undefined }))).toEqual(["company_name"]);
  });

  it("signale TOUS les champs fautifs d'un coup", () => {
    // Un par un, le visiteur corrige, renvoie, découvre le suivant, et abandonne.
    expect(Object.keys(errorsOf({ email: "", nom: "", genre: "" })).sort()).toEqual([
      "email",
      "genre",
      "nom",
    ]);
  });

  it("refuse une valeur hors des choix proposés", () => {
    expect(errorsOf({ collaborateurs: "1000000" })).toHaveProperty("collaborateurs");
    expect(errorsOf({ besoins: ["pointage", "cuisine"] })).toHaveProperty("besoins");
    expect(errorsOf({ genre: "MME" })).toHaveProperty("genre"); // la casse compte
  });

  it("exige au moins un choix pour une liste multiple obligatoire", () => {
    expect(errorsOf({ besoins: [] })).toHaveProperty("besoins");
    expect(errorsOf({ besoins: undefined })).toHaveProperty("besoins");
  });

  it("refuse une adresse e-mail ou un téléphone mal formés", () => {
    expect(errorsOf({ email: "pas-une-adresse" })).toHaveProperty("email");
    expect(errorsOf({ email: "deux@arobases@example.fr" })).toHaveProperty("email");
    expect(errorsOf({ telephone: "n/a" })).toHaveProperty("telephone");
  });

  it("plafonne la longueur, même si le champ déclare plus que le maximum général", () => {
    expect(errorsOf({ company_name: "x".repeat(201) })).toHaveProperty("company_name");
    const large = toPublicForm({
      formId: "x",
      active: true,
      updatedAt: "",
      successText: "a",
      errorText: "b",
      fields: [{ name: "libre", type: "text", label: "Libre", required: true, maxLength: 10_000_000 }],
    })!;
    const r = validateAnswers(large, { libre: "x".repeat(MAX_VALUE_LENGTH + 1) });
    expect(r.ok).toBe(false);
  });

  it("traite un corps qui n'est pas un objet comme un corps vide", () => {
    for (const body of [null, undefined, "texte", 42, ["a"]]) {
      const r = validateAnswers(form, body);
      expect(r.ok, String(body)).toBe(false);
    }
  });
});

describe("désynchronisation avec le site vitrine", () => {
  it("conserve un champ inconnu au lieu de perdre le lead", () => {
    // Pendant une bascule, le site sert encore l'ancienne définition le temps que
    // son cache expire. Refuser ces soumissions coûterait des leads pour quelques
    // minutes de décalage.
    const r = ok({ ancien_champ: "valeur" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answers.ancien_champ).toBe("valeur");
      expect(r.extras).toEqual(["ancien_champ"]);
    }
  });

  it("ne fait jamais entrer le champ leurre dans les réponses", () => {
    const r = ok({ email_address_check: "" });
    if (r.ok) {
      expect(r.answers).not.toHaveProperty("email_address_check");
      expect(r.extras).toEqual([]);
    }
  });

  it("plafonne le nombre et la taille des champs inconnus", () => {
    const flood: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) flood[`x${i}`] = "y".repeat(MAX_VALUE_LENGTH + 500);
    const r = ok(flood);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extras.length).toBeLessThanOrEqual(20);
      for (const k of r.extras) expect(String(r.answers[k]).length).toBe(MAX_VALUE_LENGTH);
    }
  });
});

describe("leurre anti-spam", () => {
  it("se déclenche dès que le champ porte quelque chose", () => {
    expect(honeypotTripped(form, { email_address_check: "http://spam" })).toBe(true);
    expect(honeypotTripped(form, { email_address_check: "   x" })).toBe(true);
  });

  it("ne se déclenche pas sur un champ vide, absent, ou un corps aberrant", () => {
    expect(honeypotTripped(form, { email_address_check: "" })).toBe(false);
    expect(honeypotTripped(form, { email_address_check: "   " })).toBe(false);
    expect(honeypotTripped(form, valid())).toBe(false);
    expect(honeypotTripped(form, null)).toBe(false);
    expect(honeypotTripped(form, "texte")).toBe(false);
  });
});
