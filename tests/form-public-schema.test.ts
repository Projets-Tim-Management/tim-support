import { afterEach, describe, expect, it, vi } from "vitest";

import { DEMO_FORM, HONEYPOT_FIELD } from "@/modules/forms/lib/form-schema";
import { isAllowedOrigin } from "@/modules/forms/lib/cors";
import { toPublicForm, type FormDoc } from "@/modules/forms/lib/public-schema";

/**
 * Ce que ce sérialiseur renvoie part sur un site public ET sert de référence à
 * la validation des soumissions. Deux risques distincts, testés séparément :
 * exposer ce qui doit rester interne, et servir un formulaire que personne ne
 * peut remplir correctement.
 */

/** Un document `forms` tel que Payload le rend : nulls compris. */
const doc = (over: Partial<FormDoc> = {}): FormDoc => ({
  formId: "demo",
  active: true,
  updatedAt: "2026-09-04T07:00:00.000Z",
  successText: "Votre message a bien été envoyé.",
  errorText: "Votre demande n'a pas pu être envoyée.",
  legalNotice: null,
  fields: [
    {
      name: "nom",
      type: "text",
      label: "Quel est votre nom ?",
      required: true,
      placeholder: "Eiffel",
      maxLength: 200,
      helpText: null,
      countryCode: null,
      options: null,
    },
  ],
  ...over,
});

describe("schéma public — ce qui sort", () => {
  it("expose l'identifiant, les textes et une version qui bouge à chaque enregistrement", () => {
    const form = toPublicForm(doc());
    expect(form?.formId).toBe("demo");
    expect(form?.version).toBe("2026-09-04T07:00:00.000Z");
    expect(form?.honeypot).toBe(HONEYPOT_FIELD);
  });

  it("n'expose aucun champ interne", () => {
    const form = toPublicForm(
      doc({ ...(({ seedVersion: 3, id: 12 } as unknown) as Partial<FormDoc>) }),
    );
    const keys = Object.keys(form ?? {});
    for (const forbidden of ["id", "seedVersion", "active", "createdAt", "updatedAt"]) {
      expect(keys, `« ${forbidden} » ne doit pas sortir`).not.toContain(forbidden);
    }
  });

  it("efface les valeurs nulles au lieu de les transmettre", () => {
    const form = toPublicForm(doc());
    // Payload rend `null` pour tout champ non rempli ; la vitrine ne doit pas
    // avoir à distinguer null d'absent pour chaque propriété facultative.
    expect(form).not.toHaveProperty("legalNotice");
    expect(form?.fields[0]).not.toHaveProperty("helpText");
    expect(form?.fields[0]).not.toHaveProperty("countryCode");
    expect(form?.fields[0]).not.toHaveProperty("options");
    expect(JSON.stringify(form)).not.toContain("null");
  });

  it("expose la mention légale dès qu'elle est renseignée", () => {
    const form = toPublicForm(doc({ legalNotice: "  Vos données…  " }));
    expect(form?.legalNotice).toBe("Vos données…");
  });
});

describe("schéma public — ce qui est refusé", () => {
  it("ne sert pas un formulaire désactivé", () => {
    expect(toPublicForm(doc({ active: false }))).toBeNull();
  });

  it("ne sert pas un formulaire sans champ rendable", () => {
    // Une coquille vide s'afficherait comme un bouton d'envoi solitaire : mieux
    // vaut un 404, que la vitrine sait signaler.
    expect(toPublicForm(doc({ fields: [] }))).toBeNull();
    expect(toPublicForm(doc({ fields: [{ name: "x", type: "text", label: "  " }] }))).toBeNull();
    expect(toPublicForm(null)).toBeNull();
  });

  it("écarte un champ incomplet sans perdre les autres", () => {
    const form = toPublicForm(
      doc({
        fields: [
          { name: "", type: "text", label: "Sans nom", required: true },
          { name: "email", type: "email", label: "Votre e-mail", required: true },
        ],
      }),
    );
    expect(form?.fields.map((f) => f.name)).toEqual(["email"]);
  });

  it("refuse un champ qui porterait le nom du leurre anti-spam", () => {
    // Une collision rendrait le honeypot toujours « rempli » : plus aucune
    // soumission enregistrée, et la réponse resterait « succès ». Panne muette.
    const form = toPublicForm(
      doc({
        fields: [
          { name: HONEYPOT_FIELD, type: "text", label: "Piège", required: true },
          { name: "nom", type: "text", label: "Nom", required: true },
        ],
      }),
    );
    expect(form?.fields.map((f) => f.name)).toEqual(["nom"]);
  });
});

