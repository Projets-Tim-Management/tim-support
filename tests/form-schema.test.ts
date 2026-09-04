import { describe, expect, it } from "vitest";

import {
  CHOICE_TYPES,
  DEMO_FORM,
  HONEYPOT_FIELD,
  SEEDED_FORMS,
  channelLabel,
} from "@/modules/forms/lib/form-schema";

/**
 * La définition livrée avec le code est ce que le site vitrine RENDRA. Une erreur
 * ici ne casse rien à la compilation : elle produit un formulaire en ligne avec un
 * champ muet, une liste vide ou une question obligatoire qui ne devait pas l'être.
 * D'où ces contrôles sur le contenu lui-même.
 */

describe("formulaire « demo » — intégrité de la définition", () => {
  it("porte les 9 champs attendus, dans l'ordre d'affichage", () => {
    expect(DEMO_FORM.fields.map((f) => f.name)).toEqual([
      "company_name",
      "collaborateurs",
      "fonction",
      "pays",
      "besoins",
      "genre",
      "nom",
      "email",
      "telephone",
    ]);
  });

  it("ne déclare pas deux fois le même nom de champ", () => {
    const names = DEMO_FORM.fields.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("respecte la décision du 04/09/2026 sur les champs facultatifs", () => {
    const optional = DEMO_FORM.fields.filter((f) => !f.required).map((f) => f.name);
    expect(optional).toEqual(["fonction", "pays"]);
  });

  it("donne un libellé non vide à chaque champ", () => {
    for (const f of DEMO_FORM.fields) expect(f.label.trim()).not.toBe("");
  });
});

describe("listes de choix", () => {
  it("donne au moins deux choix à toute liste, et aucun aux autres champs", () => {
    for (const f of DEMO_FORM.fields) {
      if (CHOICE_TYPES.includes(f.type)) {
        expect(f.options?.length ?? 0, `${f.name} sans choix`).toBeGreaterThanOrEqual(2);
      } else {
        expect(f.options, `${f.name} ne devrait pas avoir de choix`).toBeUndefined();
      }
    }
  });

  it("n'a ni valeur vide, ni valeur en double, ni libellé vide", () => {
    for (const f of DEMO_FORM.fields) {
      const values = (f.options ?? []).map((o) => o.value);
      expect(new Set(values).size, `${f.name} : valeurs en double`).toBe(values.length);
      for (const o of f.options ?? []) {
        expect(o.value.trim(), `${f.name} : valeur vide`).not.toBe("");
        expect(o.label.trim(), `${f.name} : libellé vide`).not.toBe("");
      }
    }
  });

  it("stocke des valeurs parlantes, jamais les codes numériques de Brevo", () => {
    // `COLLABORATEURS=3` voulait dire « 26 - 50 » : une soumission ne se lisait
    // pas sans table de correspondance. C'est précisément ce qu'on ne veut plus.
    for (const f of DEMO_FORM.fields) {
      for (const o of f.options ?? []) {
        expect(/^\d+$/.test(o.value), `${f.name} : « ${o.value} » est un code nu`).toBe(false);
      }
    }
  });

  it("garde les 5 besoins du formulaire d'origine", () => {
    const besoins = DEMO_FORM.fields.find((f) => f.name === "besoins");
    expect(besoins?.options?.map((o) => o.value)).toEqual([
      "planning",
      "pointage",
      "vehicules",
      "chantiers",
      "documents-rh",
    ]);
  });

  it("garde les 7 tranches d'effectif, dans l'ordre croissant", () => {
    const collab = DEMO_FORM.fields.find((f) => f.name === "collaborateurs");
    expect(collab?.options?.map((o) => o.label)).toEqual([
      "1 - 10",
      "11 - 25",
      "26 - 50",
      "51 - 100",
      "101 - 250",
      "250 - 500",
      "+500",
    ]);
  });
});

describe("textes et garde-fous", () => {
  it("ne reproduit pas le message d'échec cassé de Brevo", () => {
    // « Nous n'avons pas pu confirmer votre inscription. Votre message a bien été
    // envoyé. » : le message d'erreur se terminait par la phrase de succès, et un
    // visiteur en échec croyait avoir réussi.
    expect(DEMO_FORM.errorText).not.toContain(DEMO_FORM.successText);
    expect(DEMO_FORM.successText.trim()).not.toBe("");
    expect(DEMO_FORM.errorText.trim()).not.toBe("");
  });

  it("n'utilise pas le nom du champ leurre comme vrai champ", () => {
    // Une collision rendrait le honeypot toujours rempli : plus aucune soumission
    // ne serait enregistrée, et la réponse resterait « succès ». Panne muette.
    for (const form of SEEDED_FORMS) {
      expect(form.fields.some((f) => f.name === HONEYPOT_FIELD)).toBe(false);
    }
  });

  it("déclare un identifiant et un canal par défaut pour chaque formulaire semé", () => {
    for (const form of SEEDED_FORMS) {
      expect(form.formId.trim()).not.toBe("");
      expect(channelLabel(form.defaultChannel)).toBeDefined();
    }
  });

  it("ne sème pas deux formulaires sous le même identifiant", () => {
    const ids = SEEDED_FORMS.map((f) => f.formId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
