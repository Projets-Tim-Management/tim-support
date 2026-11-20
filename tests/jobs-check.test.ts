/**
 * Contrôle des fiches métier avant publication sans relecture (décisions du 18/11/2026).
 * Python ne contrôlait rien : chaque règle est testée ici, sur la fiche publiée du magasinier
 * (tests/jobs-fixtures.ts) dont on altère un champ à la fois.
 */
import { describe, expect, it } from "vitest";

import { allowedNumbers, checkJobSheet, jobSheetTexts, unexpectedNumbers } from "@/modules/editorial/lib/jobs/check";
import type { JobSheetContent } from "@/modules/editorial/lib/jobs/prompt";

import { MAGASINIER_FIGURES, validSheet } from "./jobs-fixtures";

type Sheet = ReturnType<typeof validSheet>;

function run(edit: (s: Sheet) => void, figures = MAGASINIER_FIGURES) {
  const s = validSheet();
  edit(s);
  return checkJobSheet(s as JobSheetContent, figures);
}

const errorsOf = (edit: (s: Sheet) => void) => run(edit).errors;

describe("fiche valide", () => {
  it("la fiche publiée (FAQ et certifications réécrites) passe sans erreur ni avertissement", () => {
    expect(checkJobSheet(validSheet(), MAGASINIER_FIGURES)).toEqual({ errors: [], warnings: [] });
  });

  it("jobSheetTexts couvre tous les champs rédigés", () => {
    const where = jobSheetTexts(validSheet()).map((f) => f.where);
    expect(where).toContain("definition");
    expect(where).toContain("certification 4 durée");
    expect(where).toContain("quiz question 5 option 4");
    expect(where).toContain("quiz palier 3 texte");
    expect(where).toContain("FAQ 5 réponse");
    expect(where).toContain("yoast_description");
  });
});

describe("(a) chiffres", () => {
  it("chiffres France Travail permis, quelle que soit l'écriture (« 2 189 », « 2189 », espace fine)", () => {
    const allowed = allowedNumbers(MAGASINIER_FIGURES);
    expect([...allowed].sort()).toEqual(["1900", "2141", "2189", "2254", "2290", "640", "80"]);
    expect(unexpectedNumbers("Salaire de 2 189 €, 2189 € ou 2 189 €, 80 % des offres", allowed)).toEqual([]);
  });

  it("nombre inventé, arrondi ou année : erreur", () => {
    expect(errorsOf((s) => (s.points_cles[0] = "Salaire médian d'environ 2 200 € brut"))).toEqual([expect.stringMatching(/^\[point clé 1\] Chiffre absent des données France Travail : 2200/)]);
    expect(errorsOf((s) => (s.contextes_items[0].description = "Depuis 2024, le métier évolue avec le numérique et la gestion des stocks."))).toHaveLength(1);
    expect(errorsOf((s) => (s.salaires_texte = "Le salaire progresse de 5 % après quelques années."))).toHaveLength(1);
  });

  it("« 3 ans d'expérience » ou « CAP en 2 ans » hors du champ durée : erreur", () => {
    expect(errorsOf((s) => (s.competences_texte = "Le poste demande souvent 3 ans d'expérience en logistique ou en négoce."))).toEqual([expect.stringContaining("[competences_texte] Chiffre absent des données France Travail : 3")]);
    expect(errorsOf((s) => (s.certifications_texte = "Le CAP se prépare en 2 ans, en lycée professionnel ou en apprentissage."))).toHaveLength(1);
  });

  it("durées des certifications : liste blanche (jours, semaines, mois, ans, heures)", () => {
    expect(errorsOf((s) => (s.certifications_items[0].duree = "18 mois"))).toEqual([]);
    expect(errorsOf((s) => (s.certifications_items[0].duree = "35 heures"))).toEqual([]);
    expect(errorsOf((s) => (s.certifications_items[0].duree = "1 an"))).toEqual([]);
    expect(errorsOf((s) => (s.certifications_items[0].duree = "2 à 3 semaines"))).toEqual([]);
    expect(errorsOf((s) => (s.certifications_items[0].duree = "7 ans"))).toHaveLength(1);
    expect(errorsOf((s) => (s.certifications_items[0].duree = "3 à 40 jours"))).toHaveLength(1);
    expect(errorsOf((s) => (s.certifications_items[0].duree = "2 sessions"))).toHaveLength(1);
  });

  it("niveaux de diplôme (Niveau 2 à 8, Bac+2 à Bac+8) partout ; hors bornes : erreur", () => {
    expect(errorsOf((s) => (s.certifications_texte = "Les diplômes vont du niveau 3 au Bac+2, voire Bac + 3 en licence professionnelle."))).toEqual([]);
    expect(errorsOf((s) => (s.certifications_items[0].niveau = "Niveau 9"))).toHaveLength(1);
    expect(errorsOf((s) => (s.certifications_items[0].niveau = "Niveau 1"))).toHaveLength(1);
  });

  it("références collées à des lettres (CACES R489, B1V, 1re) et libellés « 12 mois » / « 35 ans » permis", () => {
    expect(errorsOf((s) => (s.competences_texte = "Habilitation électrique B1V et CACES R489 dès la 1re année, offres des 12 derniers mois, moins de 35 ans."))).toEqual([]);
  });

  it("chiffres non fournis : même un chiffre réel est refusé", () => {
    const { errors } = run(() => undefined, { ...MAGASINIER_FIGURES, offres_12m: undefined } as unknown as typeof MAGASINIER_FIGURES);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.includes(": 640"))).toBe(true);
  });
});

