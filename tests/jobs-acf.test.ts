/**
 * Prompt, lecture de la réponse et assemblage ACF des fiches métier (portage de
 * metiers_generator.py et main_metiers.py). Référence : la fiche « magasinier-negoce-materiaux-
 * construction » relue dans WordPress le 18/11/2026 (tests/jobs-fixtures.ts).
 * Aucun test Python n'existait pour ces modules.
 */
import { describe, expect, it } from "vitest";

import {
  buildJobAcf,
  buildJobPayload,
  buildJobSeoMeta,
  fmtEur,
  fmtInt,
  figuresFromAcf,
  jobSlug,
  parseIntLoose,
  refreshFiguresAcf,
  valList,
} from "@/modules/editorial/lib/jobs/acf";
import { JOB_SHEET_MAX_TOKENS, JOB_SHEET_SYSTEM_PROMPT, buildJobSheetPrompt, factsBlock, parseJobSheetResponse } from "@/modules/editorial/lib/jobs/prompt";

import { MAGASINIER_FIGURES, MAGASINIER_META, WP_COUVREUR_CERTIFICATIONS, WP_COUVREUR_FAQ, WP_MAGASINIER, WP_TITLES_SLUGS, validSheet } from "./jobs-fixtures";

/** WordPress rend les nombres ACF en chaînes : on compare sous cette forme. */
function asWp(x: unknown): unknown {
  if (typeof x === "number") return String(x);
  if (Array.isArray(x)) return x.map(asWp);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, asWp(v)]));
  return x;
}

