import { describe, expect, it, vi } from "vitest";

import { MAX_ROWS, runImport } from "@/modules/marketing/lib/dossier-import";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";

/**
 * Le traitement d'un import, partagé par l'espace client et la console TIM.
 *
 * Il vit dans une bibliothèque et non dans une route parce qu'il y a DEUX
 * portes. Les écrire deux fois, c'est garantir qu'un jour l'une acceptera un
 * fichier que l'autre refuse — et le client aurait raison de ne pas comprendre.
 */

const salaries = sectionByKey("salaries")!;
const csv = (lignes: string[]) => lignes.join("\n") + "\n";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lancer = (payload: unknown, body: unknown) => runImport(payload as any, salaries, 1, body as any);

describe("lecture : rien n'est écrit", () => {
  it("rend le verdict sans toucher à la base", async () => {
    const payload = { create: vi.fn(), find: vi.fn(), delete: vi.fn() };
    const res = await lancer(payload, {
      csv: csv(["Société;Prénom;Nom", "BTP Sud;Luis;Martin", "BTP Sud;;Durand"]),
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(1);
    expect(res.body.ko).toBe(1);
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it("refuse un fichier vide plutôt que de rendre un rapport vide", async () => {
    expect((await lancer({}, { csv: "   " })).status).toBe(400);
  });
});

describe("écriture des lignes corrigées", () => {
  const ligne = { company: "BTP Sud", firstName: "Luis", lastName: "Martin" };

  it("efface AVANT d'écrire quand on remplace", async () => {
    /**
     * L'ordre est le point : écrire puis nettoyer laisserait la liste en double
     * si l'exécution s'arrêtait entre les deux. Une liste vide un instant se
     * répare ; une liste dédoublée se démêle à la main.
     */
    const ordre: string[] = [];
    const payload = {
      find: vi.fn(async () => ({ docs: [{ id: 7 }, { id: 8 }] })),
      delete: vi.fn(async () => {
        ordre.push("delete");
        return {};
      }),
      create: vi.fn(async () => {
        ordre.push("create");
        return { id: 1 };
      }),
    };

    const res = await lancer(payload, { confirmer: true, remplacer: true, rows: [ligne] });

    expect(ordre).toEqual(["delete", "delete", "create"]);
    expect(res.body.deleted).toBe(2);
    expect(res.body.written).toBe(1);
  });

  it("n'efface rien quand on complète", async () => {
    const payload = { find: vi.fn(), delete: vi.fn(), create: vi.fn(async () => ({ id: 1 })) };
    const res = await lancer(payload, { confirmer: true, remplacer: false, rows: [ligne] });

    expect(payload.delete).not.toHaveBeenCalled();
    expect(res.body.deleted).toBe(0);
  });

  it("rapporte les lignes refusées SANS faire échouer les autres", async () => {
    /**
     * Le défaut qu'on répare ici : une seule ligne fautive levait une exception
     * qui traversait la route, et l'import entier tombait en 500 — sans dire
     * laquelle, ni pourquoi.
     */
    const payload = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: 1 })
        .mockRejectedValueOnce(
          // Un refus que le registre ne pouvait PAS prévoir — c'est le cas qui
          // compte : ceux qu'il prévoit sont déjà rouges à l'écran.
          Object.assign(new Error("invalide"), {
            data: { errors: [{ path: "matricule", message: "Matricule déjà utilisé." }] },
          }),
        )
        .mockResolvedValueOnce({ id: 3 }),
    };

    const res = await lancer(payload, {
      confirmer: true,
      rows: [ligne, { ...ligne, matricule: "SAL-0001" }, ligne],
    });

    expect(res.status).toBe(200);
    expect(res.body.written).toBe(2);
    const refused = res.body.refused as { index: number; errors: Record<string, string> }[];
    expect(refused).toHaveLength(1);
    expect(refused[0].index).toBe(1);
    expect(refused[0].errors.matricule).toContain("déjà utilisé");
  });

  it("refuse un envoi au-delà du plafond, avant d'écrire quoi que ce soit", async () => {
    // Au-delà, ce n'est plus une saisie mais une reprise de données : elle se
    // traite avec nous, pas dans un formulaire qui expire au bout d'une minute.
    const payload = { create: vi.fn() };
    const res = await lancer(payload, {
      confirmer: true,
      rows: Array.from({ length: MAX_ROWS + 1 }, () => ligne),
    });

    expect(res.status).toBe(413);
    expect(payload.create).not.toHaveBeenCalled();
  });
});
