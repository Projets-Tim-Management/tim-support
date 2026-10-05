import { describe, expect, it } from "vitest";

import { JOURNEY_MEETINGS, meetingTask } from "@/modules/marketing/lib/journey-tasks";

const session = JOURNEY_MEETINGS.find((m) => m.step === "prise-en-main")!;
const bilan = JOURNEY_MEETINGS.find((m) => m.step === "bilan")!;

describe("rendez-vous de la phase de test en tâche", () => {
  it("pas de créneau réservé, pas de tâche", () => {
    expect(meetingTask({ id: 1 }, session)).toBeNull();
    expect(meetingTask({ id: 1, sessionAt: "2026-10-12T08:00:00.000Z" }, bilan)).toBeNull();
  });

  it("la tâche porte la date du créneau et sa modalité", () => {
    const t = meetingTask(
      { id: 1, sessionAt: "2026-10-12T08:00:00.000Z", sessionMode: "sur-place", sessionLocation: "12 rue des Lilas" },
      session,
    )!;
    expect(t.dueDate).toBe("2026-10-12T08:00:00.000Z");
    expect(t.content).toContain("sur site — 12 rue des Lilas");
    expect(t.done).toBe(false);
  });

  it("le bilan prend son propre créneau et son propre lien", () => {
    const t = meetingTask(
      { id: 1, sessionAt: "2026-10-12T08:00:00.000Z", reviewAt: "2026-11-10T13:00:00.000Z", sessionMode: "visio", reviewLink: "https://meet" },
      bilan,
    )!;
    expect(t.dueDate).toBe("2026-11-10T13:00:00.000Z");
    expect(t.content).toContain("en visio (lien fourni)");
  });

  it("la coche suit l'étape « réalisée », pas la réservation", () => {
    const run = {
      id: 1,
      sessionAt: "2026-10-12T08:00:00.000Z",
      steps: [
        { key: "rdv-prise-en-main", state: "fait" },
        { key: "prise-en-main", state: "a-faire" },
      ],
    };
    expect(meetingTask(run, session)!.done).toBe(false);
    run.steps[1].state = "fait";
    expect(meetingTask(run, session)!.done).toBe(true);
  });
});
