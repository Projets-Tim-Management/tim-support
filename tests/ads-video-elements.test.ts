import { describe, expect, it } from "vitest";

import { elementProblems, ELEMENT_GUIDE, ELEMENT_TYPES, parseElement, parseFond, protectedInFrame } from "@/modules/ads/video/elements";
import { buildRenderProps } from "@/modules/ads/video/props";
import { parseScore, scoreProblems } from "@/modules/ads/video/score";

/**
 * Les plans composés (plan Publicité, §9 sexies, M2) : un fond et des éléments
 * animés sans fond posés dessus, que l'agent choisit, place et minute. Le code
 * vérifie tout avant le rendu.
 */

const CTX = { seconds: 3, facts: new Set([5]), allowed: new Set([30, 5000]), forbidden: ["gratuit à vie"], rush: null };
const el = (o: Record<string, unknown>) => parseElement({ x: 0.5, y: 0.5, debut: 0, ...o });
const NOTIF = el({ type: "notification", data: { app: "TIM", titre: "Heures validées", texte: "Tout est au bureau." }, y: 0.3 });

describe("le vocabulaire", () => {
  it("chaque élément a son mode d'emploi pour l'agent", () => {
    for (const t of ELEMENT_TYPES) expect(ELEMENT_GUIDE[t]).toBeTruthy();
  });

  it("fonds et éléments reçus sont remis en forme, avec des valeurs par défaut sûres", () => {
    expect(parseFond({ type: "rush", rush: "3", voile: 2, flou: true })).toEqual({ type: "rush", rush: 3, from: 0, to: undefined, zoom: null, flou: true, voile: 0.7 });
    expect(parseFond({ type: "inconnu" })).toEqual({ type: "style" });
    expect(parseElement({ type: "badge", data: { texte: "Validé" }, x: "0.4", entree: "explosion" })).toMatchObject({ type: "badge", x: 0.4, y: 0.5, debut: 0, entree: "pop", sortie: "aucune", mouvement: "aucun" });
  });
});

