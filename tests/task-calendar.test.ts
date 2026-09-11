import { describe, expect, it } from "vitest";

import {
  DEFAULT_TASK_EVENT_MINUTES,
  eventMinutes,
  eventNeedsSync,
  eventSummary,
  taskSyncPatch,
  wantsEvent,
} from "@/modules/partner/lib/task-calendar";

/**
 * Le double d'une tâche dans l'agenda du partenaire : QUAND il doit exister,
 * et QUAND une modification oblige à reparler à l'agenda. Le reste (appels au
 * fournisseur) n'est pas testable sans réseau ; ces règles le sont.
 */
const base = {
  id: 12,
  type: "tache",
  partner: 3,
  title: "Rappeler le gérant",
  dueDate: "2026-09-14T08:00:00.000Z",
  calendarSync: true,
};

describe("wantsEvent", () => {
  it("une tâche demandée, avec échéance", () => {
    expect(wantsEvent(base)).toBe(true);
  });
  it("rien sans demande, sans échéance, ou hors tâche", () => {
    expect(wantsEvent({ ...base, calendarSync: false })).toBe(false);
    expect(wantsEvent({ ...base, dueDate: null })).toBe(false);
    expect(wantsEvent({ ...base, type: "note" })).toBe(false);
  });
});

describe("eventSummary", () => {
  it("la tâche, puis pour qui", () => {
    expect(eventSummary(base, "Instalclim")).toBe("Rappeler le gérant — Instalclim");
    expect(eventSummary(base, null)).toBe("Rappeler le gérant");
  });
  it("à défaut de titre, la nature de la tâche", () => {
    expect(eventSummary({ ...base, title: "", taskKind: "appel" }, "Instalclim")).toMatch(/— Instalclim$/);
  });
});

describe("eventNeedsSync", () => {
  it("création : demandée et jamais créée", () => {
    expect(eventNeedsSync(undefined, base)).toBe(true);
  });
  it("rattrapage : demandée, enregistrée, mais sans événement (agenda connecté après coup)", () => {
    expect(eventNeedsSync(base, base)).toBe(true);
    expect(eventNeedsSync({ ...base, calendarEventId: "e1" }, { ...base, calendarEventId: "e1" })).toBe(false);
  });
  it("échéance ou titre déplacés : on reparle à l'agenda", () => {
    const before = { ...base, calendarEventId: "e1" };
    expect(eventNeedsSync(before, { ...before, dueDate: "2026-09-15T08:00:00.000Z" })).toBe(true);
    expect(eventNeedsSync(before, { ...before, title: "Rappeler la comptable" })).toBe(true);
  });
  it("notes et nature entrent dans l'événement : on le met à jour", () => {
    const before = { ...base, calendarEventId: "e1", content: "a", taskKind: "appel" };
    expect(eventNeedsSync(before, { ...before, content: "b" })).toBe(true);
    expect(eventNeedsSync(before, { ...before, taskKind: "reunion" })).toBe(true);
  });
  it("un enregistrement sans changement utile : l'agenda n'est pas sollicité", () => {
    const before = { ...base, calendarEventId: "e1", content: "a" };
    expect(eventNeedsSync(before, { ...before })).toBe(false);
  });
  it("retrait de la demande : suppression", () => {
    const before = { ...base, calendarEventId: "e1" };
    expect(eventNeedsSync(before, { ...before, calendarSync: false })).toBe(true);
  });
  it("jamais demandée, toujours pas demandée : rien", () => {
    const off = { ...base, calendarSync: false };
    expect(eventNeedsSync(off, { ...off, dueDate: "2026-09-20T08:00:00.000Z" })).toBe(false);
  });
});

describe("eventMinutes", () => {
  it("5 min par défaut : un rappel, pas un rendez-vous", () => {
    expect(DEFAULT_TASK_EVENT_MINUTES).toBe(5);
    expect(eventMinutes({})).toBe(5);
    expect(eventMinutes({ calendarMinutes: null })).toBe(5);
  });
  it("prend une durée de la liste, refuse le reste", () => {
    expect(eventMinutes({ calendarMinutes: 45 })).toBe(45);
    expect(eventMinutes({ calendarMinutes: 60 })).toBe(60);
    expect(eventMinutes({ calendarMinutes: 7 })).toBe(5);
  });
  it("un changement de durée resynchronise l'événement", () => {
    const before = { ...base, calendarEventId: "e1", calendarMinutes: 5 };
    expect(eventNeedsSync(before, { ...before, calendarMinutes: 30 })).toBe(true);
  });
});

describe("taskSyncPatch", () => {
  it("n'écrit que ce que la synchronisation a décidé", () => {
    expect(taskSyncPatch({ action: "none" })).toEqual({});
    expect(taskSyncPatch({ action: "deleted", eventId: null, link: null })).toEqual({
      calendarEventId: null,
      calendarLink: null,
    });
    expect(taskSyncPatch({ action: "created", eventId: "e2", link: "https://cal" })).toEqual({
      calendarEventId: "e2",
      calendarLink: "https://cal",
    });
  });
});
