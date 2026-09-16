import { describe, expect, it } from "vitest";

import { NOT_BEFORE_DUE, tooEarlyToValidate, validationOpensOn } from "@/modules/marketing/lib/journey";

/**
 * Une étape DATÉE ne se coche pas avant son jour.
 *
 * Constaté sur SOUVET VMB le 16/09/2026 : le relevé d'usage « avant bilan »,
 * prévu le 21, proposait sa case le 16. Coché en avance, un relevé ne
 * constate rien — c'est le jour qui fait la valeur de la case.
 */
const RUN = { startDate: "2026-08-31T00:00:00.000Z", endDate: "2026-09-28T00:00:00.000Z" };
const LE_16 = Date.parse("2026-09-16T08:00:00.000Z");
const LE_21_A_1H = Date.parse("2026-09-20T23:30:00.000Z"); // 01:30 à Paris le 21

const releveFin = { key: "releve-fin", anchor: "fin", offsetDays: -7 };

describe("les étapes datées", () => {
  it("sont la session, les quatre relevés d'usage et le bilan — pas la décision ni le devis", () => {
    expect([...NOT_BEFORE_DUE]).toEqual(["prise-en-main", "releve-j2", "releve-j7", "releve-mi-parcours", "releve-fin", "bilan"]);
  });

  it("la session suit son créneau : pas de « session réalisée » avant qu'elle ait lieu", () => {
    const session = { key: "prise-en-main", anchor: "session", offsetDays: 0 };
    expect(tooEarlyToValidate(session, { ...RUN, sessionAt: "2026-09-18T09:00:00.000Z" }, LE_16)).toBe("2026-09-18T00:00:00.000Z");
    expect(tooEarlyToValidate(session, { ...RUN, sessionAt: "2026-09-16T14:00:00.000Z" }, LE_16)).toBeNull();
    expect(tooEarlyToValidate(session, RUN, LE_16)).toBeNull(); // pas de créneau : rien à attendre
  });

  it("s'ouvrent à leur échéance, calculée comme partout ailleurs", () => {
    expect(validationOpensOn(releveFin, RUN)).toBe("2026-09-21T00:00:00.000Z");
  });

  it("ne s'ouvrent pas avant : le 16 pour un relevé du 21, c'est trop tôt", () => {
    expect(tooEarlyToValidate(releveFin, RUN, LE_16)).toBe("2026-09-21T00:00:00.000Z");
  });

  it("s'ouvrent le jour même, dès le début de la journée de PARIS", () => {
    // 23:30 UTC le 20 = 01:30 le 21 à Paris : on y est.
    expect(tooEarlyToValidate(releveFin, RUN, LE_21_A_1H)).toBeNull();
  });

  it("restent ouvertes après leur jour — un relevé en retard se coche", () => {
    expect(tooEarlyToValidate({ key: "releve-j2", anchor: "debut", offsetDays: 2 }, RUN, LE_16)).toBeNull();
  });

  it("le bilan suit son créneau quand il est réservé, pas la date du modèle", () => {
    const bilan = { key: "bilan", anchor: "fin", offsetDays: -3 };
    expect(validationOpensOn(bilan, RUN)).toBe("2026-09-25T00:00:00.000Z");
    expect(validationOpensOn(bilan, { ...RUN, reviewAt: "2026-09-18T09:00:00.000Z" })).toBe("2026-09-18T09:00:00.000Z");
    expect(tooEarlyToValidate(bilan, { ...RUN, reviewAt: "2026-09-18T09:00:00.000Z" }, LE_16)).toBe("2026-09-18T09:00:00.000Z");
  });

  it("laissent libres les étapes qui ne sont pas datées par nature", () => {
    expect(tooEarlyToValidate({ key: "decision", anchor: "fin", offsetDays: 0 }, RUN, LE_16)).toBeNull();
    expect(tooEarlyToValidate({ key: "devis", anchor: "fin", offsetDays: 2 }, RUN, LE_16)).toBeNull();
  });

  it("ne bloquent rien sans date de démarrage : il n'y a pas de jour à attendre", () => {
    expect(tooEarlyToValidate(releveFin, { startDate: null, endDate: null }, LE_16)).toBeNull();
  });
});
