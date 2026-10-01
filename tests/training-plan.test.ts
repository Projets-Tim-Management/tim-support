import { describe, expect, it } from "vitest";

import {
  FORMULAS,
  draftFromFormula,
  matchingContacts,
  planSteps,
  planWarnings,
  sessionsOfDay,
  sortDays,
  type PlanContact,
  type PlanDay,
  type PlanSession,
} from "@/modules/training/lib/plan";

const contacts: PlanContact[] = [
  { id: 1, firstName: "Alice", lastName: "Admin", email: "a@x.fr", licenceProfile: "admin" },
  { id: 2, firstName: "Bruno", lastName: "Conduc", email: "b@x.fr", licenceProfile: "conducteur" },
  { id: 3, firstName: "Chloé", lastName: "Chef", email: null, licenceProfile: "chefChantier" },
  { id: 4, firstName: "Denis", lastName: "Chef", email: "d@x.fr", licenceProfile: "chefChantier" },
  { id: 5, firstName: "Eve", lastName: "Sansprofil", email: "e@x.fr", licenceProfile: null },
];

const day = (id: number, date: string | null, extra: Partial<PlanDay> = {}): PlanDay => ({
  id,
  date: date ? `${date}T12:00:00.000Z` : null,
  mode: "sur-place",
  location: "Siège",
  ...extra,
});

const session = (id: number, dayId: number, extra: Partial<PlanSession> = {}): PlanSession => ({
  id,
  day: dayId,
  startTime: "09:00",
  endTime: "12:00",
  profiles: ["admin"],
  participants: [1],
  status: "planifiee",
  ...extra,
});

describe("ordre du plan", () => {
  it("journées datées dans l'ordre, puis les non datées", () => {
    const sorted = sortDays([day(1, null), day(2, "2026-10-21"), day(3, "2026-10-14")]);
    expect(sorted.map((d) => d.id)).toEqual([3, 2, 1]);
  });

  it("séances d'une journée par heure de début", () => {
    const s = [session(1, 9, { startTime: "14:00" }), session(2, 9, { startTime: "09:00" }), session(3, 8)];
    expect(sessionsOfDay(s, 9).map((x) => x.id)).toEqual([2, 1]);
  });
});

describe("étapes constatées", () => {
  it("plan vide : rien n'est fait", () => {
    expect(planSteps([], []).map((s) => s.done)).toEqual([false, false, false]);
  });

  it("une séance sans participant ni date : seul le plan est défini", () => {
    const steps = planSteps([day(1, null)], [session(1, 1, { participants: [] })]);
    expect(steps.map((s) => s.done)).toEqual([true, false, false]);
  });

  it("tout est fait quand chaque séance a ses participants et chaque journée utilisée sa date", () => {
    const steps = planSteps([day(1, "2026-10-14"), day(2, null)], [session(1, 1)]);
    // La journée 2, vide, ne compte pas.
    expect(steps.every((s) => s.done)).toBe(true);
  });

  it("une séance annulée ne compte pas", () => {
    const steps = planSteps([day(1, "2026-10-14")], [session(1, 1, { status: "annulee" })]);
    expect(steps[0].done).toBe(false);
  });
});

