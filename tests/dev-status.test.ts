import { describe, expect, it } from "vitest";

import {
  DEFAULT_STATUS_KEY,
  DEV_PHASES,
  DEV_STATUS_ROLES,
  DEV_STATUS_SEED,
  statusHasRole,
} from "@/modules/dev/lib/devStatus";
import { DEV_PRIORITIES, DEV_TYPES, devMeta, PALETTE, paletteColor } from "@/modules/dev/lib/devMeta";

/**
 * Les statuts d'un développement.
 *
 * Ils sont désormais du CONTENU : on en crée depuis le back-office, et le code
 * ne peut plus rien supposer de leurs noms. Ce qui doit rester vrai, et que ces
 * tests protègent :
 *  - le jeu de départ est cohérent (phases connues, couleurs de la palette,
 *    positions strictement croissantes, clés uniques) ;
 *  - un statut qui ne déclare aucun rôle ne déclenche aucun automatisme ;
 *  - le statut d'entrée existe, sinon un développement créé par l'API n'aurait
 *    aucune colonne où atterrir.
 */

describe("jeu de statuts livré", () => {
  it("chaque statut appartient à une phase déclarée", () => {
    const phases = new Set(DEV_PHASES.map((p) => p.value));
    for (const s of DEV_STATUS_SEED) expect(phases.has(s.phase)).toBe(true);
  });

  it("aucune phase n'est vide — sinon c'est un bandeau pour rien", () => {
    for (const p of DEV_PHASES) {
      expect(DEV_STATUS_SEED.some((s) => s.phase === p.value)).toBe(true);
    }
  });

  it("les clés sont uniques : c'est par elles que le code retrouve un statut", () => {
    expect(new Set(DEV_STATUS_SEED.map((s) => s.key)).size).toBe(DEV_STATUS_SEED.length);
  });

  it("les positions sont strictement croissantes, dans l'ordre du flux", () => {
    const positions = DEV_STATUS_SEED.map((s) => s.position);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("les positions sont espacées : on peut intercaler sans renuméroter", () => {
    for (let i = 1; i < DEV_STATUS_SEED.length; i += 1) {
      expect(DEV_STATUS_SEED[i].position - DEV_STATUS_SEED[i - 1].position).toBeGreaterThan(1);
    }
  });

  it("les clés du jeu livré sont celles que le code attend", () => {
    // Le code ne nomme qu'un seul statut : celui d'entrée. Le reste passe par
    // les rôles, précisément pour survivre aux renommages.
    expect(DEV_STATUS_SEED.map((s) => s.key)).toContain(DEFAULT_STATUS_KEY);
  });

  it("le statut d'entrée existe et ouvre le tableau", () => {
    const entry = DEV_STATUS_SEED.find((s) => s.key === DEFAULT_STATUS_KEY);
    expect(entry).toBeDefined();
    expect(entry?.position).toBe(Math.min(...DEV_STATUS_SEED.map((s) => s.position)));
  });

  it("toutes les couleurs viennent de la palette de l'admin", () => {
    const palette = new Set(PALETTE.map((c) => c.value));
    for (const s of DEV_STATUS_SEED) expect(palette.has(s.color)).toBe(true);
  });

  it("les rôles utilisés sont ceux que le code sait interpréter", () => {
    const known = new Set(DEV_STATUS_ROLES.map((r) => r.value));
    for (const s of DEV_STATUS_SEED) for (const role of s.roles) expect(known.has(role)).toBe(true);
  });
});

describe("cohérence des rôles du jeu livré", () => {
  const byKey = (key: string) => DEV_STATUS_SEED.find((s) => s.key === key);

  it("livrer implique avoir démarré — sinon la chronologie serait trouée", () => {
    for (const s of DEV_STATUS_SEED) {
      if (s.roles.includes("livre")) expect(s.roles).toContain("demarre");
    }
  });

  it("le travail démarre en réalisation et au-delà, jamais avant", () => {
    for (const s of DEV_STATUS_SEED) {
      if (s.roles.includes("demarre")) {
        expect(["realisation", "livraison"]).toContain(s.phase);
      }
    }
    // Étudier n'est pas démarrer : on peut instruire une demande puis n'en rien
    // faire, et la date de démarrage doit rester vide.
    expect(byKey("investigation")?.roles).toEqual([]);
    expect(byKey("attente-validation")?.roles).toEqual([]);
  });

  it("« en attente » ne clôt rien : c'est une pause, elle reste à traiter", () => {
    expect(byKey("en-attente")?.roles).toEqual([]);
    expect(byKey("termine")?.roles).toContain("cloture");
    expect(byKey("non-retenu")?.roles).toContain("cloture");
    expect(byKey("abandonne")?.roles).toContain("cloture");
    expect(byKey("doublon")?.roles).toContain("cloture");
  });
});

describe("lecture d'un statut venu de la base", () => {
  it("un statut sans rôle ne déclenche aucun automatisme", () => {
    const status = { id: 1, name: "Statut maison", roles: [] };
    expect(statusHasRole(status, "demarre")).toBe(false);
    expect(statusHasRole(status, "livre")).toBe(false);
    expect(statusHasRole(status, "cloture")).toBe(false);
  });

  it("un statut sans rôles du tout (champ absent) se lit sans casser", () => {
    expect(statusHasRole({ id: 1 }, "demarre")).toBe(false);
    expect(statusHasRole(null, "cloture")).toBe(false);
  });

});

describe("pastilles colorées", () => {
  it("type et priorité ont tous leur couleur et leur libellé", () => {
    for (const t of DEV_TYPES) expect(devMeta("type", t.value).bg).toBe(t.bg);
    for (const p of DEV_PRIORITIES) expect(devMeta("priority", p.value).fg).toBe(p.color);
  });

  it("toutes les couleurs passent par un token — aucune valeur en dur", () => {
    for (const o of [...DEV_TYPES, ...DEV_PRIORITIES, ...PALETTE]) {
      expect(o.color).toMatch(/^var\(--tim-/);
      expect(o.bg).toMatch(/^var\(--tim-/);
    }
  });

  it("une valeur inconnue reste lisible au lieu d'afficher une pastille vide", () => {
    expect(devMeta("type", "type-inexistant").label).toBe("type-inexistant");
    expect(paletteColor("teinte-inconnue").fg).toMatch(/^var\(--tim-/);
  });
});
