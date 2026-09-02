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

/**
 * Le PUBLIC d'un envoi ne se devine pas.
 *
 * Le destinataire est déduit du champ `audience` de la ligne d'envoi portée par
 * le parcours. Mais cette ligne peut manquer : un parcours lancé avant qu'un
 * message n'entre au modèle n'en a pas, et `snapshotSteps` ne recopie le modèle
 * qu'au prochain enregistrement. Le repli était alors « client » — de sorte
 * qu'un message écrit POUR LE PARTENAIRE, qui parle du client à la troisième
 * personne (« Votre client a réservé son créneau »), partait au client lui-même.
 *
 * Rien ne signalait l'erreur : l'envoi réussissait.
 */
describe("public d'un envoi dont la ligne manque au parcours", () => {
  it("s'en remet au modèle plutôt qu'au client par défaut", async () => {
    run = { ...run, emails: [] }; // parcours antérieur à ce message
    const r = await sendJourneyEmail(fakePayload(), { run: run as never, key: "creneau-reserve" });
    expect(r.sent).toBe(true);
    expect(envoyes[0].to).toBe(PARTNER_EMAIL);
  });

  it("continue de servir les messages client, eux aussi absents de la liste", async () => {
    run = { ...run, emails: [] };
    const r = await sendJourneyEmail(fakePayload(), { run: run as never, key: "check-in" });
    expect(r.sent).toBe(true);
    expect(envoyes[0].to).toBe(CLIENT_EMAIL);
  });

  it("la ligne du parcours prime sur le modèle quand elle existe", async () => {
    // Le modèle décrit l'intention générale ; la ligne, ce parcours-ci.
    await sendJourneyEmail(fakePayload(), { run: run as never, key: "creneau-reserve" });
    expect(envoyes[0].to).toBe(PARTNER_EMAIL);
  });
});

/**
 * Certains messages SONT l'étape : le conseil d'usage parti, il n'y a rien
 * d'autre à faire. La règle est explicite (STEPS_DONE_ON_SEND) et pas déduite du
 * seul rattachement d'un envoi — la plupart des e-mails en déclarent un sans que
 * leur départ ne prouve quoi que ce soit.
 */
describe("un envoi qui vaut validation d'étape", () => {
  /** Payload de test qui expose les parcours ouverts et retient les écritures. */
  const payloadQuiRetient = (ecrits: Record<string, unknown>[]) =>
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
      find: async ({ collection }: { collection: string }) => {
        if (collection === "journey-runs") return { docs: [run] };
        if (collection === "client-portal-accounts")
          return { docs: [{ email: CLIENT_EMAIL, firstName: "Charlie" }] };
        return { docs: [] };
      },
      count: async () => ({ totalDocs: 4 }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        ecrits.push(data);
        run = { ...run, ...data };
        return run;
      },
    }) as never;

  beforeEach(() => {
    run = {
      ...(run as Record<string, unknown>),
      emails: [
        { key: "suivi-chantier", audience: "client", sentAt: null },
        { key: "relance-creneau", audience: "client", sentAt: null },
      ],
    };
  });

  it("coche « Conseil d'usage envoyé » quand le message est parti", async () => {
    const ecrits: Record<string, unknown>[] = [];
    const r = await sendJourneyEmail(payloadQuiRetient(ecrits), {
      run: run as never,
      key: "suivi-chantier",
    });
    expect(r.sent).toBe(true);
    expect(
      ecrits.some((d) => (d.autoSteps as string[] | undefined)?.includes("conseil-suivi-chantier")),
    ).toBe(true);
  });

  it("ne coche rien pour un message qui ne prouve rien", async () => {
    // Envoyer « Il reste à réserver votre session » ne réserve pas le créneau :
    // ce serait déclarer fait ce qu'on est justement en train de réclamer.
    const ecrits: Record<string, unknown>[] = [];
    await sendJourneyEmail(payloadQuiRetient(ecrits), {
      run: run as never,
      key: "relance-creneau",
    });
    expect(ecrits.some((d) => d.autoSteps !== undefined)).toBe(false);
  });
});
