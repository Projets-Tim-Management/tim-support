import { describe, expect, it } from "vitest";

process.env.PAYLOAD_SECRET ??= "secret-de-test";

import { EMAIL_SLOTS } from "@/modules/marketing/lib/email-slots";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import {
  PHASE_DE_TEST_EMAILS,
  PHASE_DE_TEST_STEPS,
  computeEmailSchedule,
  isManualStep,
  isSystemStep,
  stepDueDate,
} from "@/modules/marketing/lib/journey";

/**
 * Le BILAN de fin de test : un second rendez-vous, que le client réserve.
 *
 * Il remplace « répondez avec deux créneaux qui vous arrangent » — un
 * aller-retour qui se perd, sur le rendez-vous qui décide justement de la
 * suite. Ce qui se vérifie ici : sa date lui est propre, et le rappel s'y
 * accroche.
 */

const CTX = {
  clientName: "Dupont BTP",
  contactFirstName: "Marie",
  startDate: "2026-09-07T00:00:00.000Z",
  endDate: "2026-10-05T00:00:00.000Z",
  sessionAt: "2026-09-04T08:00:00.000Z",
  sessionModality: "en visio",
  reviewAt: "2026-10-02T13:00:00.000Z",
  reviewLink: "https://meet.google.com/xyz",
};

describe("l'ancrage sur le créneau du bilan", () => {
  it("date le rappel la veille du BILAN, pas de la fin du test", () => {
    const due = stepDueDate(
      { anchor: "bilan", offsetDays: -1 },
      CTX.startDate,
      CTX.endDate,
      CTX.sessionAt,
      CTX.reviewAt,
    );
    expect(due?.slice(0, 10)).toBe("2026-10-01");
  });

  /**
   * Sans créneau réservé, il n'y a rien à quoi s'accrocher : le rappel n'a pas
   * de date, donc il ne part pas. Il en reçoit une le jour où le client réserve.
   */
  it("sans créneau réservé, le rappel n'a pas d'échéance", () => {
    expect(
      stepDueDate({ anchor: "bilan", offsetDays: -1 }, CTX.startDate, CTX.endDate, CTX.sessionAt, null),
    ).toBeNull();
  });

  it("ne confond pas le créneau du bilan et celui de la prise en main", () => {
    const bilan = stepDueDate({ anchor: "bilan", offsetDays: -1 }, null, null, CTX.sessionAt, CTX.reviewAt);
    const session = stepDueDate({ anchor: "session", offsetDays: -1 }, null, null, CTX.sessionAt, CTX.reviewAt);
    expect(bilan).not.toBe(session);
    expect(session?.slice(0, 10)).toBe("2026-09-03");
  });

  it("programme l'envoi du rappel à l'heure voulue", () => {
    const [mail] = computeEmailSchedule(
      [
        {
          key: "rappel-bilan",
          anchor: "bilan",
          offsetDays: -1,
          sendHour: "17:00",
          scheduledAt: null as string | null,
        },
      ],
      CTX.startDate,
      CTX.endDate,
      CTX.sessionAt,
      CTX.reviewAt,
    );
    expect(mail.scheduledAt).toBeTruthy();
    expect(
      new Date(mail.scheduledAt as string).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ).toBe("17:00");
  });
});

describe("les deux messages du bilan", () => {
  it("sont déclarés dans le modèle, avec un gabarit et des textes", () => {
    for (const key of ["bilan-confirme", "rappel-bilan"]) {
      const decl = (PHASE_DE_TEST_EMAILS as { key: string }[]).find((e) => e.key === key);
      expect(decl, key).toBeTruthy();
      expect(JOURNEY_EMAILS[key], key).toBeTypeOf("function");
      expect(EMAIL_SLOTS[key], key).toBeTruthy();
    }
  });

  /**
   * Chaque message sous l'étape dont il PARLE, pas sous la plus proche par la
   * date. Quatre enveloppes s'étaient accumulées sur « Bilan de fin de test »,
   * dont une qui annonçait l'extinction des accès (09/09/2026).
   */
  it("se rangent sous l'étape dont ils parlent", () => {
    const stepOf = (key: string) =>
      (PHASE_DE_TEST_EMAILS as { key: string; stepKey?: string }[]).find((e) => e.key === key)
        ?.stepKey;

    // Demander un créneau et confirmer sa réservation : l'étape « réservé ».
    expect(stepOf("fin-proche")).toBe("rdv-bilan");
    expect(stepOf("bilan-confirme")).toBe("rdv-bilan");
    // Le rappel annonce le rendez-vous lui-même.
    expect(stepOf("rappel-bilan")).toBe("bilan");
    // « Vos accès s'arrêtent » ne parle pas du bilan : il mène à la décision.
    expect(stepOf("dernier-jour")).toBe("decision");
  });

  it("« Bilan réservé » se constate, elle ne se coche pas à la main", () => {
    const step = PHASE_DE_TEST_STEPS.find((s) => s.key === "rdv-bilan");
    expect(step, "l'étape doit exister").toBeTruthy();
    expect(step?.actor).toBe("client");
    expect(isSystemStep("rdv-bilan")).toBe(true);
    expect(isManualStep({ key: "rdv-bilan" })).toBe(false);
    // Et elle précède le bilan : on réserve avant de le tenir.
    const ordre = PHASE_DE_TEST_STEPS.map((s) => s.key);
    expect(ordre.indexOf("rdv-bilan")).toBeLessThan(ordre.indexOf("bilan"));
  });

  it("la confirmation part sur événement, jamais sur une date", () => {
    // Datée, elle partirait même sans rendez-vous réservé.
    const decl = (PHASE_DE_TEST_EMAILS as { key: string; anchor?: string }[]).find(
      (e) => e.key === "bilan-confirme",
    );
    expect(decl?.anchor ?? "aucun").toBe("aucun");
  });

  it("annoncent la date, la durée et le lien de visio", () => {
    for (const key of ["bilan-confirme", "rappel-bilan"]) {
      const mail = JOURNEY_EMAILS[key](CTX);
      expect(mail.text, key).toMatch(/octobre/);
      expect(mail.text, key).toContain("30 minutes");
      expect(mail.html, key).toContain("https://meet.google.com/xyz");
    }
  });

  it("tiennent debout sans créneau ni lien", () => {
    for (const key of ["bilan-confirme", "rappel-bilan"]) {
      const mail = JOURNEY_EMAILS[key]({ clientName: "Dupont BTP" });
      expect(mail.text, key).not.toMatch(/undefined|\bnull\b/);
      expect(mail.html, key).not.toMatch(/undefined|\bnull\b/);
    }
  });
});

describe("« Votre test se termine dans 5 jours »", () => {
  const mail = JOURNEY_EMAILS["fin-proche"](CTX);

  it("mène à la prise de rendez-vous au lieu de demander deux créneaux", () => {
    expect(mail.html).toContain("/espace-client/bilan");
    expect(mail.text).toContain("/espace-client/bilan");
  });

  /**
   * Le repli compte autant que le bouton : le partenaire peut n'avoir aucun
   * créneau libre, ou avoir coupé la prise de rendez-vous. Sans cette phrase, le
   * client se retrouve devant une page vide et sans recours.
   */
  it("garde une porte de sortie si aucun créneau ne convient", () => {
    expect(mail.text).toMatch(/répondez à cet e-mail/i);
  });
});
