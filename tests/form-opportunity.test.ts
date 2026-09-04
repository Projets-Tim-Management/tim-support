import { describe, expect, it } from "vitest";

import { DEMO_FORM } from "@/modules/forms/lib/form-schema";
import { parseAttribution } from "@/modules/forms/lib/ingest";
import { toPublicForm } from "@/modules/forms/lib/public-schema";
import { buildOpportunity, normalizePhone, splitName } from "@/modules/forms/lib/to-opportunity";

/**
 * Ce que le commercial verra sur la fiche. Une erreur ici ne casse rien : elle
 * produit une opportunité qu'on ne sait pas rappeler, ou rangée au mauvais canal.
 */

const form = toPublicForm({
  formId: "demo",
  active: true,
  updatedAt: "",
  successText: "ok",
  errorText: "ko",
  fields: DEMO_FORM.fields,
})!;

const answers = (over: Record<string, unknown> = {}) => ({
  company_name: "Capblancq GT",
  collaborateurs: "11-25",
  fonction: "employe",
  pays: "france",
  besoins: ["pointage", "planning"],
  genre: "mme",
  nom: "Marie Poulit",
  email: "Contact@Capblancq.fr",
  telephone: "0612345678",
  ...over,
}) as Record<string, string | string[]>;

const build = (over: Record<string, unknown> = {}, attribution = {}, channel: "seo" | "sea" = "sea") =>
  buildOpportunity({
    form,
    answers: answers(over),
    attribution: parseAttribution(attribution),
    channel,
    receivedAt: new Date("2026-09-04T08:00:00Z"),
  });

describe("découpage du nom", () => {
  it("fait du dernier mot le nom de famille", () => {
    expect(splitName("Marie Poulit")).toEqual({ firstName: "Marie", lastName: "Poulit" });
    expect(splitName("Jean Pierre Dupont")).toEqual({ firstName: "Jean Pierre", lastName: "Dupont" });
    expect(splitName("Poulit")).toEqual({ firstName: "Poulit" });
    expect(splitName("  ")).toEqual({});
  });
});

describe("normalisation du téléphone", () => {
  it("met un numéro français au format lisible", () => {
    expect(normalizePhone("0612345678")).toBe("+33 6 12 34 56 78");
    expect(normalizePhone("+33612345678")).toBe("+33 6 12 34 56 78");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78");
  });

  it("laisse tel quel ce qu'il ne sait pas lire, plutôt que de l'inventer", () => {
    expect(normalizePhone("+32 470 12 34 56")).toBe("+32 470 12 34 56");
    expect(normalizePhone("")).toBeUndefined();
    expect(normalizePhone("12")).toBeUndefined();
  });
});

describe("champs de la fiche", () => {
  it("reprend la société, l'e-mail en minuscules et le téléphone normalisé", () => {
    const o = build();
    expect(o.companyName).toBe("Capblancq GT");
    expect(o.email).toBe("contact@capblancq.fr");
    expect(o.phone).toBe("+33 6 12 34 56 78");
  });

  it("traduit le canal en provenance", () => {
    expect(build({}, {}, "sea").source).toBe("google-ads-sea");
    expect(build({}, {}, "seo").source).toBe("site-vitrine-seo");
  });

  it("stocke l'effectif avec son LIBELLÉ, pas la valeur technique", () => {
    // « 11 - 25 » se lit sur une fiche ; « 11-25 » est un identifiant.
    expect(build().collaborateurs).toBe("11 - 25");
  });

  it("déduit un nom d'entreprise quand le champ n'est plus rempli", () => {
    // Le champ est obligatoire aujourd'hui, mais peut cesser de l'être en
    // back-office : sans repli, la fiche serait créée sans titre.
    expect(build({ company_name: "" }).companyName).toBe("Capblancq");
    // Une adresse grand public ne dit rien de l'entreprise : on préfère le nom.
    expect(build({ company_name: "", email: "marie@gmail.com" }).companyName).toBe("Marie Poulit");
  });
});

describe("contact à rappeler", () => {
  it("porte le nom, les coordonnées et la fonction déclarée", () => {
    const c = build().contact;
    expect(c).toMatchObject({
      firstName: "Marie",
      lastName: "Poulit",
      email: "contact@capblancq.fr",
      phone: "+33 6 12 34 56 78",
      role: "Employé",
    });
  });

  it("se rabat sur un rôle explicite quand la fonction est absente", () => {
    expect(build({ fonction: "" }).contact.role).toBe("Contact du site vitrine");
  });
});

describe("demande du lead", () => {
  it("écrit les besoins avec leurs libellés", () => {
    expect(build().leadNotes).toContain("Besoins exprimés : Pointage, Planning.");
  });

  it("porte la civilité et la fonction, qui n'ont pas de champ dédié", () => {
    expect(build().leadNotes).toContain("Contact : Mme Marie Poulit · Employé · +33 6 12 34 56 78.");
  });

  it("dit d'où vient le lead, page et campagne comprises", () => {
    const notes = build({}, {
      source_page_path: "/produits/pointage",
      utm_campaign: "23456789",
      lp_variant: "v2",
    }).leadNotes;
    expect(notes).toContain("Google Ads — SEA");
    expect(notes).toContain("page /produits/pointage");
    expect(notes).toContain("variante v2");
    expect(notes).toContain("campagne 23456789");
  });

  it("reste lisible quand les champs facultatifs manquent", () => {
    const notes = build({ fonction: "", pays: "" }).leadNotes;
    expect(notes).toContain("Contact : Mme Marie Poulit · +33 6 12 34 56 78.");
    expect(notes).not.toContain("Pays :");
    expect(notes).not.toContain("· ·");
  });

  it("date la demande en heure de Paris", () => {
    expect(build().leadNotes).toContain("reçu le 04/09/2026");
  });
});

describe("soumission incomplète", () => {
  it("ne fabrique pas d'e-mail quand il n'y en a pas", () => {
    // Sans e-mail, la fiche entrera en brouillon : c'est voulu, pas un défaut.
    const o = build({ email: "" });
    expect(o.email).toBeUndefined();
    expect(o.contact.email).toBeUndefined();
  });
});
