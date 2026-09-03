import { describe, expect, it } from "vitest";

import {
  agendaDuJour,
  compterParJour,
  depuisQuand,
  enRetard,
  grilleDuMois,
  lignesAgenda,
  parisDayKey,
  parisTime,
  type AgendaItem,
} from "@/admin/dashboard/agenda";

/**
 * L'agenda du jour du tableau de bord.
 *
 * Tout se joue sur le FUSEAU : les instants sont stockés en UTC, la journée se
 * lit à Paris. Un décalage d'une heure fait disparaître un rendez-vous de fin de
 * journée ou apparaître celui de la veille au soir — et le banc de test tourne
 * en UTC (tests/setup-tz.ts), précisément pour que ces erreurs se voient ici.
 */

const item = (id: string, at: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id,
  at,
  kind: "appel",
  label: "Appel",
  title: "Rappeler le client",
  client: "TOITURES SA",
  href: "/admin/x",
  ...extra,
});

describe("parisDayKey / parisTime", () => {
  it("rattache 22:30 (Paris) au bon jour, pas au lendemain UTC", () => {
    // 3 sept. 22:30 à Paris = 20:30 UTC en été : même jour des deux côtés.
    expect(parisDayKey("2026-09-03T20:30:00.000Z")).toBe("2026-09-03");
    expect(parisTime("2026-09-03T20:30:00.000Z")).toBe("22:30");
  });

  it("rattache 00:30 (Paris) au jour parisien, pas à la veille UTC", () => {
    // 4 sept. 00:30 à Paris = 3 sept. 22:30 UTC.
    expect(parisDayKey("2026-09-03T22:30:00.000Z")).toBe("2026-09-04");
  });
});

