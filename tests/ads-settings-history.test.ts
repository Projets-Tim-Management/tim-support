import type { Field, GlobalAfterChangeHook } from "payload";
import { describe, expect, it, vi } from "vitest";

import { AdsSettingsHistory, changeSummary, settingChanges, settingFields } from "@/modules/ads/collections/AdsSettingsHistory";
import { AdsSettings } from "@/modules/ads/globals/AdsSettings";

/** Historique des garde-fous (demande du 01/10/2026) : qui, quand, avant, après. */

const hook = AdsSettings.hooks!.afterChange![0] as GlobalAfterChangeHook;
const run = (previousDoc: Record<string, unknown>, doc: Record<string, unknown>, user: unknown = { id: 9 }) => {
  const create = vi.fn(async () => ({}));
  return { create, done: hook({ doc, previousDoc, req: { user, payload: { create } } } as never) };
};

describe("historique des garde-fous", () => {
  it("connaît chaque garde-fou par son libellé, rangées et blocs repliables traversés", () => {
    const names = settingFields(AdsSettings.fields as Field[]);
    expect(names).toEqual(expect.arrayContaining([{ name: "agentDailyEur", label: "Tous agents — par jour (€)" }, { name: "enabled", label: "Interrupteur général" }]));
  });

  it("une modification : une ligne, avec qui, l'avant et l'après", async () => {
    const before = { enabled: true, agentPrepMaxEur: 5, agentDailyEur: 15, agentMonthlyEur: 150 };
    const { create, done } = run(before, { ...before, agentDailyEur: 10, agentMonthlyEur: 200 });
    await done;
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "ads-settings-history",
        data: expect.objectContaining({
          changedBy: 9,
          summary: "Tous agents — par jour (€) : 15 → 10 ; Tous agents — par mois (€) : 150 → 200",
          changes: [
            { champ: "agentDailyEur", libelle: "Tous agents — par jour (€)", avant: 15, apres: 10 },
            { champ: "agentMonthlyEur", libelle: "Tous agents — par mois (€)", avant: 150, apres: 200 },
          ],
        }),
      }),
    );
  });

  it("ignore les champs que Payload ajoute lui-même (date de modification) : enregistrer sans rien changer n'écrit rien", () => {
    const withSystem = [...(AdsSettings.fields as Field[]), { name: "updatedAt", type: "date" } as Field, { name: "createdAt", type: "date" } as Field];
    expect(settingFields(withSystem).map((f) => f.name)).not.toEqual(expect.arrayContaining(["updatedAt"]));
    expect(settingChanges(settingFields(withSystem), { agentDailyEur: 10, updatedAt: "2026-09-30T17:56:22.074Z" }, { agentDailyEur: 10, updatedAt: "2026-10-01T06:23:57.461Z" })).toEqual([]);
  });

  it("un enregistrement sans changement n'écrit rien", async () => {
    const same = { enabled: true, agentDailyEur: 15 };
    const { create, done } = run(same, { ...same });
    await done;
    expect(create).not.toHaveBeenCalled();
  });

  it("dit l'interrupteur en clair, et l'absence de valeur par un tiret", () => {
    expect(changeSummary(settingChanges([{ name: "enabled", label: "Interrupteur" }], { enabled: true }, { enabled: false }))).toBe("Interrupteur : oui → non");
    expect(changeSummary(settingChanges([{ name: "x", label: "X" }], {}, { x: 3 }))).toBe("X : — → 3");
  });

  it("personne ne l'écrit ni ne l'efface par l'API, même un admin", () => {
    const admin = { req: { user: { roles: ["admin"] } } } as never;
    for (const op of ["create", "update", "delete"] as const) expect((AdsSettingsHistory.access![op] as (a: unknown) => boolean)(admin)).toBe(false);
    expect((AdsSettingsHistory.access!.read as (a: unknown) => boolean)(admin)).toBe(true);
  });
});