describe("points d'attention", () => {
  const texts = (days: PlanDay[], sessions: PlanSession[]) => planWarnings(days, sessions, contacts).map((w) => w.text);

  it("créneau inversé, chevauchement et séance vide", () => {
    const t = texts(
      [day(1, "2026-10-14")],
      [
        session(1, 1, { startTime: "09:00", endTime: "12:00" }),
        session(2, 1, { startTime: "11:00", endTime: "10:00", participants: [] }),
      ],
    );
    expect(t).toContain("La séance finit avant de commencer.");
    expect(t).toContain("Chevauche la séance de 09:00–12:00.");
    expect(t).toContain("Aucun participant.");
  });

  it("chefs de chantier formés avant l'admin, sur des journées datées", () => {
    const t = texts(
      [day(1, "2026-10-14"), day(2, "2026-10-21")],
      [session(1, 1, { profiles: ["chefChantier"], participants: [4] }), session(2, 2, { profiles: ["admin"] })],
    );
    expect(t.some((x) => x.startsWith("Admin formé après chef de chantier"))).toBe(true);
  });

  it("pas d'avis d'ordre entre journées non datées", () => {
    const t = texts(
      [day(1, null), day(2, null)],
      [session(1, 1, { profiles: ["chefChantier"], participants: [4] }), session(2, 2, { profiles: ["admin"] })],
    );
    expect(t.some((x) => x.includes("formé après"))).toBe(false);
  });

  it("personne attendue à deux séances simultanées, contact sans e-mail, visio sans lien", () => {
    const t = texts(
      [day(1, "2026-10-14", { mode: "distance", link: "" }), day(2, "2026-10-14")],
      [session(1, 1, { participants: [3] }), session(2, 1, { startTime: "10:00", endTime: "11:00", participants: [3] })],
    );
    expect(t).toContain("Chloé Chef figure dans deux séances en même temps.");
    expect(t).toContain("Chloé Chef n'a pas d'adresse e-mail : pas de convocation possible.");
    expect(t).toContain("Journée à distance sans lien de visio.");
  });
});

describe("formules", () => {
  const byKey = (k: string) => FORMULAS.find((f) => f.key === k)!;

  it("Admin + conducteurs, puis chefs de chantier : une journée, matin puis après-midi", () => {
    const draft = draftFromFormula(byKey("admin-cdt-puis-cdc"), contacts);
    expect(draft).toHaveLength(1);
    expect(draft[0]).toEqual([
      { profiles: ["admin", "conducteur"], participants: [1, 2], startTime: "09:00", endTime: "12:00" },
      { profiles: ["chefChantier"], participants: [3, 4], startTime: "14:00", endTime: "17:00" },
    ]);
  });

  it("un groupe par profil : les profils absents du client sont écartés, deux séances par journée", () => {
    const draft = draftFromFormula(byKey("par-profil"), contacts);
    expect(draft.map((d) => d.map((s) => s.profiles[0]))).toEqual([["admin", "conducteur"], ["chefChantier"]]);
  });

  it("client sans contact profilé : la formule reste entière, participants à choisir", () => {
    const draft = draftFromFormula(byKey("admin-cdt-puis-cdc"), [{ id: 9, licenceProfile: null }]);
    expect(draft[0].map((s) => s.participants)).toEqual([[], []]);
  });

  it("contacts attendus d'une séance : ses profils, dans l'ordre hiérarchique", () => {
    expect(matchingContacts(contacts, ["chefChantier", "admin"]).map((c) => c.id)).toEqual([1, 3, 4]);
  });
});

describe("groupe déduit des participants", () => {
  it("profils des participants, dans l'ordre hiérarchique", async () => {
    const { profilesOf } = await import("@/modules/training/lib/plan");
    expect(profilesOf([3, 1], contacts)).toEqual(["admin", "chefChantier"]);
  });

  it("sans participant profilé, garde les profils d'avant", async () => {
    const { profilesOf } = await import("@/modules/training/lib/plan");
    expect(profilesOf([5], contacts, ["compagnon"])).toEqual(["compagnon"]);
    expect(profilesOf([], contacts, ["admin"])).toEqual(["admin"]);
  });

  it("nom d'usage et ordre du déroulé", async () => {
    const { chronoSessions, sessionTitle } = await import("@/modules/training/lib/plan");
    expect(sessionTitle(["admin", "conducteur"])).toBe("Admin + Conducteur de travaux");
    const order = chronoSessions(
      [day(1, "2026-10-21"), day(2, "2026-10-14")],
      [session(1, 1), session(2, 2, { startTime: "14:00" }), session(3, 2, { startTime: "09:00" }), session(4, 2, { status: "annulee" })],
    );
    expect(order.map((o) => [o.session.id, o.dayIndex])).toEqual([[3, 1], [2, 1], [1, 2]]);
  });
});
