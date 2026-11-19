import { describe, expect, it } from "vitest";

import { altText, buildImagePrompt, captionOf, categoryOf, fileSlug, frenchSpacing, imageJsonLd, motifOf, splitKeyword, titleSize } from "@/modules/editorial/lib/visual/charte";

describe("charte des visuels : catégorie et motif", () => {
  it("catégorie d'après la thématique, affinée par le titre", () => {
    expect(categoryOf(1, "Modèles de feuilles d'heures à imprimer")).toBe("Feuilles d'heures");
    expect(categoryOf(1, "Pointage chantier : les obligations")).toBe("Pointage");
    expect(categoryOf(2, "Grille de salaire BTP 2026")).toBe("Paie & RH");
    expect(categoryOf(5, "Gérer le matériel de chantier")).toBe("Suivi de chantier");
    expect(categoryOf(3, "Top 4 des meilleurs logiciels de planning chantier")).toBe("Comparatifs");
  });
  it("le premier mot précis du titre choisit le motif", () => {
    expect(motifOf("Chômage intempéries BTP : conditions et indemnisation", "Paie & RH")).toBe("meteo");
    expect(motifOf("Panier repas BTP : montant 2026", "Paie & RH")).toBe("repas");
    expect(motifOf("Heures supplémentaires BTP : règles et calcul", "Pointage")).toBe("horloge");
    expect(motifOf("Grille de salaire BTP 2026", "Paie & RH")).toBe("pieces");
    expect(motifOf("Jours fériés BTP : rémunération et règles", "Paie & RH")).toBe("calendrier");
    expect(motifOf("Pointage", "Pointage")).toBe("horloge");
  });
});

describe("charte des visuels : titre", () => {
  it("taille selon la longueur", () => {
    expect(titleSize("x".repeat(48))).toBe(112);
    expect(titleSize("x".repeat(72))).toBe(96);
    expect(titleSize("x".repeat(73))).toBe(84);
  });
  it("espace insécable avant : ; ? !", () => {
    expect(frenchSpacing("Repos compensateur : règles ?")).toBe("Repos compensateur : règles ?");
  });
  it("mots en italique : le mot-clé s'il figure tel quel, sinon les mots du mot-clé (3 au plus)", () => {
    expect(splitKeyword("Chômage intempéries BTP : conditions", "chômage intempéries BTP")).toEqual(["", "Chômage intempéries BTP", " : conditions"]);
    expect(splitKeyword("Comment calculer les heures supplémentaires dans le BTP", "heures supplémentaires BTP")[1]).toBe("heures supplémentaires");
    expect(splitKeyword("Grille de salaire BTP 2026", "grille salaire btp 2026")[1]).toBe("Grille de salaire");
    expect(splitKeyword("Modèles de feuilles d'heures à imprimer gratuitement", "Feuille d'heures vierge gratuitement")[1]).toBe("feuilles d'heures");
  });
});

describe("charte des visuels : SEO / GEO", () => {
  it("nom de fichier : slug du mot-clé, sans mots vides, 60 caractères au plus", () => {
    expect(fileSlug("Chômage intempéries BTP : indemnisation 2026", "")).toBe("chomage-intemperies-btp-indemnisation-2026");
    expect(fileSlug("Comment calculer le temps de travail d'un salarié", "").length).toBeLessThanOrEqual(60);
    expect(fileSlug("", "")).toBe("article-tim-management");
  });
  it("alt : ce que montre l'image et le mot-clé, 125 caractères au plus, sans « image de »", () => {
    const alt = altText("meteo", "Paie & RH", "chômage intempéries BTP");
    expect(alt).toBe("Un nuage de pluie sur fond jaune, pour un article sur chômage intempéries BTP");
    expect(alt.length).toBeLessThanOrEqual(125);
    expect(alt.toLowerCase()).not.toContain("image de");
    expect(altText("pieces", "Paie & RH", "x".repeat(150)).length).toBeLessThanOrEqual(125);
  });
  it("légende, JSON-LD, et aucune mention d'IA nulle part", () => {
    const caption = captionOf("chômage intempéries BTP", "");
    expect(caption).toBe("Chômage intempéries BTP : les repères essentiels expliqués par TIM Management.");
    const ld = imageJsonLd({ contentUrl: "https://cms.tim-management.co/wp-content/uploads/2026/11/x.webp", caption, alt: "a" });
    expect(ld).toMatchObject({ "@type": "ImageObject", width: 1920, height: 1080, encodingFormat: "image/webp", representativeOfPage: true, creator: { "@type": "Organization", name: "TIM Management" } });
    const all = JSON.stringify(ld) + caption + altText("meteo", "Pointage", "x") + fileSlug("ia générative", "");
    expect(/\b(ia|ai|intelligence artificielle|claude|gpt|générée?)\b/i.test(all.replace("ia-generative", ""))).toBe(false);
  });
});

describe("le prompt de l'image pour Claude Design", () => {
  it("remplit le bloc « À REMPLIR » et garde la charte mot pour mot", () => {
    const p = buildImagePrompt({ title: "Chômage intempéries BTP : conditions", category: "Paie & RH", keyword: "chômage intempéries BTP", italic: "Chômage intempéries BTP", motif: null });
    expect(p).toContain("H1 de l'article : Chômage intempéries BTP : conditions");
    expect(p).toContain("Catégorie : Paie & RH");
    expect(p).toContain("Mot-clé principal SEO : chômage intempéries BTP");
    expect(p).toContain("Mot(s) en serif italique : Chômage intempéries BTP");
    expect(p).toContain("Motif forcé (optionnel) : auto");
    expect(p).toContain("=== CHARTE FIGÉE ===");
    expect(p).toContain("Paie & RH : #F7C66E / #FCE6BB / #EBAA36 / #9A6508");
    expect(p).toContain("Envoie-moi le fichier WebP");
    expect(p).toContain("Pas de bloc JSON-LD");
    expect(p).not.toContain("contentUrl en https://tim-management.co");
  });
  it("motif forcé et mot-clé absent", () => {
    const p = buildImagePrompt({ title: "T", category: "Planning", keyword: "", italic: "", motif: "gantt" });
    expect(p).toContain("Motif forcé (optionnel) : gantt");
    expect(p).toContain("Mot-clé principal SEO : déduis-le du H1");
    expect(p).toContain("Mot(s) en serif italique : choisis 1 à 3 mots porteurs du sujet");
  });
});
