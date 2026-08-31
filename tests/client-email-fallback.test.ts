import { beforeEach, describe, expect, it } from "vitest";

import { buildJourneyContext } from "@/modules/marketing/lib/journey-context";
import { sendJourneyEmail } from "@/modules/marketing/lib/send";

/**
 * À quelle adresse écrit-on au client ?
 *
 * D'abord celle du COMPTE ESPACE CLIENT : c'est l'adresse choisie pour ce
 * parcours, celle qui reçoit les codes de connexion, et celle qu'un admin
 * corrige quand le contact change. Elle prime, toujours.
 *
 * À défaut, celle de la FICHE CLIENT — « Contact, puis envoi des factures »,
 * requise à la création. Sans ce repli, un parcours créé hors du modal de
 * démarrage n'avait aucun destinataire : toute la séquence datée (prise en
 * main, accès prêts, suivi, bilan) s'arrêtait sur « aucun destinataire », en
 * silence, et rien à l'écran ne disait pourquoi.
 *
 * Le repli est TRACÉ : écrire à l'adresse de facturation faute de mieux est un
 * rattrapage, pas le fonctionnement normal, et l'équipe doit pouvoir le voir.
 */

const COMPTE = "espace@toitures.fr";
const FICHE = "contact@toitures.fr";

let envoyes: Array<Record<string, unknown>>;
let journal: string[];
let run: Record<string, unknown>;

/** @param compte adresse du compte espace client, ou `null` s'il n'y en a pas. */
const fakePayload = (compte: string | null, ficheEmail: string | null = FICHE) =>
  ({
    logger: {
      info: (m: string) => journal.push(m),
      warn: (m: string) => journal.push(m),
      error: (m: string) => journal.push(m),
    },
    sendEmail: async (m: Record<string, unknown>) => {
      envoyes.push(m);
    },
    findByID: async ({ collection }: { collection: string }) => {
      if (collection === "journey-runs") return run;
      if (collection === "partner-clients") {
        return { companyName: "TOITURES SA", ...(ficheEmail ? { email: ficheEmail } : {}) };
      }
      if (collection === "partners") return { displayName: "Partenaire X", email: "p@x.fr" };
      return null;
    },
    find: async ({ collection }: { collection: string }) =>
      collection === "client-portal-accounts" && compte
        ? { docs: [{ email: compte, firstName: "Charlie" }] }
        : { docs: [] },
    count: async () => ({ totalDocs: 0 }),
    update: async ({ data }: { data: Record<string, unknown> }) => {
      run = { ...run, ...data };
      return run;
    },
  }) as never;

beforeEach(() => {
  envoyes = [];
  journal = [];
  delete process.env.REPLY_DOMAIN;
  run = {
    id: 2,
    client: 19,
    partner: 6,
    startDate: "2026-08-31T00:00:00.000Z",
    endDate: "2026-09-28T00:00:00.000Z",
    steps: [],
    emails: [{ key: "prise-en-main", audience: "client", sentAt: null }],
  };
});

describe("adresse du client", () => {
  it("prend celle du compte espace client quand il existe", async () => {
    await sendJourneyEmail(fakePayload(COMPTE), { run: run as never, key: "prise-en-main" });
    expect(envoyes[0].to).toBe(COMPTE);
  });

  it("se replie sur celle de la fiche client quand aucun compte n'existe", async () => {
    const r = await sendJourneyEmail(fakePayload(null), { run: run as never, key: "prise-en-main" });
    expect(r).toEqual({ sent: true });
    expect(envoyes[0].to).toBe(FICHE);
  });

  it("signale le repli, qui n'est pas le fonctionnement normal", async () => {
    await sendJourneyEmail(fakePayload(null), { run: run as never, key: "prise-en-main" });
    expect(journal.some((l) => /repli|fiche client/i.test(l))).toBe(true);
  });

  it("ne signale rien quand le compte existe", async () => {
    await sendJourneyEmail(fakePayload(COMPTE), { run: run as never, key: "prise-en-main" });
    expect(journal.some((l) => /repli/i.test(l))).toBe(false);
  });

  it("n'envoie toujours rien si les deux adresses manquent", async () => {
    // Il n'y a pas de troisième source à inventer : écrire au partenaire à la
    // place du client lui ferait recevoir un message qui le tutoie.
    const r = await sendJourneyEmail(fakePayload(null, null), { run: run as never, key: "prise-en-main" });
    expect(r).toEqual({ sent: false, reason: "no_recipient" });
    expect(envoyes).toHaveLength(0);
  });

  it("expose la source de l'adresse, pour que l'appelant puisse en parler", async () => {
    const avec = await buildJourneyContext(fakePayload(COMPTE), run as never);
    expect(avec.clientEmail).toBe(COMPTE);
    expect(avec.clientEmailSource).toBe("compte");

    const sans = await buildJourneyContext(fakePayload(null), run as never);
    expect(sans.clientEmail).toBe(FICHE);
    expect(sans.clientEmailSource).toBe("fiche");

    const aucune = await buildJourneyContext(fakePayload(null, null), run as never);
    expect(aucune.clientEmail).toBeNull();
    expect(aucune.clientEmailSource).toBeNull();
  });

  it("le repli ne concerne QUE le client : le partenaire garde la sienne", async () => {
    run = { ...run, emails: [{ key: "creneau-reserve", audience: "partenaire", sentAt: null }] };
    await sendJourneyEmail(fakePayload(null), { run: run as never, key: "creneau-reserve" });
    expect(envoyes[0].to).toBe("p@x.fr");
  });
});
