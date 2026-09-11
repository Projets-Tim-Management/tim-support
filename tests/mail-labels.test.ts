import { describe, expect, it } from "vitest";

import { CONDITION_LABEL, SEND_CONDITIONS } from "@/modules/marketing/lib/due-emails";
import {
  EMAIL_KIND,
  PHASE_DE_TEST_EMAILS,
  emailKind,
  emailScheduleLabel,
} from "@/modules/marketing/lib/journey";

/**
 * Ce que la barre d'étapes DIT de chaque envoi : sa nature, son moment, sa
 * condition. Ces libellés sont la seule explication visible de « pourquoi ce
 * message est là » — un envoi sans libellé redevient une enveloppe muette.
 */
describe("nature des envois", () => {
  it("chaque e-mail du modèle a une nature", () => {
    for (const m of PHASE_DE_TEST_EMAILS) {
      expect(EMAIL_KIND[m.key], m.key).toBeTruthy();
    }
  });

  it("une clé inconnue reste lisible", () => {
    expect(emailKind("inconnu")).toBe("E-mail");
    expect(emailKind(null)).toBe("E-mail");
  });
});

describe("conditions d'envoi", () => {
  it("chaque condition du cron a sa phrase à l'écran", () => {
    for (const key of Object.keys(SEND_CONDITIONS)) {
      expect(CONDITION_LABEL[key], key).toBeTruthy();
    }
  });
});

describe("moment d'un envoi, en français", () => {
  it("compte les jours avant le démarrage", () => {
    expect(emailScheduleLabel({ anchor: "debut", offsetDays: -3 })).toBe(
      "3 jours avant le démarrage, à 8 h",
    );
  });

  it("dit « la veille » et « le lendemain » plutôt que ±1", () => {
    expect(emailScheduleLabel({ anchor: "session", offsetDays: -1, sendHour: "17:00" })).toBe(
      "la veille du créneau de prise en main, à 17 h",
    );
    expect(emailScheduleLabel({ anchor: "debut", offsetDays: 1 })).toBe(
      "le lendemain du démarrage, à 8 h",
    );
  });

  it("dit « le jour » pour un décalage nul, avec les minutes si besoin", () => {
    expect(emailScheduleLabel({ anchor: "fin", offsetDays: 0, sendHour: "08:30" })).toBe(
      "le jour de la fin du test, à 8 h 30",
    );
  });

  it("renvoie le fait déclencheur pour un envoi sur événement", () => {
    expect(emailScheduleLabel({ anchor: "aucun", trigger: "À la transmission du dossier" })).toBe(
      "À la transmission du dossier",
    );
    expect(emailScheduleLabel({ anchor: null })).toBeNull();
  });
});