describe("schéma public — cohérence des champs", () => {
  it("rend le caractère obligatoire toujours booléen", () => {
    const form = toPublicForm(
      doc({
        fields: [
          { name: "a", type: "text", label: "A", required: null },
          { name: "b", type: "text", label: "B", required: true },
        ],
      }),
    );
    expect(form?.fields.map((f) => f.required)).toEqual([false, true]);
  });

  it("n'attache des choix qu'aux listes, et jamais un exemple à une liste", () => {
    const form = toPublicForm(
      doc({
        fields: [
          {
            name: "genre",
            type: "select",
            label: "Civilité",
            required: true,
            placeholder: "n'a nulle part où s'afficher",
            options: [
              { value: "mr", label: "Mr" },
              { value: "mme", label: "Mme" },
            ],
          },
          {
            name: "libre",
            type: "text",
            label: "Libre",
            required: false,
            options: [{ value: "parasite", label: "Parasite" }],
          },
        ],
      }),
    );
    const [liste, texte] = form!.fields;
    expect(liste.options?.length).toBe(2);
    expect(liste).not.toHaveProperty("placeholder");
    expect(texte).not.toHaveProperty("options");
  });

  it("écarte les choix inutilisables", () => {
    const form = toPublicForm(
      doc({
        fields: [
          {
            name: "l",
            type: "select",
            label: "L",
            required: true,
            options: [
              { value: "ok", label: "OK" },
              { value: "", label: "Sans valeur" },
              { value: "sans-libelle", label: "  " },
            ],
          },
        ],
      }),
    );
    expect(form?.fields[0].options).toEqual([{ value: "ok", label: "OK" }]);
  });

  it("garde le sélecteur d'indicatif du téléphone, et de lui seul", () => {
    const form = toPublicForm(
      doc({
        fields: [
          { name: "tel", type: "tel", label: "Téléphone", required: true, countryCode: true },
          { name: "txt", type: "text", label: "Texte", required: true, countryCode: true },
        ],
      }),
    );
    expect(form?.fields[0].countryCode).toBe(true);
    expect(form?.fields[1]).not.toHaveProperty("countryCode");
  });

  it("restitue à l'identique la définition livrée avec le code", () => {
    // Garde-fou d'ensemble : ce que la vitrine recevra pour « demo » doit être
    // exactement ce que décrit form-schema.ts.
    const form = toPublicForm(doc({ fields: DEMO_FORM.fields, legalNotice: DEMO_FORM.legalNotice }));
    expect(form?.fields.map((f) => f.name)).toEqual(DEMO_FORM.fields.map((f) => f.name));
    expect(form?.fields.filter((f) => !f.required).map((f) => f.name)).toEqual(["fonction", "pays"]);
    expect(form?.fields.find((f) => f.name === "besoins")?.options?.length).toBe(5);
  });
});

describe("origines autorisées", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepte la production et les previews de la vitrine", () => {
    expect(isAllowedOrigin("https://tim-management.co")).toBe(true);
    expect(isAllowedOrigin("https://www.tim-management.co")).toBe(true);
    expect(isAllowedOrigin("https://tim-front.vercel.app")).toBe(true);
    expect(isAllowedOrigin("https://tim-front-git-ma-branche-equipe.vercel.app")).toBe(true);
  });

  it("refuse ce qui ressemble sans en être", () => {
    expect(isAllowedOrigin("https://tim-management.co.attaquant.fr")).toBe(false);
    expect(isAllowedOrigin("http://tim-management.co")).toBe(false);
    expect(isAllowedOrigin("https://tim-front-x.vercel.app.attaquant.fr")).toBe(false);
    expect(isAllowedOrigin("https://autre-projet.vercel.app")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin("")).toBe(false);
  });

  it("n'autorise le poste de dev qu'en dehors de la production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isAllowedOrigin("http://localhost:3000")).toBe(false);
  });

  it("accepte une origine ajoutée par variable d'environnement", () => {
    expect(isAllowedOrigin("https://campagne.example")).toBe(false);
    vi.stubEnv("FORMS_ALLOWED_ORIGINS", "https://campagne.example, https://autre.example");
    expect(isAllowedOrigin("https://campagne.example")).toBe(true);
    expect(isAllowedOrigin("https://autre.example")).toBe(true);
  });
});
