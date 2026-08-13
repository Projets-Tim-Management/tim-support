import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncSessionEvent } from "@/modules/marketing/lib/session-calendar";

/**
 * Synchronisation de l'événement de prise en main.
 *
 * On simule le fournisseur d'agenda : ce qui compte ici n'est pas l'appel HTTP
 * à Google, c'est la DÉCISION — créer, déplacer, annuler, ou ne rien faire.
 * C'est là que se jouent les régressions (un lien perdu, un événement fantôme).
 */

const calls: string[] = [];

const provider = {
  createEvent: vi.fn(async () => {
    calls.push("create");
    return { eventId: "evt-1", meetingUrl: "https://meet.google.com/abc-defg-hij" };
  }),
  updateEvent: vi.fn(async () => {
    calls.push("update");
    return { eventId: "evt-1", meetingUrl: "https://meet.google.com/abc-defg-hij" };
  }),
  deleteEvent: vi.fn(async () => {
    calls.push("delete");
  }),
};

vi.mock("@/modules/marketing/lib/calendar", () => ({
  getProvider: () => provider,
  accessTokenFor: async () => "jeton-valide",
  targetConnection: async () => ({
    connection: { id: 1, provider: "google" },
    calendarId: "primary",
  }),
}));

vi.mock("@/modules/marketing/lib/scheduling", () => ({
  resolveRules: () => ({ durationMin: 45 }),
}));

const payload = {
  logger: { info: () => {}, error: () => {} },
  find: async () => ({ docs: [{ email: "client@exemple.fr" }] }),
  findByID: async () => ({ companyName: "TOITURES SA", scheduling: {} }),
} as never;

const RUN = {
  id: 2,
  partner: 6,
  client: 19,
  sessionMode: "visio",
  sessionAt: "2026-08-26T09:00:00.000Z",
  sessionEventId: null,
};

beforeEach(() => {
  calls.length = 0;
  provider.createEvent.mockClear();
  provider.updateEvent.mockClear();
  provider.deleteEvent.mockClear();
});

describe("créneau posé pour la première fois", () => {
  it("crée l'événement et récupère le lien de visio", async () => {
    const r = await syncSessionEvent(payload, RUN, null);
    expect(calls).toEqual(["create"]);
    expect(r.action).toBe("created");
    expect(r.sessionEventId).toBe("evt-1");
    expect(r.sessionLink).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("agit que le créneau vienne de l'espace client ou d'une saisie à la main", async () => {
    // Même fonction, même résultat : c'est tout l'objet de la centralisation.
    const parLeClient = await syncSessionEvent(payload, RUN, null);
    calls.length = 0;
    const aLaMain = await syncSessionEvent(payload, { ...RUN }, null);
    expect(parLeClient.action).toBe(aLaMain.action);
    expect(parLeClient.sessionLink).toBe(aLaMain.sessionLink);
  });
});

describe("créneau déplacé", () => {
  it("déplace l'événement existant au lieu d'en créer un second", async () => {
    // Le report est le cas qui produisait des doublons dans l'agenda réel.
    const r = await syncSessionEvent(
      payload,
      { ...RUN, sessionEventId: "evt-1", sessionAt: "2026-08-27T14:00:00.000Z" },
      "2026-08-26T09:00:00.000Z",
    );
    expect(calls).toEqual(["update"]);
    expect(provider.createEvent).not.toHaveBeenCalled();
    expect(r.action).toBe("updated");
    expect(r.sessionEventId).toBe("evt-1");
  });
});

describe("créneau retiré", () => {
  it("supprime l'événement et efface le lien", async () => {
    const r = await syncSessionEvent(
      payload,
      { ...RUN, sessionEventId: "evt-1", sessionAt: null },
      "2026-08-26T09:00:00.000Z",
    );
    expect(calls).toEqual(["delete"]);
    expect(r.action).toBe("deleted");
    expect(r.sessionEventId).toBeNull();
    // Sans ça, l'écran continuerait d'afficher un lien vers une réunion annulée.
    expect(r.sessionLink).toBeNull();
  });
});

describe("session sur place", () => {
  it("n'expose aucun lien de visio", async () => {
    const r = await syncSessionEvent(payload, { ...RUN, sessionMode: "sur-place" }, null);
    expect(r.sessionLink).toBeNull();
  });
});

describe("cas où il ne faut RIEN faire", () => {
  it("ne touche à rien si le créneau n'a pas bougé", async () => {
    const r = await syncSessionEvent(
      payload,
      { ...RUN, sessionEventId: "evt-1" },
      RUN.sessionAt,
    );
    expect(calls).toEqual([]);
    expect(r.action).toBe("none");
  });

  it("ne supprime rien quand il n'y a jamais eu d'événement", async () => {
    const r = await syncSessionEvent(payload, { ...RUN, sessionAt: null }, null);
    expect(calls).toEqual([]);
    expect(r.action).toBe("none");
  });
});

describe("panne d'agenda", () => {
  it("ne fait pas échouer la réservation : le créneau reste pris", async () => {
    provider.createEvent.mockRejectedValueOnce(new Error("Google Calendar (503) : indisponible"));
    const r = await syncSessionEvent(payload, RUN, null);
    // Aucune exception : c'est le point. Le client ne doit pas être puni pour un
    // jeton expiré côté partenaire.
    expect(r.action).toBe("none");
    expect(r.sessionEventId).toBeUndefined();
  });

  it("oublie un événement disparu de l'agenda plutôt que de s'acharner dessus", async () => {
    provider.updateEvent.mockRejectedValueOnce(new Error("Google Calendar (404) : Not Found"));
    const r = await syncSessionEvent(
      payload,
      { ...RUN, sessionEventId: "evt-disparu", sessionAt: "2026-08-27T14:00:00.000Z" },
      "2026-08-26T09:00:00.000Z",
    );
    // L'identifiant est effacé : la prochaine sauvegarde recréera un événement
    // au lieu d'échouer indéfiniment sur celui qui n'existe plus.
    expect(r.sessionEventId).toBeNull();
  });
});
