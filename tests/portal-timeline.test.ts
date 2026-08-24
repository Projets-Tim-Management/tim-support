import { describe, expect, it } from "vitest";

import { portalTimeline, testTimeline } from "@/modules/marketing/lib/portal-timeline";

/**
 * Frise de la phase de test, côté espace client.
 *
 * Ce qui compte ici n'est pas la jolie barre mais le fait qu'elle ne MENTE
 * jamais : pas de test « commencé » avant sa date, pas de curseur au-delà de la
 * fin, et jamais un « jour 0 ».
 */

const run = { startDate: "2026-08-31T00:00:00.000Z", endDate: "2026-09-28T00:00:00.000Z" };
const at = (iso: string) => Date.parse(iso);

describe("frise de la phase de test", () => {
  it("avant le démarrage : rien n'est commencé, le curseur reste à gauche", () => {
    const t = testTimeline(run, at("2026-08-24T09:00:00.000Z"));
    expect(t.started).toBe(false);
    expect(t.elapsedPct).toBe(0);
    expect(t.daysToStart).toBe(7);
  });

  it("le jour même du démarrage : jour 1, et plus aucun jour à attendre", () => {
    const t = testTimeline(run, at("2026-08-31T08:00:00.000Z"));
    expect(t.started).toBe(true);
    expect(t.daysToStart).toBe(0);
    expect(t.dayOfTest).toBe(1);
    expect(t.totalDays).toBe(28);
  });

  it("à mi-parcours : le curseur est au milieu", () => {
    const t = testTimeline(run, at("2026-09-14T00:00:00.000Z"));
    expect(Math.round(t.elapsedPct)).toBe(50);
    expect(t.dayOfTest).toBe(15);
  });

  it("après la fin : le curseur est borné à 100, pas au-delà", () => {
    const t = testTimeline(run, at("2026-12-01T00:00:00.000Z"));
    expect(t.elapsedPct).toBe(100);
    expect(t.finished).toBe(true);
  });

  it("sans dates : aucune frise, et aucun calcul aberrant", () => {
    for (const bad of [undefined, null, {}, { startDate: run.startDate }, { startDate: run.endDate, endDate: run.startDate }]) {
      const t = testTimeline(bad as never, at("2026-08-24T00:00:00.000Z"));
      expect(t.hasDates).toBe(false);
      expect(t.elapsedPct).toBe(0);
    }
  });
});

describe("jalons montrés au client sur la frise", () => {
  const steps = [
    { key: "rdv-prise-en-main", anchor: "debut", offsetDays: -7 },
    { key: "dossier-demarrage", anchor: "debut", offsetDays: -5 },
    { key: "remise-acces", anchor: "debut", offsetDays: 1 },
    { key: "bilan", anchor: "fin", offsetDays: -3 },
    // Étape interne à TIM : elle ne doit PAS apparaître côté client.
    { key: "provisionnement", anchor: "debut", offsetDays: -1 },
  ];
  const full = { ...run, steps };

  it("montre les jalons du client, et eux seuls", () => {
    const t = portalTimeline(full, at("2026-08-24T09:00:00.000Z"));
    expect(t.milestones.map((m) => m.key)).toEqual([
      "rdv-prise-en-main",
      "dossier-demarrage",
      "debut",
      "remise-acces",
      "bilan",
      "fin",
    ]);
  });

  it("la frise commence à la PRÉPARATION, pas au démarrage", () => {
    const t = portalTimeline(full, at("2026-08-24T09:00:00.000Z"));
    // Le premier jalon (créneau, démarrage −7) ouvre l'échelle…
    expect(t.milestones[0].pct).toBe(0);
    // …et le démarrage tombe donc APRÈS le début de la frise, pas à 0.
    expect(t.milestones.find((m) => m.key === "debut")!.pct).toBeGreaterThan(0);
    expect(t.milestones.at(-1)!.pct).toBe(100);
  });

  it("un seul jalon est « le prochain », et c'est le premier NON FAIT", () => {
    // 25 août : la date du créneau (24) est passée, mais rien n'a été réservé.
    // Il reste donc à faire — et c'est bien lui qu'on met en avant, pas le
    // suivant. Une échéance manquée ne disparaît pas parce qu'elle est passée.
    const t = portalTimeline(full, at("2026-08-25T09:00:00.000Z"));
    const next = t.milestones.filter((m) => m.next);
    expect(next).toHaveLength(1);
    expect(next[0].key).toBe("rdv-prise-en-main");
    expect(next[0].late).toBe(true);

    // Réservé, il s'efface : le prochain devient l'échéance du dossier.
    const apres = portalTimeline(
      { ...full, sessionAt: "2026-08-28T09:00:00.000Z" },
      at("2026-08-25T09:00:00.000Z"),
    );
    expect(apres.milestones.find((m) => m.next)!.key).toBe("dossier-demarrage");
  });

  it("le créneau réservé prime sur la date théorique de l'étape", () => {
    const t = portalTimeline(
      { ...full, sessionAt: "2026-08-27T13:00:00.000Z" },
      at("2026-08-24T09:00:00.000Z"),
    );
    const session = t.milestones.find((m) => m.key === "rdv-prise-en-main")!;
    expect(session.date).toBe("2026-08-27T13:00:00.000Z");
    // Et l'ordre suit : réservé au 27, il passe après le dossier (26).
    expect(t.milestones.map((m) => m.key).indexOf("rdv-prise-en-main")).toBe(1);
  });

  it("chaque jalon porte une explication écrite pour le client", () => {
    const t = portalTimeline(full, at("2026-08-24T09:00:00.000Z"));
    for (const m of t.milestones) {
      expect(m.label, m.key).toBeTruthy();
      expect(m.hint.length, m.key).toBeGreaterThan(30);
    }
  });

  it("sans dates : aucun jalon, et rien qui plante", () => {
    expect(portalTimeline(null, at("2026-08-24T00:00:00.000Z")).milestones).toEqual([]);
  });
});

