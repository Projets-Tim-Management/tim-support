import { describe, expect, it } from "vitest";

import { allowComputedDate, clampMailDate, mailDateWindow } from "@/modules/marketing/lib/journey";

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

/**
 * La fenêtre borne un déplacement à la main. Elle n'a pas à déclarer illégale la
 * date que le parcours calcule lui-même.
 *
 * Cas réel (01/09/2026) : « Votre session de prise en main, c'est demain »
 * s'ancre sur le CRÉNEAU réservé, l'étape qui l'accueille sur le lundi de
 * démarrage. Session tenue avant le démarrage — le cas normal — et le rappel
 * tombait hors de sa propre fenêtre. Le premier réglage manuel l'aurait déplacé
 * de plusieurs jours en silence.
 */
describe("allowComputedDate", () => {
  const fenetre = { min: "2026-09-06T00:00:00.000Z", max: "2026-09-09T23:59:00.000Z" };

  it("descend la borne basse jusqu'à une date calculée antérieure", () => {
    const w = allowComputedDate(fenetre, "2026-09-02T15:00:00.000Z");
    expect(clampMailDate("2026-09-02T15:00:00.000Z", w)).toBe("2026-09-02T15:00:00.000Z");
    expect(w.max).toBe(fenetre.max); // l'autre borne ne bouge pas
  });

  it("remonte la borne haute jusqu'à une date calculée postérieure", () => {
    const w = allowComputedDate(fenetre, "2026-09-10T06:00:00.000Z");
    expect(clampMailDate("2026-09-10T06:00:00.000Z", w)).toBe("2026-09-10T06:00:00.000Z");
    expect(w.min).toBe(fenetre.min);
  });

  it("ne touche à rien quand la date calculée est déjà dedans", () => {
    expect(allowComputedDate(fenetre, "2026-09-07T06:00:00.000Z")).toEqual(fenetre);
  });

  it("borne toujours ce qui va AU-DELÀ de la date calculée", () => {
    // L'élargissement suit la programmation du parcours, il ne l'annule pas :
    // une saisie encore plus lointaine reste ramenée à la limite.
    const w = allowComputedDate(fenetre, "2026-09-02T15:00:00.000Z");
    expect(clampMailDate("2026-08-20T06:00:00.000Z", w)).toBe(w.min);
  });

  it("laisse la fenêtre intacte sans date calculée", () => {
    expect(allowComputedDate(fenetre, null)).toEqual(fenetre);
    expect(allowComputedDate(fenetre, "pas une date")).toEqual(fenetre);
  });

  it("ne borne rien quand l'envoi ne déclare aucune étape", () => {
    // mailDateWindow rend { null, null } : un accompagnement se déplace
    // librement, à l'écran comme au serveur.
    const libre = mailDateWindow(null, [{ key: "a", due: "2026-09-01T00:00:00.000Z" }]);
    expect(allowComputedDate(libre, "2026-09-15T06:00:00.000Z")).toEqual({ min: null, max: null });
  });
});