const without = (o: Record<string, unknown>, ...keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

describe("prompt", () => {
  it("system : mot pour mot de Python", () => {
    expect(JOB_SHEET_SYSTEM_PROMPT).toBe(
      "Tu es un expert de l'orientation et des métiers du BTP, rédacteur web E-E-A-T. Tu connais les diplômes, certifications, compétences et conditions de travail RÉELS de la filière. Tu réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte avant ou après.",
    );
    expect(JOB_SHEET_MAX_TOKENS).toBe(16000);
  });

  it("factsBlock : libellés de Python, valeurs vides ignorées, part de la fourchette non donnée", () => {
    expect(factsBlock(MAGASINIER_FIGURES)).toBe(
      [
        "- Salaire médian (tous âges, €/mois) : 2189",
        "- Salaire médian <35 ans : 2141",
        "- Salaire médian 35 ans+ : 2254",
        "- Fourchette offres min : 1900",
        "- Fourchette offres max : 2290",
        "- Offres sur 12 mois : 640",
        "- Demandeurs d'emploi inscrits : 80",
        "- Tension de recrutement : Modérée",
      ].join("\n"),
    );
    expect(factsBlock({ salaire_median: null, tension: "" })).toBe("- (aucun chiffre fourni)");
  });

  it("user : métier, ROME, catégorie par défaut, marque « TIM Management », contrat JSON", () => {
    const { system, user } = buildJobSheetPrompt({ metier: "Couvreur / Couvreuse", rome: "F1610", figures: { offres_12m: 22970 } });
    expect(system).toBe(JOB_SHEET_SYSTEM_PROMPT);
    expect(user).toContain('MÉTIER : "Couvreur / Couvreuse"\nCODE ROME : F1610\nCATÉGORIE (indicative) : à déterminer (filière BTP)');
    expect(user).toContain("CHIFFRES CONNUS (à RÉUTILISER dans les textes/points clés, NE PAS en inventer d'autres) :\n- Offres sur 12 mois : 22970\n");
    expect(user).toContain('Mentionne "TIM Management" UNE fois max, sans forcer.');
    expect(user).not.toMatch(/Tim Management/);
    expect(user).toContain('{"question": "Quel diplôme pour devenir Couvreur / Couvreuse ?"');
    expect(user).toContain("IMPORTANT : 5 questions d'orientation, 4 à 6 certifications, 4 à 6 contextes, 5 à 6 questions de FAQ.");
    expect(user).toContain("« Niveau 2 » à « Niveau 8 »"); // liste blanche ajoutée (décision du 18/11/2026)
    expect(user).not.toMatch(/\{\{|\}\}/); // accolades doublées de la f-string Python retirées
    expect(buildJobSheetPrompt({ metier: "X", rome: "F1", categorie: "Gros œuvre", figures: {} }).user).toContain("CATÉGORIE (indicative) : Gros œuvre");
  });

  it("parseJobSheetResponse : JSON nu, bloc ```json, texte parasite ; lève sinon", () => {
    const obj = { definition: "x" };
    expect(parseJobSheetResponse(JSON.stringify(obj))).toEqual(obj);
    expect(parseJobSheetResponse("```json\n" + JSON.stringify(obj) + "\n```")).toEqual(obj);
    expect(parseJobSheetResponse("```\n" + JSON.stringify(obj) + "\n```")).toEqual(obj);
    expect(parseJobSheetResponse("Voici la fiche : " + JSON.stringify(obj) + " Bonne lecture.")).toEqual(obj);
    expect(() => parseJobSheetResponse("pas de JSON")).toThrow();
    expect(() => parseJobSheetResponse("[1, 2]")).toThrow();
  });
});

describe("assemblage ACF (build_acf)", () => {
  it("formats : espace fine insécable, comme les fiches publiées (« 2 189 € »)", () => {
    expect(fmtInt(2189)).toBe("2 189");
    expect(fmtInt(1234567)).toBe("1 234 567");
    expect(fmtInt(80)).toBe("80");
    expect(fmtInt(2189.5)).toBeNull();
    expect(fmtInt("2189")).toBeNull();
    expect(fmtEur(2189)).toBe(WP_MAGASINIER.acf.informations_cles.items[0].value);
    expect(valList(["a", "", "b", null])).toEqual([{ valeur: "a" }, { valeur: "b" }]);
    expect(valList(undefined)).toEqual([]);
  });

  it("reproduit la fiche publiée (hors certifications et FAQ, voir le test suivant)", () => {
    const acf = buildJobAcf(validSheet(), MAGASINIER_FIGURES, MAGASINIER_META);
    expect(asWp(without(acf, "certifications", "faq"))).toEqual(without(WP_MAGASINIER.acf, "certifications", "faq"));
    expect(Object.keys(acf)).toEqual(Object.keys(WP_MAGASINIER.acf));
  });

  it("certifications et FAQ : forme lue par le front (fiches publiées jusqu'au 01/10/2026)", () => {
    const acf = buildJobAcf(validSheet(), MAGASINIER_FIGURES, MAGASINIER_META);
    expect(Object.keys(acf.certifications)).toEqual(Object.keys(WP_COUVREUR_CERTIFICATIONS));
    expect(Object.keys(acf.certifications.items[0])).toEqual(Object.keys(WP_COUVREUR_CERTIFICATIONS.items[0]));
    expect(acf.certifications.titre).toBe(WP_COUVREUR_CERTIFICATIONS.titre);
    expect(Object.keys(acf.faq)).toEqual(Object.keys(WP_COUVREUR_FAQ));
    expect(Object.keys(acf.faq.items[0])).toEqual(Object.keys(WP_COUVREUR_FAQ.items[0]));
    expect(acf.faq.titre).toBe(WP_COUVREUR_FAQ.titre);
    // forme actuelle des fiches récentes dans WordPress : groupe ACF modifié, contenu perdu
    expect(WP_MAGASINIER.acf.certifications).toEqual({ valeur: "", source: "" });
    expect(WP_MAGASINIER.acf.faq).toEqual([{ q: "", r: "" }]);
  });

  it("chiffres absents : blocs omis comme Python ; date des données prioritaire sur la date du jour", () => {
    const acf = buildJobAcf({}, { salaire_median: 2000, fourchette_min: 1800, date_donnees: "2026-10-16" }, { metier: "Maçon", rome: "F1703", today: "2026-11-18" });
    expect(acf.informations_cles).toEqual({ titre: "Maçon", categorie: "", description: "", items: [{ label: "Salaire médian", value: "2 000 €", unit: "brut / mois" }] });
    expect(acf.statistiques.items).toEqual([]);
    expect(acf.statistiques.source).toEqual({ label: "France Travail — dataemploi (12 derniers mois)", url: "https://dataemploi.francetravail.fr/emploi/metier/chiffres-cles/NAT/FR/F1703", date: "2026-10-16" });
    expect(acf.salaires.fourchette_offres).toEqual({}); // max absent
    expect(acf.salaires.medians).toEqual([{ label: "Tous âges", valeur: 2000 }]);
    expect(acf.derniere_mise_a_jour).toBe("2026-11-18");
    expect(acf.orientation.intro).toBe("Cinq questions rapides pour estimer la compatibilité.");
    expect(acf.orientation.cta).toEqual({ texte: "Vous encadrez déjà des équipes ?", label: "Découvrir TIM", url: "/contact-visio" });
    expect(buildJobAcf({}, { fourchette_min: 1, fourchette_max: 2 }, { metier: "M", rome: "R", today: "t" }).salaires.fourchette_offres).toEqual({ min: 1, max: 2, part: 80 });
  });

  it("catégorie : celle du Sheet prime, sinon celle du modèle ; titre : défaut seulement si la clé manque", () => {
    const meta = { metier: "Maçon", rome: "F1703", today: "2026-11-18" };
    expect(buildJobAcf({ categorie: "Gros œuvre" }, {}, meta).informations_cles.categorie).toBe("Gros œuvre");
    expect(buildJobAcf({ categorie: "Gros œuvre" }, {}, { ...meta, categorie: "BTP" }).informations_cles.categorie).toBe("BTP");
    expect(buildJobAcf({ titre_complet: "" }, {}, meta).informations_cles.titre).toBe("");
  });

  it("seo_meta : reproduit la fiche publiée ; coupe à 60 / 155 ; défauts de Python", () => {
    expect(buildJobSeoMeta(validSheet(), MAGASINIER_META.metier)).toEqual(WP_MAGASINIER.seo_meta);
    const long = buildJobSeoMeta({ yoast_title: "é".repeat(70), yoast_description: "d".repeat(200) }, "Maçon");
    expect([long.title.length, long.metadesc.length]).toEqual([60, 155]);
    expect(buildJobSeoMeta({ definition: "Déf." }, "Maçon")).toEqual({ title: "Maçon : fiche métier BTP", metadesc: "Déf.", focuskw: "Maçon" });
  });

  it("payload WordPress : publié directement", () => {
    const acf = buildJobAcf(validSheet(), MAGASINIER_FIGURES, MAGASINIER_META);
    const seo = buildJobSeoMeta(validSheet(), MAGASINIER_META.metier);
    expect(buildJobPayload("T", "s", acf, seo)).toEqual({ title: "T", slug: "s", status: "publish", acf, seo_meta: seo });
  });
});

describe("mise à jour annuelle des chiffres", () => {
  const FRESH = {
    salaire_median: 2250,
    salaire_median_moins35: 2190,
    salaire_median_plus35: 2310,
    fourchette_min: 1950,
    fourchette_max: 2400,
    fourchette_part: 80,
    offres_12m: 1210,
    demandeurs: 95,
    tension: "Élevée",
    date_donnees: "2027-10-15",
  };
  const FIGURE_PATHS = ["derniere_mise_a_jour", "informations_cles.items", "statistiques.items", "statistiques.source", "salaires.medians", "salaires.fourchette_offres", "salaires.source"];

  /** L'acf sans ses parties chiffrées : tout ce qui doit rester identique. */
  function texts(acf: Record<string, unknown>) {
    const copy = structuredClone(acf) as Record<string, Record<string, unknown>>;
    for (const p of FIGURE_PATHS) {
      const [a, b] = p.split(".");
      if (b) delete copy[a][b];
      else delete copy[a];
    }
    return copy;
  }

  it("ne touche que les chiffres : textes, quiz, FAQ, rome identiques ; entrée non modifiée", () => {
    const before = structuredClone(WP_MAGASINIER.acf);
    const after = refreshFiguresAcf(WP_MAGASINIER.acf, FRESH, "2027-11-17");
    expect(WP_MAGASINIER.acf).toEqual(before);
    expect(texts(after)).toEqual(texts(before));
    expect(after.derniere_mise_a_jour).toBe("2027-11-17");
    expect(after.informations_cles.items).toEqual([
      { label: "Salaire médian", value: "2 250 €", unit: "brut / mois" },
      { label: "Offres / an", value: "1 210", unit: "" },
      { label: "Tension de recrutement", value: "Élevée", unit: "" },
      { label: "Demandeurs d'emploi", value: "95", unit: "" },
    ]);
    expect(after.statistiques.items).toEqual([
      { valeur: "1 210", label: "Offres diffusées sur 12 mois" },
      { valeur: "95", label: "Demandeurs d'emploi inscrits" },
    ]);
    expect(after.statistiques.source).toEqual({ ...before.statistiques.source, date: "2027-10-15" });
    expect(after.salaires.source).toEqual({ ...before.salaires.source, date: "2027-10-15" });
    expect(after.salaires.fourchette_offres).toEqual({ min: 1950, max: 2400, part: 80 });
    expect(after.salaires.medians.map((m) => m.valeur)).toEqual([2250, 2190, 2310]);
  });

  it("mêmes chiffres, même date : rend la fiche publiée à l'identique (forme WordPress)", () => {
    const figures = figuresFromAcf(WP_MAGASINIER.acf);
    expect(figures).toEqual({ ...MAGASINIER_FIGURES, date_donnees: "2026-11-17" });
    expect(asWp(refreshFiguresAcf(WP_MAGASINIER.acf, figures, "2026-11-17"))).toEqual(WP_MAGASINIER.acf);
  });

  it("acf construit par buildJobAcf : seules les parties chiffrées changent", () => {
    const acf = buildJobAcf(validSheet(), MAGASINIER_FIGURES, MAGASINIER_META);
    const after = refreshFiguresAcf(acf, FRESH, "2027-11-17");
    expect(texts(after)).toEqual(texts(acf));
    expect(after).toEqual(buildJobAcf(validSheet(), FRESH, { ...MAGASINIER_META, today: "2027-11-17" }));
  });

  it("parseIntLoose = metiers_sheet.parse_int", () => {
    expect(parseIntLoose("2 427 €")).toBe(2427);
    expect(parseIntLoose("2 189")).toBe(2189);
    expect(parseIntLoose("")).toBeNull();
    expect(parseIntLoose(null)).toBeNull();
    expect(parseIntLoose(80)).toBe(80);
  });
});

describe("slug", () => {
  it("reproduit les slugs de la vitrine (42 sur 44 ; 2 saisis à la main)", () => {
    const manual = new Set(["installateur-mainteneur-mainteneuse-systemes-solaires-thermiques-photovoltaiques", "staffeur-stuqueur-stuqueuse"]);
    for (const [title, slug] of WP_TITLES_SLUGS) {
      if (manual.has(slug)) expect(jobSlug(title)).not.toBe(slug);
      else expect(jobSlug(title), title).toBe(slug);
    }
    expect(WP_TITLES_SLUGS).toHaveLength(44);
    expect(jobSlug("Maçon / Maçonne")).toBe("macon");
    expect(jobSlug("Manœuvre")).toBe("manoeuvre");
  });
});
