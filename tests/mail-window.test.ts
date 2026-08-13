import { describe, expect, it } from "vitest";

import { clampMailDate, mailDateWindow } from "@/modules/marketing/lib/journey";

/**
 * Fenêtre de déplacement d'une date d'envoi.
 *
 * La règle : un envoi reste entre l'étape précédente et la suivante. C'est ce
 * qui garde le calendrier lisible — un e-mail qui doublerait l'étape suivante
 * annoncerait une chose déjà faite.
 */

const STEPS = [
  { key: "demande", due: "2026-08-17T00:00:00.000Z" },
  { key: "validation-admin", due: "2026-08-18T00:00:00.000Z" },
  { key: "compte-espace-client", due: "2026-08-19T00:00:00.000Z" },
  { key: "dossier-demarrage", due: "2026-08-26T00:00:00.000Z" },
];

describe("bornes d'une étape", () => {
  it("s'arrête à la journée de l'étape suivante, pas au-delà", () => {
    const w = mailDateWindow("compte-espace-client", STEPS);
    expect(w.max).toBe("2026-08-26T23:59:00.000Z");
  });

  it("commence à la journée de l'étape précédente", () => {
    const w = mailDateWindow("compte-espace-client", STEPS);
    expect(w.min).toBe("2026-08-18T00:00:00.000Z");
  });

  it("n'a pas de borne basse sur la première étape", () => {
    expect(mailDateWindow("demande", STEPS).min).toBeNull();
  });

  it("n'a pas de borne haute sur la dernière", () => {
    expect(mailDateWindow("dossier-demarrage", STEPS).max).toBeNull();
  });

  it("saute les étapes sans échéance : elles ne disent rien sur l'ordre", () => {
    const steps = [
      { key: "a", due: "2026-08-17T00:00:00.000Z" },
      { key: "sans-date", due: null },
      { key: "b", due: null },
      { key: "c", due: "2026-08-25T00:00:00.000Z" },
    ];
    const w = mailDateWindow("b", steps);
    expect(w.min).toBe("2026-08-17T00:00:00.000Z");
    expect(w.max).toBe("2026-08-25T23:59:00.000Z");
  });

  it("ne borne rien pour une étape inconnue", () => {
    expect(mailDateWindow("inexistante", STEPS)).toEqual({ min: null, max: null });
  });
});

describe("recadrage d'une date", () => {
  const w = mailDateWindow("compte-espace-client", STEPS);

  it("laisse passer une date dans la fenêtre", () => {
    const at = "2026-08-20T08:00:00.000Z";
    expect(clampMailDate(at, w)).toBe(at);
  });

  it("ramène une date trop tardive à la borne haute", () => {
    expect(clampMailDate("2026-09-15T08:00:00.000Z", w)).toBe(w.max);
  });

  it("ramène une date trop précoce à la borne basse", () => {
    expect(clampMailDate("2026-07-01T08:00:00.000Z", w)).toBe(w.min);
  });

  it("laisse null tel quel : « ne pas envoyer » n'est pas une date hors bornes", () => {
    expect(clampMailDate(null, w)).toBeNull();
  });

  it("refuse une date illisible plutôt que de produire n'importe quoi", () => {
    expect(clampMailDate("pas une date", w)).toBeNull();
  });

  it("ne touche à rien quand aucune borne n'existe", () => {
    const at = "2030-01-01T08:00:00.000Z";
    expect(clampMailDate(at, { min: null, max: null })).toBe(at);
  });
});
