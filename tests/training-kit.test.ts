import { describe, expect, it } from "vitest";

import { memoGestures, printableUrl, timedProgramme } from "@/modules/training/lib/kit";

const programmes = [
  { profile: "conducteur", modules: [{ title: "Créer un chantier", minutes: 40, parcours: 1 }, { title: "Planifier", minutes: 30, parcours: 10 }] },
  { profile: "admin", modules: [{ title: "Paramétrer", minutes: 30, parcours: 2 }, { title: "Créer un chantier", minutes: 40, parcours: 1 }] },
];

describe("programme horodaté d'une séance", () => {
  it("profils dans l'ordre hiérarchique, module partagé une seule fois, calé sur l'horaire", () => {
    const r = timedProgramme(programmes, ["conducteur", "admin"], "09:00", "12:00");
    expect(r.modules.map((m) => [m.title, m.start, m.end])).toEqual([
      ["Paramétrer", "09:00", "09:30"],
      ["Créer un chantier", "09:30", "10:10"],
      ["Planifier", "10:10", "10:40"],
    ]);
    expect(r.totalMinutes).toBe(100);
    expect(r.overflow).toBe(0);
  });

  it("signale le dépassement du créneau sans rien couper", () => {
    const r = timedProgramme(programmes, ["admin", "conducteur"], "09:00", "10:00");
    expect(r.overflow).toBe(40);
    expect(r.modules).toHaveLength(3);
  });

  it("sans heure de début : pas d'heures inventées, la durée seule", () => {
    const r = timedProgramme(programmes, ["admin"], null, null);
    expect(r.modules[0]).toMatchObject({ start: "", end: "", minutes: 30 });
    expect(r.overflow).toBe(0);
  });

  it("profil sans programme : rien à horodater", () => {
    expect(timedProgramme(programmes, ["compagnon"], "09:00", "10:00").modules).toEqual([]);
  });
});

describe("mémo « Bien démarrer »", () => {
  it("six gestes au plus, avec leur page du support ; adresses lisibles sur papier", () => {
    const features = Array.from({ length: 8 }, (_, i) => ({ title: `Geste ${i + 1}`, slug: `geste-${i + 1}` }));
    const g = memoGestures([{ title: "", slug: "x" }, ...features], "https://support.tim-management.co/");
    expect(g).toHaveLength(6);
    expect(g[0]).toEqual({ title: "Geste 1", url: "https://support.tim-management.co/features/geste-1" });
    expect(printableUrl(g[0].url)).toBe("support.tim-management.co/features/geste-1");
  });
});
