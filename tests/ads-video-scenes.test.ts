import { describe, expect, it } from "vitest";

import { buildRenderProps } from "@/modules/ads/video/props";
import { parseSceneData, sceneProblems, SCENE_GUIDE, SCENE_TYPES } from "@/modules/ads/video/scenes";
import { parseScore, scoreProblems } from "@/modules/ads/video/score";

/**
 * Les scènes de motion design (plan Publicité, §9 sexies, M2) : l'interface de
 * TIM recréée et animée. L'IA les remplit ; le code vérifie avant tout rendu.
 */

const CTX = { facts: new Set([5]), allowed: new Set([30, 5000]), forbidden: ["gratuit à vie"] };
const LISTE = { titre: "Pointage du matin", elements: [{ nom: "Jules Girard", detail: "Arrivé 7 h 32" }, { nom: "Antoine Rizo", detail: "Arrivé 7 h 35" }, { nom: "Loïc Dubois", detail: "Arrivé 7 h 44" }], action: "Valider la journée" };

describe("le contrat des scènes", () => {
  it("chaque type a son mode d'emploi pour l'agent", () => {
    for (const t of SCENE_TYPES) expect(SCENE_GUIDE[t]).toBeTruthy();
  });

  it("les données reçues sont remises en forme ; la légende est commune à toutes", () => {
    expect(parseSceneData("liste", { ...LISTE, legende: " Un geste ", bidon: 1, elements: [...LISTE.elements, { nom: "" }] })).toEqual({ ...LISTE, legende: "Un geste" });
    expect(parseSceneData("notification", { titre: "Heures validées", texte: "Tout est arrivé." })).toEqual({ app: "TIM", titre: "Heures validées", texte: "Tout est arrivé." });
    expect(parseSceneData("planning", { titre: "Semaine", lignes: ["A", "B"] })).toMatchObject({ jours: 5 });
  });
});

describe("ce que le code refuse", () => {
  it("une liste bien remplie passe ; ses horaires fictifs ne sont pas des chiffres de pub", () => {
    expect(sceneProblems("liste", LISTE, CTX)).toEqual([]);
  });

  it("trop peu d'éléments, textes trop longs", () => {
    expect(sceneProblems("liste", { ...LISTE, elements: LISTE.elements.slice(0, 2) }, CTX)).toContain("Une liste a 3 à 6 éléments.");
    expect(sceneProblems("bouton", { titre: "x".repeat(41), bouton: "Pointer", confirmation: "Envoyé" }, CTX).join(" ")).toMatch(/41 caractères, 40 au plus/);
  });

  it("un chiffre non sourcé dans un texte de pub (titre, légende, confirmation) est refusé", () => {
    expect(sceneProblems("bouton", { titre: "Fin de journée", bouton: "Pointer", confirmation: "3 heures gagnées" }, CTX).join(" ")).toMatch(/Chiffre non sourcé : 3/);
    expect(sceneProblems("liste", { ...LISTE, legende: "Gagnez 2 heures" }, CTX).join(" ")).toMatch(/Chiffre non sourcé : 2/);
    expect(sceneProblems("texte", { avant: "Essai de 30 jours", apres: "5 000 chefs" }, CTX)).toEqual([]);
  });

  it("une mention interdite l'est partout, données d'interface comprises", () => {
    expect(sceneProblems("carte", { lieu: "Chantier gratuit à vie", lignes: ["2 équipes sur place"] }, CTX).join(" ")).toMatch(/gratuit à vie/i);
    expect(sceneProblems("carte", { lieu: "Les Terrasses", lignes: ["2 équipes sur place"] }, CTX)).toEqual([]);
  });

  it("un compteur montre toujours un fait sourcé", () => {
    expect(sceneProblems("compteur", { fact: 5, libelle: "" }, CTX)).toEqual([]);
    expect(sceneProblems("compteur", { fact: 9, libelle: "" }, CTX).join(" ")).toMatch(/Fait 9 introuvable/);
  });
});

describe("dans la partition", () => {
  const ctx = { rushes: new Map(), facts: new Map([[5, { id: 5, statement: "plus de 5 000 utilisateurs dans le BTP", source: "Site" }]]), offer: "essai gratuit de 30 jours", forbidden: [] };

  it("une vidéo peut n'avoir que des scènes recréées", () => {
    const score = parseScore({ shots: [{ kind: "scene", seconds: 3, scene: "liste", data: LISTE }, { kind: "scene", seconds: 2, scene: "compteur", data: { fact: 5 } }, { kind: "fin", seconds: 2.5 }] });
    expect(scoreProblems(score, ctx)).toEqual([]);
  });

  it("une scène inconnue ou mal remplie est refusée, avec son plan", () => {
    const score = parseScore({ shots: [{ kind: "scene", seconds: 3, scene: "hologramme", data: {} }, { kind: "scene", seconds: 3, scene: "liste", data: { ...LISTE, elements: [] } }, { kind: "fin", seconds: 2.5 }] });
    const p = scoreProblems(score, ctx).join(" ");
    expect(p).toMatch(/Plan 1 \(scene\) : scène « hologramme » inconnue/);
    expect(p).toMatch(/Plan 2 \(scene\) \(liste\) : Une liste a 3 à 6 éléments/);
  });

  it("au rendu, un compteur reçoit le chiffre et la source de son fait", () => {
    const p = buildRenderProps(parseScore({ shots: [{ kind: "scene", seconds: 2, scene: "compteur", data: { fact: 5, libelle: "utilisateurs dans le BTP" } }, { kind: "fin", seconds: 2 }] }), {
      format: "9x16",
      style: {},
      kit: {},
      cta: "En savoir plus",
      rushes: new Map(),
      facts: new Map([[5, { statement: "plus de 5 000 utilisateurs dans le BTP", source: "Site" }]]),
    });
    expect(p.shots[0]).toMatchObject({ kind: "scene", scene: "compteur", figure: { value: "5 000", label: "utilisateurs dans le BTP", source: "Site" } });
  });
});