describe("(b) capsules : définition et réponses de FAQ", () => {
  it("40 à 60 mots", () => {
    expect(errorsOf((s) => (s.definition = "Le magasinier gère les stocks de matériaux."))).toEqual([expect.stringMatching(/^\[definition\] Capsule : 7 mots \(attendu 40-60\)$/)]);
    expect(errorsOf((s) => (s.faq_items[2].reponse = `${s.faq_items[2].reponse} ${s.faq_items[2].reponse}`))).toEqual([expect.stringMatching(/^\[FAQ 3 réponse\] Capsule : \d+ mots/)]);
  });

  it("reprise pronominale en tête", () => {
    expect(errorsOf((s) => (s.faq_items[0].reponse = s.faq_items[0].reponse.replace(/^Le CAP Opérateur logistique/, "Il"))).some((e) => e.includes("reprise pronominale"))).toBe(true);
  });

  it("lien : refusé (lien HTML dans la capsule, URL dans tout champ)", () => {
    const errors = errorsOf((s) => (s.faq_items[2].reponse = s.faq_items[2].reponse.replace("France", '<a href="https://x.fr">France</a>')));
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining("contient un lien"), expect.stringContaining("HTML interdit")]));
    expect(errorsOf((s) => (s.contextes_texte = "Plus d'informations sur www.exemple.fr pour ce métier."))).toEqual([expect.stringContaining("[contextes_texte] Lien interdit")]);
  });
});

describe("(c) marque et ton", () => {
  it("« Tim Management » ou « Tim » seul : erreur ; « TIM Management » une fois : permis", () => {
    expect(errorsOf((s) => (s.contextes_texte = "Des outils comme TIM Management aident à organiser le travail en agence."))).toEqual([]);
    expect(errorsOf((s) => (s.contextes_texte = "Des outils comme Tim Management aident à organiser le travail en agence."))).toEqual([expect.stringContaining("[contextes_texte] Marque mal écrite : « Tim Management »")]);
    expect(errorsOf((s) => (s.contextes_texte = "Des outils comme Tim aident à organiser le travail en agence."))).toEqual([expect.stringContaining("« Tim »")]);
  });

  it("marque citée plus d'une fois : erreur", () => {
    expect(
      errorsOf((s) => {
        s.contextes_texte = "TIM Management aide à organiser le travail en agence.";
        s.competences_texte = "TIM Management suit les compétences de chacun.";
      }),
    ).toEqual(["Marque citée 2 fois (une fois au plus)"]);
  });

  it("hors ligne, note ou étoiles, trace d'IA : erreur", () => {
    expect(errorsOf((s) => (s.contextes_texte = "L'application de stock fonctionne hors ligne dans l'entrepôt."))).toEqual([expect.stringContaining("hors connexion interdit")]);
    expect(errorsOf((s) => (s.contextes_texte = "Les clients donnent 5 étoiles aux meilleures agences."))).toEqual(
      expect.arrayContaining([expect.stringContaining("Note ou nombre d'avis interdit")]),
    );
    expect(errorsOf((s) => (s.contextes_texte = "En tant qu'IA, je ne peux pas détailler les contextes."))).toEqual([expect.stringContaining("Trace de génération IA")]);
  });

  it("HTML : erreur dans n'importe quel champ", () => {
    expect(errorsOf((s) => (s.synonymes[0] = "<strong>Magasinier</strong>"))).toEqual([expect.stringContaining("[synonyme 1] HTML interdit")]);
  });
});

