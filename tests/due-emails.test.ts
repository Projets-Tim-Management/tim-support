import { describe, expect, it } from "vitest";

import {
  ACCESS_EMAIL_KEY,
  LATE_GRACE_HOURS,
  accessEmailReady,
  decideEmail,
} from "@/modules/marketing/lib/due-emails";

/**
 * Règles d'envoi du cron quotidien.
 *
 * C'est ici que se décide si un prospect reçoit un message. Une erreur de ce
 * côté ne se rattrape pas : un e-mail parti est parti.
 */

const NOW = Date.parse("2026-09-07T06:00:00.000Z");
const H = 3_600_000;
const tous = () => true;

const mail = (o: Record<string, unknown> = {}) => ({
  key: "check-in",
  scheduledAt: "2026-09-07T06:00:00.000Z",
  sentAt: null,
  ...o,
});

describe("ce qui doit partir", () => {
  it("part à l'heure dite", () => {
    expect(decideEmail(mail(), "en-cours", NOW, tous)).toEqual({ send: true });
  });

  it("part encore dans la fenêtre de rattrapage (panne de la nuit)", () => {
    const enRetard = mail({ scheduledAt: new Date(NOW - 12 * H).toISOString() });
    expect(decideEmail(enRetard, "en-cours", NOW, tous)).toEqual({ send: true });
  });
});

describe("ce qui ne doit PAS partir", () => {
  it("rien sur un parcours perdu : le prospect n'a plus de test en cours", () => {
    for (const statut of ["gagne", "perdu", "annule"]) {
      expect(decideEmail(mail(), statut, NOW, tous)).toEqual({ send: false, reason: "run_closed" });
    }
  });

  it("le statut prime même sur un message dû et jamais envoyé", () => {
    // L'ordre des règles compte : tester « dû ? » avant « clos ? » enverrait
    // « votre test se termine dans 5 jours » à un client qui a signé.
    const du = mail({ scheduledAt: new Date(NOW - H).toISOString() });
    expect(decideEmail(du, "gagne", NOW, tous)).toEqual({ send: false, reason: "run_closed" });
  });

  it("pas deux fois le même message", () => {
    expect(decideEmail(mail({ sentAt: "2026-09-06T06:00:00.000Z" }), "en-cours", NOW, tous)).toEqual({
      send: false,
      reason: "already_sent",
    });
  });

  it("une date vidée vaut « ne pas envoyer »", () => {
    expect(decideEmail(mail({ scheduledAt: null }), "en-cours", NOW, tous)).toEqual({
      send: false,
      reason: "no_date",
    });
  });

  it("rien avant l'heure", () => {
    const futur = mail({ scheduledAt: new Date(NOW + H).toISOString() });
    expect(decideEmail(futur, "en-cours", NOW, tous)).toEqual({ send: false, reason: "not_due" });
  });

  it("rien au-delà du rattrapage : un message faux est pire qu'un silence", () => {
    const trop = mail({ scheduledAt: new Date(NOW - (LATE_GRACE_HOURS + 1) * H).toISOString() });
    expect(decideEmail(trop, "en-cours", NOW, tous)).toEqual({ send: false, reason: "too_late" });
  });

  it("rien pour un gabarit qui n'existe pas, plutôt qu'un message vide", () => {
    expect(decideEmail(mail(), "en-cours", NOW, () => false)).toEqual({
      send: false,
      reason: "no_template",
    });
  });

  it("rien pour une date illisible", () => {
    expect(decideEmail(mail({ scheduledAt: "n'importe quoi" }), "en-cours", NOW, tous)).toEqual({
      send: false,
      reason: "no_date",
    });
  });
});

describe("remise des accès", () => {
  it("attend que les identifiants existent", () => {
    // Annoncer des accès inexistants un matin de démarrage, devant les équipes
    // réunies, est la pire première impression possible.
    expect(accessEmailReady(0)).toBe(false);
    expect(accessEmailReady(4)).toBe(true);
  });

  it("porte bien la clé attendue par le cron", () => {
    expect(ACCESS_EMAIL_KEY).toBe("acces-prets");
  });
});
