import { describe, expect, it } from "vitest";

import { attemptsSummary, nextAttemptDate } from "@/modules/partner/lib/task-attempts";

const paris = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

describe("le prochain essai après un appel sans réponse", () => {
  it("revient le lendemain ouvré, à la même heure", () => {
    // Mercredi 16 sept. 14:30 (Paris), appel manqué le jour même.
    const next = nextAttemptDate("2026-09-16T12:30:00.000Z", Date.parse("2026-09-16T12:35:00.000Z"));
    expect(paris(next)).toBe("jeu. 17 14:30");
  });
  it("un vendredi revient le lundi", () => {
    const next = nextAttemptDate("2026-09-18T14:00:00.000Z", Date.parse("2026-09-18T14:05:00.000Z"));
    expect(paris(next)).toBe("lun. 21 16:00");
  });
  it("une tâche en retard repart d'aujourd'hui, pas de son échéance passée", () => {
    // Échéance le 10, appel tenté le 16 : reprise le 17, pas le 11.
    const next = nextAttemptDate("2026-09-10T08:00:00.000Z", Date.parse("2026-09-16T15:00:00.000Z"));
    expect(paris(next)).toBe("jeu. 17 10:00");
  });
  it("une tâche déjà prévue plus tard garde sa date", () => {
    // Prévue lundi 21 à 9 h, essai le vendredi 18 : elle reste lundi 21.
    const next = nextAttemptDate("2026-09-21T07:00:00.000Z", Date.parse("2026-09-18T13:30:00.000Z"));
    expect(next).toBe("2026-09-21T07:00:00.000Z");
  });
  it("sans échéance : demain 9 h", () => {
    const next = nextAttemptDate(null, Date.parse("2026-09-16T15:00:00.000Z"));
    expect(paris(next)).toBe("jeu. 17 09:00");
  });
});

describe("le résumé des essais", () => {
  it("compte et date le dernier", () => {
    expect(attemptsSummary([{ at: "2026-09-15T08:00:00.000Z" }, { at: "2026-09-16T12:32:00.000Z" }])).toBe("2 essais sans réponse · dernier 16 sept. 14:32");
    expect(attemptsSummary([])).toBeNull();
  });
});