describe("(d) structure", () => {
  it("synonymes 2-5, points clés 4-5, certifications 4-6, contextes 4-6, FAQ 5-6", () => {
    expect(errorsOf((s) => s.synonymes.splice(1))).toEqual(["Synonymes : 1 (attendu 2 à 5)"]);
    expect(errorsOf((s) => s.points_cles.splice(3))).toEqual(["Points clés : 3 (attendu 4 à 5)"]);
    expect(errorsOf((s) => s.points_cles.push("Métier de la filière BTP"))).toEqual(["Points clés : 6 (attendu 4 à 5)"]);
    expect(errorsOf((s) => s.certifications_items.splice(3))).toEqual(["Certifications : 3 (attendu 4 à 6)"]);
    expect(errorsOf((s) => s.contextes_items.splice(3))).toEqual(["Contextes : 3 (attendu 4 à 6)"]);
    expect(errorsOf((s) => s.faq_items.splice(4))).toEqual(["FAQ : 4 (attendu 5 à 6)"]);
    expect(errorsOf((s) => s.faq_items.push(...s.faq_items.slice(0, 2)))).toEqual(["FAQ : 7 (attendu 5 à 6)"]);
    expect(errorsOf((s) => delete (s as Partial<Sheet>).synonymes)).toEqual(["Synonymes : liste absente"]);
  });

  it("champs vides", () => {
    expect(errorsOf((s) => (s.salaires_texte = " "))).toEqual(["salaires_texte vide"]);
    expect(errorsOf((s) => (s.certifications_items[1].duree = ""))).toEqual(["Certification 2 : duree vide"]);
    expect(errorsOf((s) => (s.faq_items[0].question = ""))).toEqual(["FAQ 1 : question vide"]);
    expect(errorsOf((s) => (s.competences_groupes[0].items = []))).toEqual(["Compétences 1 : aucun item"]);
  });

  it("quiz : 5 questions × 4 options notées 3/2/1/0, 3 paliers décroissants jusqu'à 0", () => {
    expect(errorsOf((s) => s.orientation_questions.pop())).toEqual(["Quiz : 4 questions (attendu 5)"]);
    expect(errorsOf((s) => s.orientation_questions[0].options.pop())).toEqual(["Quiz question 1 : 3 options (attendu 4)"]);
    expect(errorsOf((s) => s.orientation_questions[1].options.reverse())).toEqual(["Quiz question 2 : points 0/1/2/3 (attendu 3/2/1/0)"]);
    expect(errorsOf((s) => (s.orientation_questions[2].options[0].points = 4))).toEqual(["Quiz question 3 : points 4/2/1/0 (attendu 3/2/1/0)"]);
    expect(errorsOf((s) => s.orientation_resultats.pop())).toEqual(["Quiz : 2 paliers (attendu 3)"]);
    expect(errorsOf((s) => (s.orientation_resultats[2].min = 2))).toEqual([expect.stringContaining("seuils des paliers 12/7/2")]);
    expect(errorsOf((s) => (s.orientation_resultats[0].min = 16))).toEqual([expect.stringContaining("seuils des paliers 16/7/0")]);
    expect(errorsOf((s) => (s.orientation_resultats[1].min = 12))).toEqual([expect.stringContaining("seuils des paliers 12/12/0")]);
  });

  it("yoast : titre > 60 et description > 155 caractères = avertissements seulement", () => {
    const r = run((s) => {
      s.yoast_title = "Magasinier en négoce des matériaux de construction : métier et formation";
      s.yoast_description = `${s.yoast_description} ${s.yoast_description}`;
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([expect.stringMatching(/^yoast_title : 72 caractères/), expect.stringMatching(/^yoast_description : \d+ caractères \(> 155/)]);
  });
});