describe("session de prise en main : réservée n'est pas suivie", () => {
  const base = { ...run, sessionAt: "2026-08-27T09:00:00.000Z" };

  it("avant l'heure du rendez-vous, la session n'est pas passée", () => {
    expect(portalTimeline(base, at("2026-08-27T08:59:00.000Z")).sessionPast).toBe(false);
  });

  it("après l'heure, elle l'est — c'est ce qui déclenche « en attente du formateur »", () => {
    expect(portalTimeline(base, at("2026-08-27T09:01:00.000Z")).sessionPast).toBe(true);
  });

  it("sans créneau réservé, jamais passée", () => {
    expect(portalTimeline(run, at("2026-12-01T00:00:00.000Z")).sessionPast).toBe(false);
  });

  it("répond même sans dates de test, où la frise n'existe pas", () => {
    const t = portalTimeline({ sessionAt: "2026-08-27T09:00:00.000Z" }, at("2026-08-28T00:00:00.000Z"));
    expect(t.hasDates).toBe(false);
    expect(t.sessionPast).toBe(true);
  });
});

describe("la frise suit ce qui est FAIT, pas seulement l'horloge", () => {
  const steps = [
    { key: "rdv-prise-en-main", anchor: "debut", offsetDays: -7 },
    { key: "dossier-demarrage", anchor: "debut", offsetDays: -5 },
    { key: "remise-acces", anchor: "debut", offsetDays: 1 },
    { key: "bilan", anchor: "fin", offsetDays: -3 },
  ];
  const avant = at("2026-08-24T09:00:00.000Z"); // une semaine avant le démarrage
  const base = { ...run, steps };

  it("un créneau réservé allume son jalon AVANT sa date", () => {
    const sans = portalTimeline(base, avant);
    expect(sans.milestones.find((m) => m.key === "rdv-prise-en-main")!.done).toBe(false);

    const avec = portalTimeline({ ...base, sessionAt: "2026-08-28T09:00:00.000Z" }, avant);
    expect(avec.milestones.find((m) => m.key === "rdv-prise-en-main")!.done).toBe(true);
  });

  it("un dossier transmis allume le sien, et fait avancer le « prochain »", () => {
    const t = portalTimeline({ ...base, sessionAt: "2026-08-28T09:00:00.000Z" }, avant, {
      dossierDone: true,
    });
    expect(t.milestones.find((m) => m.key === "dossier-demarrage")!.done).toBe(true);
    // Les deux gestes du client étant faits, le prochain jalon est le démarrage.
    expect(t.milestones.find((m) => m.next)!.key).toBe("debut");
  });

  it("une date passée sans le fait est un RETARD, pas un acquis", () => {
    // Au 27, l'échéance du dossier (26) est dépassée et rien n'a été transmis.
    const t = portalTimeline(base, at("2026-08-27T09:00:00.000Z"));
    const dossier = t.milestones.find((m) => m.key === "dossier-demarrage")!;
    expect(dossier.past).toBe(true);
    expect(dossier.done).toBe(false);
    expect(dossier.late).toBe(true);
  });

  it("les jalons qui ARRIVENT restent datés : démarrage, bilan, fin", () => {
    const t = portalTimeline(base, at("2026-09-01T09:00:00.000Z"));
    // Le test a démarré le 31 : le jalon « démarrage » est acquis par sa date.
    expect(t.milestones.find((m) => m.key === "debut")!.done).toBe(true);
    expect(t.milestones.find((m) => m.key === "fin")!.done).toBe(false);
  });
});