describe("agendaDuJour", () => {
  it("trie par heure, quel que soit l'ordre d'arrivée", () => {
    // Les sessions et les tâches viennent de deux requêtes distinctes : sans
    // tri, la liste mélange 9 h et 17 h et oblige à tout lire.
    const out = agendaDuJour(
      [
        item("c", "2026-09-03T15:00:00.000Z"),
        item("a", "2026-09-03T07:00:00.000Z"),
        item("b", "2026-09-03T12:00:00.000Z"),
      ],
      "2026-09-03",
    );
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("écarte ce qui n'est pas du jour parisien demandé", () => {
    const out = agendaDuJour(
      [
        item("veille", "2026-09-02T20:00:00.000Z"),
        item("jour", "2026-09-03T08:00:00.000Z"),
        item("lendemain", "2026-09-03T22:30:00.000Z"), // 4 sept. à Paris
      ],
      "2026-09-03",
    );
    expect(out.map((i) => i.id)).toEqual(["jour"]);
  });

  it("garde une journée vide vide", () => {
    expect(agendaDuJour([], "2026-09-03")).toEqual([]);
  });
});

describe("lignesAgenda", () => {
  it("met le client en avant quand le titre répète la nature", () => {
    // Une tâche créée sans être renommée s'appelle « Appel » : à côté de sa
    // pastille, la ligne disait « Appel · Appel · Bironalu ».
    expect(lignesAgenda(item("a", "2026-09-03T13:00:00.000Z", { title: "Appel" }))).toEqual({
      principal: "TOITURES SA",
      secondaire: null,
    });
  });

  it("garde les deux lignes quand le titre dit autre chose", () => {
    expect(
      lignesAgenda(item("b", "2026-09-03T13:00:00.000Z", { title: "Relancer sur le devis" })),
    ).toEqual({ principal: "Relancer sur le devis", secondaire: "TOITURES SA" });
  });

  it("retombe sur le titre quand aucun client n'est rattaché", () => {
    expect(
      lignesAgenda(item("c", "2026-09-03T13:00:00.000Z", { title: "Appel", client: null })),
    ).toEqual({ principal: "Appel", secondaire: null });
  });
});

/**
 * Ce qui traîne. Sans cette liste, une tâche non faite disparaissait du tableau
 * de bord à minuit : l'écran redevenait calme alors que le travail restait.
 */
describe("enRetard", () => {
  const jour = "2026-09-03";

  it("remonte ce qui est daté d'avant aujourd'hui et pas coché", () => {
    const out = enRetard(
      [
        item("hier", "2026-09-02T08:00:00.000Z"),
        item("aujourdhui", "2026-09-03T08:00:00.000Z"),
        item("demain", "2026-09-04T08:00:00.000Z"),
      ],
      jour,
    );
    expect(out.map((i) => i.id)).toEqual(["hier"]);
  });

  it("laisse tranquille une tâche déjà faite", () => {
    expect(enRetard([item("faite", "2026-09-01T08:00:00.000Z", { done: true })], jour)).toEqual([]);
  });

  it("met le plus ancien en premier : c'est lui qui a le plus attendu", () => {
    const out = enRetard(
      [item("avant-hier", "2026-09-01T08:00:00.000Z"), item("hier", "2026-09-02T08:00:00.000Z")],
      jour,
    );
    expect(out.map((i) => i.id)).toEqual(["avant-hier", "hier"]);
  });
});

describe("depuisQuand", () => {
  const jour = "2026-09-03";

  it("dit « hier » pour la veille", () => {
    expect(depuisQuand(item("a", "2026-09-02T08:00:00.000Z"), jour)).toBe("hier");
  });

  it("compte les jours dans la semaine", () => {
    expect(depuisQuand(item("b", "2026-08-31T08:00:00.000Z"), jour)).toBe("il y a 3 jours");
  });

  it("passe aux semaines au-delà", () => {
    expect(depuisQuand(item("c", "2026-08-20T08:00:00.000Z"), jour)).toBe("il y a 2 sem.");
  });
});

/**
 * La grille du mois. Six semaines TOUJOURS : posée à côté de l'agenda du jour,
 * elle doit garder la même hauteur d'un mois à l'autre, sinon les deux blocs se
 * désalignent en changeant de mois.
 */
describe("grilleDuMois", () => {
  const vide = new Map<string, { total: number; restants: number }>();

  it("rend six semaines de sept jours, quel que soit le mois", () => {
    for (const jour of ["2026-02-10", "2026-03-01", "2026-09-03", "2026-11-30"]) {
      const g = grilleDuMois(jour, vide);
      expect(g).toHaveLength(6);
      expect(g.every((s) => s.length === 7)).toBe(true);
    }
  });

  it("commence un lundi", () => {
    // 1er septembre 2026 est un mardi : la grille démarre au lundi 31 août.
    expect(grilleDuMois("2026-09-03", vide)[0][0].date).toBe("2026-08-31");
  });

  it("marque le jour courant, et lui seul", () => {
    const jours = grilleDuMois("2026-09-03", vide).flat().filter((c) => c.aujourdHui);
    expect(jours.map((c) => c.date)).toEqual(["2026-09-03"]);
  });

  it("distingue les jours du mois de ceux qui débordent", () => {
    const g = grilleDuMois("2026-09-03", vide).flat();
    expect(g.find((c) => c.date === "2026-08-31")?.dansLeMois).toBe(false);
    expect(g.find((c) => c.date === "2026-09-01")?.dansLeMois).toBe(true);
  });

  it("reporte les compteurs sur le bon jour", () => {
    const g = grilleDuMois("2026-09-03", new Map([["2026-09-15", { total: 3, restants: 1 }]])).flat();
    expect(g.find((c) => c.date === "2026-09-15")).toMatchObject({ total: 3, restants: 1 });
    expect(g.find((c) => c.date === "2026-09-16")).toMatchObject({ total: 0, restants: 0 });
  });
});

describe("compterParJour", () => {
  it("regroupe par journée parisienne et compte ce qui reste", () => {
    const compte = compterParJour([
      item("a", "2026-09-03T08:00:00.000Z"),
      item("b", "2026-09-03T15:00:00.000Z", { done: true }),
      item("c", "2026-09-03T22:30:00.000Z"), // 4 sept. à Paris
    ]);
    expect(compte.get("2026-09-03")).toEqual({ total: 2, restants: 1 });
    expect(compte.get("2026-09-04")).toEqual({ total: 1, restants: 1 });
  });
});
