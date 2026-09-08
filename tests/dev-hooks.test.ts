import { describe, expect, it } from "vitest";

import { applyStatusEffects, setDefaultStatus, setDemandCount } from "@/modules/dev/hooks/stamps";

/**
 * Ce que le système inscrit tout seul sur un développement.
 *
 * Depuis que les statuts sont éditables, ces automatismes ne lisent plus de
 * table en dur : ils demandent au statut ce qu'il déclenche. Ce qui est en jeu
 * ici, c'est donc qu'un statut CRÉÉ EN BACK-OFFICE se comporte exactement comme
 * un statut livré — et qu'un statut sans rôle ne déclenche rien.
 */

type Hook = typeof setDemandCount;
type Args = Parameters<Hook>[0];

/** Faux `payload.db` : des documents en mémoire, interrogés comme la vraie couche. */
const fakeDb = (rows: Record<string, Record<string, unknown>[]>) => ({
  payload: {
    db: {
      findOne: async ({ collection, where }: { collection: string; where: Record<string, { equals: unknown }> }) => {
        const [field, cond] = Object.entries(where)[0];
        return (
          (rows[collection] ?? []).find((r) => String(r[field]) === String(cond.equals)) ?? null
        );
      },
      find: async ({ collection }: { collection: string }) => ({ docs: rows[collection] ?? [] }),
    },
  },
});

const run = async (hook: Hook, args: Partial<Args>) =>
  (await hook({ operation: "update", ...args } as Args)) as Record<string, unknown>;

const STATUTS = [
  { id: 1, key: "qualification", name: "En qualification", position: 20, roles: [], phase: "entree" },
  { id: 5, key: "en-cours", name: "En développement", position: 80, roles: ["demarre"], phase: "realisation" },
  { id: 9, key: "en-production", name: "En production", position: 120, roles: ["demarre", "livre"], phase: "livraison" },
  { id: 12, key: "non-retenu", name: "Non retenu", position: 210, roles: ["cloture"], phase: "hors-flux" },
];

describe("statut posé d'office", () => {
  it("un développement créé sans statut atterrit dans la colonne d'entrée", async () => {
    // Cas réel : l'ouverture d'un développement depuis un ticket, qui ne
    // connaît pas les colonnes.
    const out = await run(setDefaultStatus, {
      data: { title: "Export compta" },
      req: fakeDb({ "dev-statuses": STATUTS }) as never,
    });
    expect(out.status).toBe(1);
  });

  it("un statut VIDÉ à la main retombe sur la colonne d'entrée", async () => {
    /**
     * Le cas qui manquait : « champ absent » et « champ mis à null » ne sont pas
     * la même chose. Un repli naïf sur la fiche lisait le second comme
     * « inchangé », et la fiche partait sans statut — invisible partout.
     */
    const out = await run(setDefaultStatus, {
      data: { status: null },
      originalDoc: { status: 9 },
      req: fakeDb({ "dev-statuses": STATUTS }) as never,
    });
    expect(out.status).toBe(1);
  });

  it("ne touche pas à un statut déjà choisi", async () => {
    const out = await run(setDefaultStatus, {
      data: { status: 9 },
      req: fakeDb({ "dev-statuses": STATUTS }) as never,
    });
    expect(out.status).toBe(9);
  });

  it("si la clé d'entrée a été supprimée, prend la première colonne du tableau", async () => {
    // Cas vécu : le statut « À trier » a été supprimé en back-office le jour où
    // l'équipe a resserré ses colonnes. Rien ne doit se casser pour autant.
    const sansEntree = STATUTS.filter((s) => s.key !== "qualification");
    const out = await run(setDefaultStatus, {
      data: { title: "x" },
      req: fakeDb({ "dev-statuses": sansEntree }) as never,
    });
    expect(out.status).toBe(5);
  });
});

describe("effets du statut", () => {
  const withStatus = (status: number | { id: number }, original?: Record<string, unknown>) =>
    run(applyStatusEffects, {
      data: { status },
      originalDoc: original,
      req: fakeDb({ "dev-statuses": STATUTS }) as never,
    });

  it("le rang de tri suit la position de la colonne", async () => {
    expect((await withStatus(5)).statusRank).toBe(80);
    expect((await withStatus(12)).statusRank).toBe(210);
  });

  it("lit le statut même reçu peuplé (objet) plutôt qu'en id brut", async () => {
    expect((await withStatus({ id: 9 })).statusRank).toBe(120);
  });

  it("date le démarrage sur un statut qui porte le rôle « démarre »", async () => {
    const out = await withStatus(5);
    expect(typeof out.startedAt).toBe("string");
    expect(out.deliveredAt).toBeUndefined();
  });

  it("ne date rien sur un statut sans rôle", async () => {
    const out = await withStatus(1);
    expect(out.startedAt).toBeUndefined();
    expect(out.deliveredAt).toBeUndefined();
  });

  it("NE RÉÉCRIT PAS la date de démarrage sur un aller-retour", async () => {
    // Recette ratée → retour en développement : ce qu'on veut savoir, c'est
    // quand le travail a commencé, pas quand on y est revenu.
    const out = await withStatus(5, { startedAt: "2026-01-05T08:00:00.000Z" });
    expect(out.startedAt).toBeUndefined(); // rien de réécrit : la valeur d'origine reste
  });

  it("date la livraison, et rattrape un démarrage manquant", async () => {
    // Un dev passé directement en production garderait sinon une chronologie
    // trouée (livré, jamais démarré).
    const out = await withStatus(9);
    expect(out.deliveredAt).toBe(out.startedAt);
  });

  it("un statut vidé ne laisse pas le rang de l'ancienne colonne", async () => {
    const out = await run(applyStatusEffects, {
      data: { status: null },
      originalDoc: { status: 9, statusRank: 120 },
      req: fakeDb({ "dev-statuses": STATUTS }) as never,
    });
    expect(out.statusRank).toBeUndefined();
  });

  it("un statut supprimé entre-temps ne fait pas échouer l'enregistrement", async () => {
    const out = await run(applyStatusEffects, {
      data: { status: 999 },
      req: fakeDb({ "dev-statuses": STATUTS }) as never,
    });
    expect(out.statusRank).toBeUndefined();
  });
});

describe("compteur de clients demandeurs", () => {
  it("compte les opportunités rattachées", async () => {
    const out = await run(setDemandCount, { data: { opportunities: [1, 2, 7] } });
    expect(out.demandCount).toBe(3);
  });

  it("retombe à zéro quand on les retire toutes", async () => {
    const out = await run(setDemandCount, {
      data: { opportunities: [] },
      originalDoc: { opportunities: [1, 2] },
    });
    expect(out.demandCount).toBe(0);
  });

  it("se reprend sur la fiche quand la mise à jour ne touche pas aux demandeurs", async () => {
    const out = await run(setDemandCount, {
      data: { title: "t" },
      originalDoc: { opportunities: [1, 2] },
    });
    expect(out.demandCount).toBe(2);
  });
});
