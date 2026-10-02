import { describe, expect, it } from "vitest";

import { Trainings } from "@/modules/training/collections/Trainings";
import { TrainingDays } from "@/modules/training/collections/TrainingDays";
import { TrainingSessions } from "@/modules/training/collections/TrainingSessions";
import {
  MINUTES_PER_FEATURE,
  isTrainingClosed,
  moduleTitle,
  programmesFromParcours,
  trainingBeforeActivation,
} from "@/modules/training/lib/training";

describe("programmesFromParcours — brouillon du programme type", () => {
  const parcours = [
    { id: 7, title: "Parcours 2 — Ouvrir l'outil à l'équipe", profil: "admin", order: 2, steps: [1, 2, 3] },
    { id: 2, title: "Parcours 1 — Premiers pas & configuration", profil: "admin", order: 1, steps: [4, 5] },
    { id: 8, title: "Parcours 2.1 — Pointer votre équipe (Chrono)", profil: "chef-chantier", order: 2, steps: [6] },
    { id: 4, title: "Vos premiers pas", profil: "compagnon", order: 1, steps: [] },
    { id: 9, title: null, profil: "compagnon", order: 2, steps: [7] },
  ];
  const byProfile = () => Object.fromEntries(programmesFromParcours(parcours).map((p) => [p.profile, p.modules]));

  it("rend un programme par profil de licence, dans l'ordre hiérarchique", () => {
    expect(programmesFromParcours(parcours).map((p) => p.profile)).toEqual([
      "admin",
      "conducteur",
      "chefChantier",
      "chefEquipe",
      "compagnon",
    ]);
  });

  it("un module par parcours, dans l'ordre, durée = fonctionnalités × 10 min", () => {
    expect(byProfile().admin).toEqual([
      { title: "Premiers pas & configuration", minutes: 2 * MINUTES_PER_FEATURE, parcours: 2 },
      { title: "Ouvrir l'outil à l'équipe", minutes: 3 * MINUTES_PER_FEATURE, parcours: 7 },
    ]);
  });

  it("donne au chef d'équipe le parcours du chef de chantier", () => {
    expect(byProfile().chefEquipe).toEqual(byProfile().chefChantier);
    expect(byProfile().chefChantier[0].title).toBe("Pointer votre équipe (Chrono)");
  });

  it("laisse vide un profil sans parcours, écarte un parcours sans titre", () => {
    expect(byProfile().conducteur).toEqual([]);
    expect(byProfile().compagnon).toEqual([{ title: "Vos premiers pas", minutes: MINUTES_PER_FEATURE, parcours: 4 }]);
  });

  it("retire le préfixe éditorial du titre", () => {
    expect(moduleTitle("Parcours 4 — Piloter l'activité")).toBe("Piloter l'activité");
    expect(moduleTitle("Parcours 2.2 - Standard")).toBe("Standard");
    expect(moduleTitle("Sans préfixe")).toBe("Sans préfixe");
  });
});

describe("règles du parcours formation", () => {
  it("avertit tant que la fiche n'est pas « Gagnée »", () => {
    expect(trainingBeforeActivation("en-signature")).toBe(true);
    expect(trainingBeforeActivation(undefined)).toBe(true);
    expect(trainingBeforeActivation("actif")).toBe(false);
  });

  it("une formation terminée ou annulée est close", () => {
    expect(isTrainingClosed("ouvert")).toBe(false);
    expect(isTrainingClosed("termine")).toBe(true);
    expect(isTrainingClosed("annule")).toBe(true);
  });
});

describe("droits — seul TIM écrit, le partenaire-métier lit ses clients", () => {
  const admin = { id: 1, roles: ["admin"] };
  const metier = { id: 2, roles: ["partner-metier"], partner: 7 };
  const support = { id: 3, roles: ["support"] };
  const call = (fn: unknown, user: unknown) =>
    (fn as (a: { req: { user: unknown } }) => unknown)({ req: { user } });

  for (const collection of [Trainings, TrainingDays, TrainingSessions]) {
    it(`${collection.slug}`, () => {
      const a = collection.access!;
      expect(call(a.read, admin)).toBe(true);
      expect(call(a.read, metier)).toEqual({ partner: { equals: 7 } });
      expect(call(a.read, support)).toBe(false);
      for (const op of [a.create, a.update, a.delete]) {
        expect(call(op, admin)).toBe(true);
        expect(call(op, metier)).toBe(false);
      }
    });
  }
});
