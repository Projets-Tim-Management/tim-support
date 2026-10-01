import { describe, expect, it } from "vitest";

import { checklistProgress, customKey, dayChecklist } from "@/modules/training/lib/checklist";

const contacts = [
  { id: 1, firstName: "Alice", lastName: "A", email: "a@x.fr", licenceProfile: "admin", timPassword: "••••••" },
  { id: 2, firstName: "Bruno", lastName: "B", email: null, licenceProfile: "conducteur", timPassword: null },
];
const base = {
  day: { id: 1, date: "2026-10-14T12:00:00.000Z", mode: "sur-place", location: "Lyon", trainer: 3, trainerName: "Charlie" },
  sessions: [{ id: 1, day: 1, profiles: ["admin"], participants: [1, 2], status: "planifiee" }],
  contacts,
};
const byKey = (items: ReturnType<typeof dayChecklist>) => Object.fromEntries(items.map((i) => [i.key, i]));

describe("checklist de préparation", () => {
  it("constats : cochés par le logiciel, avec ce qui manque", () => {
    const c = byKey(dayChecklist(base));
    expect(c.date.done).toBe(true);
    expect(c.lieu).toMatchObject({ label: "Adresse renseignée", done: true });
    expect(c.formateur).toMatchObject({ done: true, hint: "Charlie" });
    expect(c["mots-de-passe"]).toMatchObject({ done: false, hint: "manquant : Bruno B" });
    expect(c.emails).toMatchObject({ done: false, hint: "1 personne non convocable" });
    expect(c.convocation).toMatchObject({ kind: "constat", done: false });
  });

  it("convocation partie ou annulée : faite", () => {
    const c = byKey(
      dayChecklist({ ...base, day: { ...base.day, emails: [{ key: "convocation", sentAt: "2026-10-07" }, { key: "recap-referent", cancelledAt: "2026-10-06" }] } }),
    );
    expect(c.convocation.done).toBe(true);
    expect(c["recap-referent"]).toMatchObject({ done: true, hint: "annulé (vu autrement)" });
  });

  it("gestes selon le mode, cochés à la main, points ajoutés", () => {
    const items = dayChecklist({
      ...base,
      day: {
        ...base.day,
        mode: "distance",
        link: "",
        checklist: { done: { "lien-teste": { at: "2026-10-10", by: "Charlie" } }, custom: [{ key: "perso-cafe", label: "Café prévu" }] },
      },
    });
    const c = byKey(items);
    expect(c.lieu).toMatchObject({ label: "Lien de visio renseigné", done: false });
    expect(c["lien-teste"]).toMatchObject({ kind: "geste", done: true, hint: "coché par Charlie" });
    expect(c.salle).toBeUndefined();
    expect(c["perso-cafe"]).toMatchObject({ custom: true, done: false });
    expect(checklistProgress(items).total).toBe(items.length);
  });

  it("clé d'un point ajouté : lisible et unique", () => {
    expect(customKey("Café & croissants", [])).toBe("perso-cafe-croissants");
    expect(customKey("Café & croissants", ["perso-cafe-croissants"])).toBe("perso-cafe-croissants-2");
  });
});