describe("ce que le code refuse", () => {
  it("un élément bien placé et bien rempli passe", () => {
    expect(elementProblems([NOTIF], { type: "style" }, CTX)).toEqual([]);
  });

  it("type inconnu, hors du temps du plan, hors du cadre", () => {
    expect(elementProblems([el({ type: "hologramme" })], { type: "style" }, CTX)).toEqual(["Élément 1 : type « hologramme » inconnu."]);
    expect(elementProblems([{ ...NOTIF, debut: 4 }], { type: "style" }, CTX).join(" ")).toMatch(/hors du plan/);
    expect(elementProblems([{ ...NOTIF, x: 0.95 }], { type: "style" }, CTX).join(" ")).toMatch(/sort du cadre en 9:16/);
  });

  it("une liste de 2 à 6 éléments ; une flèche a son point d'arrivée ; 8 éléments au plus", () => {
    expect(elementProblems([el({ type: "liste", data: { titre: "Pointage", elements: [{ nom: "Jules" }] }, y: 0.4 })], { type: "style" }, CTX).join(" ")).toMatch(/2 à 6 éléments/);
    expect(elementProblems([el({ type: "fleche", data: {} })], { type: "style" }, CTX).join(" ")).toMatch(/point d'arrivée/);
    expect(elementProblems(Array(9).fill(el({ type: "tap", data: {} })), { type: "style" }, CTX)[0]).toMatch(/8 éléments au plus/);
  });

  it("textes de pub aux garde-fous ; données d'interface fictives aux interdits seulement ; compteur sourcé", () => {
    expect(elementProblems([el({ type: "badge", data: { texte: "3 h gagnées" } })], { type: "style" }, CTX).join(" ")).toMatch(/Chiffre non sourcé : 3/);
    expect(elementProblems([el({ type: "champ", data: { libelle: "Arrivée", valeur: "7 h 32" } })], { type: "style" }, CTX)).toEqual([]);
    expect(elementProblems([el({ type: "fiche", data: { lieu: "Chantier gratuit à vie", lignes: ["2 équipes"] }, y: 0.4 })], { type: "style" }, CTX).join(" ")).toMatch(/gratuit à vie/i);
    expect(elementProblems([el({ type: "compteur", data: { fact: 9 } })], { type: "style" }, CTX).join(" ")).toMatch(/fait 9 introuvable/i);
  });

  it("jamais un élément opaque sur la zone protégée d'un rush — un geste transparent, si", () => {
    const rush = { srcAspect: 732 / 1510, framing: { crop: null, protect: { x: 0, y: 0.4, w: 1, h: 0.3 } } };
    const p = protectedInFrame(rush, 1080 / 1920, null)!;
    expect(p.y).toBeGreaterThan(0.3);
    const over = { ...NOTIF, y: p.y + p.h / 2 };
    expect(elementProblems([over], { type: "rush", rush: 1 }, { ...CTX, rush }).join(" ")).toMatch(/recouvre la zone à ne jamais couper/);
    expect(elementProblems([el({ type: "tap", data: {}, y: p.y + p.h / 2 })], { type: "rush", rush: 1 }, { ...CTX, rush })).toEqual([]);
    // Le cadrage change avec le format : en 1:1, une notification en haut tomberait sur la zone ; une étiquette, non.
    expect(elementProblems([{ ...NOTIF, y: 0.12 }], { type: "rush", rush: 1 }, { ...CTX, rush }).join(" ")).toMatch(/en 1:1/);
    expect(elementProblems([el({ type: "etiquette", data: { texte: "Pointage" }, y: 0.06, largeur: 0.3 })], { type: "rush", rush: 1 }, { ...CTX, rush })).toEqual([]);
  });
});

describe("dans la partition", () => {
  const ctx = {
    rushes: new Map([[1, { id: 1, ready: true, durationSec: 12, framing: null, srcAspect: 732 / 1510 }]]),
    facts: new Map([[5, { id: 5, statement: "plus de 5 000 utilisateurs dans le BTP", source: "Site" }]]),
    offer: "essai gratuit de 30 jours",
    forbidden: [],
  };
  const COMPO = { kind: "compo", seconds: 3, fond: { type: "rush", rush: 1, from: 0, to: 3, flou: true, voile: 0.4 }, elements: [{ type: "notification", data: { app: "TIM", titre: "Heures validées", texte: "Au bureau." }, x: 0.5, y: 0.3, debut: 0.3 }] };

  it("un plan composé sur un rush montre le logiciel ; son fond est vérifié comme un rush", () => {
    expect(scoreProblems(parseScore({ shots: [COMPO, { kind: "fin", seconds: 3 }] }), ctx)).toEqual([]);
    expect(scoreProblems(parseScore({ shots: [{ ...COMPO, fond: { type: "rush", rush: 1, from: 10, to: 14 } }, { kind: "fin", seconds: 3 }] }), ctx).join(" ")).toMatch(/fond — passage de 10 à 14 s hors du rush/);
  });

  it("un plan composé sans rush ni interface ne suffit pas à montrer le logiciel", () => {
    const only = { kind: "compo", seconds: 3, fond: { type: "couleur", couleur: "accent" }, elements: [{ type: "titre", data: { texte: "Fini la ressaisie" }, x: 0.5, y: 0.4, debut: 0 }] };
    expect(scoreProblems(parseScore({ shots: [only, { kind: "fin", seconds: 3 }] }), ctx).join(" ")).toMatch(/montre le logiciel/);
  });

  it("au rendu : le fond rush est cadré, un compteur reçoit son chiffre, une image absente retombe sur le style", () => {
    const score = parseScore({
      shots: [
        { ...COMPO, elements: [{ type: "compteur", data: { fact: 5 }, x: 0.5, y: 0.5, debut: 0.5, fin: 2.5 }] },
        { kind: "compo", seconds: 2, fond: { type: "image", media: 99 }, elements: [] },
        { kind: "fin", seconds: 2 },
      ],
    });
    const p = buildRenderProps(score, { format: "9x16", style: {}, kit: {}, cta: "En savoir plus", rushes: new Map([[1, { url: "u", width: 732, height: 1510, framing: null }]]), facts: new Map([[5, { statement: "plus de 5 000 utilisateurs dans le BTP", source: "Site" }]]) });
    expect(p.shots[0]).toMatchObject({ kind: "compo", fond: { type: "rush", src: "u", flou: true, voile: 0.4, playbackRate: 1 }, elements: [{ type: "compteur", from: 15, to: 75, figure: { value: "5 000" } }] });
    expect(p.shots[1]).toMatchObject({ fond: { type: "style" } });
  });
});
