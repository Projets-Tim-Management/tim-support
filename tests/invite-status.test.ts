import { describe, expect, it } from "vitest";

import { isInviteMissing, readPortalLogins } from "@/modules/marketing/lib/invite-status";

/**
 * L'alerte « invitation non envoyée » du tableau clients.
 *
 * Elle signale le pire état du parcours — espace ouvert, client jamais prévenu.
 * Sa valeur tient entièrement à sa fiabilité : une alerte rouge qui s'allume à
 * tort sur la moitié des cartes est désactivée mentalement en une journée, et
 * ne sert plus le jour où elle a raison.
 */

const LIMITE = 300;
const connectes = (...ids: string[]) => ({ known: true as const, connected: new Set(ids) });
const inconnu = { known: false as const };

describe("lecture des connexions à l'espace client", () => {
  it("retient les clients qui se sont déjà connectés", () => {
    const l = readPortalLogins(
      true,
      { docs: [{ client: 58, lastLoginAt: "2026-08-27T16:19:55.849Z" }, { client: 60, lastLoginAt: null }], totalDocs: 2 },
      LIMITE,
    );
    expect(l.known).toBe(true);
    expect(l.known && l.connected.has("58")).toBe(true);
    expect(l.known && l.connected.has("60")).toBe(false);
  });

  it("accepte un client rendu en objet comme en identifiant", () => {
    const l = readPortalLogins(
      true,
      { docs: [{ client: { id: 58 }, lastLoginAt: "2026-08-27T16:19:55.849Z" }], totalDocs: 1 },
      LIMITE,
    );
    expect(l.known && l.connected.has("58")).toBe(true);
  });

  it("se déclare IGNORANT quand la lecture a échoué", () => {
    // Et non « personne ne s'est connecté » : la nuance décide de tout ce qui suit.
    expect(readPortalLogins(false, null, LIMITE).known).toBe(false);
    expect(readPortalLogins(true, null, LIMITE).known).toBe(false);
    expect(readPortalLogins(true, { docs: undefined }, LIMITE).known).toBe(false);
  });

  it("se déclare IGNORANT quand la liste est tronquée", () => {
    // Les accès absents de la page passeraient pour jamais connectés — et
    // chacun de ces clients récolterait une alerte rouge imméritée.
    const tronquee = { docs: [{ client: 1, lastLoginAt: "2026-01-01T00:00:00.000Z" }], totalDocs: LIMITE + 1 };
    expect(readPortalLogins(true, tronquee, LIMITE).known).toBe(false);
  });

  it("reste informé quand la liste est complète, même vide", () => {
    expect(readPortalLogins(true, { docs: [], totalDocs: 0 }, LIMITE).known).toBe(true);
  });
});

describe("faut-il alerter sur ce client ?", () => {
  const base = { accessOpen: true, invitationSentAt: null, clientId: 60, logins: connectes() };

  it("alerte : accès ouvert, aucune trace d'envoi, jamais connecté", () => {
    // Le cas SOCOM FRANCE, tel qu'il est en base aujourd'hui.
    expect(isInviteMissing(base)).toBe(true);
  });

  it("se tait quand l'accès n'est pas encore ouvert", () => {
    // L'invitation n'a pas à être partie : alerter serait du bruit.
    expect(isInviteMissing({ ...base, accessOpen: false })).toBe(false);
  });

  it("se tait quand l'envoi est tracé", () => {
    expect(isInviteMissing({ ...base, invitationSentAt: "2026-08-31T06:00:00.000Z" })).toBe(false);
  });

  it("se tait quand le client s'est déjà connecté", () => {
    // Il a reçu son lien d'une façon ou d'une autre ; la trace manquante ne
    // regarde plus que le journal.
    expect(isInviteMissing({ ...base, logins: connectes("60") })).toBe(false);
  });

  it("se tait quand on ignore qui s'est connecté", () => {
    // LE point : sans cette règle, une lecture en échec allumait l'alerte sur
    // toutes les cartes à la fois.
    expect(isInviteMissing({ ...base, logins: inconnu })).toBe(false);
  });

  it("se tait sur une carte sans client identifiable", () => {
    expect(isInviteMissing({ ...base, clientId: null })).toBe(false);
    expect(isInviteMissing({ ...base, clientId: undefined })).toBe(false);
  });

  it("compare les identifiants sans se soucier de leur type", () => {
    // L'API rend des nombres, la carte manipule des chaînes.
    expect(isInviteMissing({ ...base, clientId: 60, logins: connectes("60") })).toBe(false);
    expect(isInviteMissing({ ...base, clientId: "60", logins: connectes("60") })).toBe(false);
  });

  it("ne se tait pas pour un client voisin", () => {
    expect(isInviteMissing({ ...base, clientId: 60, logins: connectes("58", "59") })).toBe(true);
  });
});
