import { beforeEach, describe, expect, it } from "vitest";

import { sendJourneyEmail } from "@/modules/marketing/lib/send";

/**
 * Envoi d'un message de parcours.
 *
 * Ce qui se joue ici n'est pas le rendu du texte (couvert ailleurs) mais quatre
 * propriétés dont dépend la confiance dans le système : le bon destinataire,
 * l'en-tête de réponse, l'absence de doublon, et le fait qu'un message parti
 * soit marqué comme tel.
 */

const CLIENT_EMAIL = "contact@toitures.fr";
const PARTNER_EMAIL = "commercial@partenaire.fr";

let envoyes: Array<Record<string, unknown>>;
let run: Record<string, unknown>;

const fakePayload = () =>
  ({
    logger: { info: () => {}, error: () => {} },
    sendEmail: async (m: Record<string, unknown>) => {
      envoyes.push(m);
    },
    findByID: async ({ collection }: { collection: string }) => {
      if (collection === "journey-runs") return run;
      if (collection === "partner-clients") return { companyName: "TOITURES SA" };
      if (collection === "partners") return { displayName: "Partenaire X", email: PARTNER_EMAIL };
      return null;
    },
    find: async ({ collection }: { collection: string }) =>
      collection === "client-portal-accounts"
        ? { docs: [{ email: CLIENT_EMAIL, firstName: "Charlie" }] }
        : { docs: [] },
    count: async () => ({ totalDocs: 4 }),
    update: async ({ data }: { data: { emails?: unknown } }) => {
      run = { ...run, ...data };
      return run;
    },
  }) as never;

beforeEach(() => {
  envoyes = [];
  process.env.REPLY_DOMAIN = "reply.tim-management.co";
  run = {
    id: 2,
    client: 19,
    partner: 6,
    startDate: "2026-08-31T00:00:00.000Z",
    endDate: "2026-09-28T00:00:00.000Z",
    steps: [{ key: "dossier-demarrage", anchor: "debut", offsetDays: -5 }],
    emails: [
      { key: "invitation-espace-client", audience: "client", sentAt: null },
      { key: "creneau-reserve", audience: "partenaire", sentAt: null },
      { key: "check-in", audience: "client", sentAt: "2026-09-07T06:00:00.000Z" },
    ],
  };
});

describe("choix du destinataire", () => {
  it("adresse un message « client » à l'espace client", async () => {
    const r = await sendJourneyEmail(fakePayload(), { run: run as never, key: "invitation-espace-client" });
    expect(r.sent).toBe(true);
    expect(envoyes[0].to).toBe(CLIENT_EMAIL);
  });

  it("adresse un message « partenaire » au partenaire, jamais au client", async () => {
    // L'erreur inverse enverrait au prospect un message qui parle de lui à la
    // troisième personne : le destinataire est déduit, jamais fourni.
    const r = await sendJourneyEmail(fakePayload(), { run: run as never, key: "creneau-reserve" });
    expect(r.sent).toBe(true);
    expect(envoyes[0].to).toBe(PARTNER_EMAIL);
  });
});

describe("en-tête de réponse", () => {
  it("porte l'adresse du parcours : une réponse revient dans le logiciel", async () => {
    await sendJourneyEmail(fakePayload(), { run: run as never, key: "invitation-espace-client" });
    expect(envoyes[0].replyTo).toBe("run-2@reply.tim-management.co");
  });

  it("part quand même si aucun domaine de réponse n'est configuré", async () => {
    delete process.env.REPLY_DOMAIN;
    const r = await sendJourneyEmail(fakePayload(), { run: run as never, key: "invitation-espace-client" });
    expect(r.sent).toBe(true);
    expect(envoyes[0].replyTo).toBeUndefined();
  });
});

describe("garde-fous", () => {
  it("ne renvoie pas un message déjà parti", async () => {
    const r = await sendJourneyEmail(fakePayload(), { run: run as never, key: "check-in" });
    expect(r).toEqual({ sent: false, reason: "already_sent" });
    expect(envoyes).toHaveLength(0);
  });

  it("renvoie sur demande explicite", async () => {
    const r = await sendJourneyEmail(fakePayload(), { run: run as never, key: "check-in", force: true });
    expect(r.sent).toBe(true);
  });

  it("marque l'envoi, pour que le cron ne le refasse pas", async () => {
    await sendJourneyEmail(fakePayload(), { run: run as never, key: "invitation-espace-client" });
    const ligne = (run.emails as Array<{ key: string; sentAt?: string | null }>).find(
      (e) => e.key === "invitation-espace-client",
    );
    expect(ligne?.sentAt).toBeTruthy();
  });

  it("refuse un gabarit inconnu au lieu d'envoyer un message vide", async () => {
    const r = await sendJourneyEmail(fakePayload(), { run: run as never, key: "inexistant" });
    expect(r).toEqual({ sent: false, reason: "no_template" });
  });
});
