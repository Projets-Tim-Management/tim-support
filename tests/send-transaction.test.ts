import { beforeEach, describe, expect, it } from "vitest";

import { sendJourneyEmailForClient } from "@/modules/marketing/lib/send";

/**
 * Un envoi déclenché par un hook doit VOIR ce que sa propre requête vient
 * d'écrire.
 *
 * Payload ouvre une transaction par requête, et Postgres n'en montre rien au
 * dehors tant qu'elle n'est pas commitée. Une lecture qui ne porte pas `req`
 * s'exécute donc sur l'état d'AVANT — et conclut, très raisonnablement, que ce
 * qui vient d'être créé n'existe pas.
 *
 * C'est ce qui a laissé SOCOM FRANCE avec un espace client ouvert dont
 * l'entreprise ignorait l'existence (28/08/2026) : le Go de TIM crée le compte
 * d'accès puis, dans le même geste, le hook cherche à qui envoyer l'invitation.
 * Deux lectures sont en jeu — le PARCOURS et le COMPTE D'ACCÈS, qui porte
 * l'adresse — et il suffit qu'une seule sorte de la transaction pour que rien
 * ne parte. Corriger la première laissait la seconde échouer un cran plus loin,
 * avec un motif différent (`no_recipient` au lieu de `no_run`) et le même
 * résultat pour le client : aucun e-mail.
 *
 * Le faux payload ci-dessous reproduit exactement cette règle : les lignes
 * « non commitées » ne sont rendues qu'aux appels qui portent la transaction.
 */

const CLIENT_ID = 60;
const RUN_ID = 42;
const ADRESSE = "info@socom-france.fr";
const TRANSACTION = "tx-1";

let envoyes: Array<Record<string, unknown>>;
let run: Record<string, unknown>;

/** La requête en cours, telle qu'un hook la reçoit. */
const req = { transactionID: TRANSACTION, context: {} } as never;

/** Porte-t-elle la transaction où vivent les lignes toutes neuves ? */
const voitLeNonCommite = (args: { req?: { transactionID?: string } }) =>
  args?.req?.transactionID === TRANSACTION;

/**
 * @param dansLaTransaction ce qui vient d'être créé par la requête en cours :
 *   le parcours, le compte d'accès, ou les deux.
 */
const fakePayload = (dansLaTransaction: { run: boolean; compte: boolean }) =>
  ({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    sendEmail: async (m: Record<string, unknown>) => {
      envoyes.push(m);
    },
    find: async (args: { collection: string; req?: { transactionID?: string } }) => {
      const visible = !dansLaTransaction.run || voitLeNonCommite(args);
      if (args.collection === "journey-runs") return { docs: visible ? [run] : [] };
      if (args.collection === "client-portal-accounts") {
        const vu = !dansLaTransaction.compte || voitLeNonCommite(args);
        return { docs: vu ? [{ email: ADRESSE, firstName: "Sophie" }] : [] };
      }
      return { docs: [] };
    },
    findByID: async (args: { collection: string; req?: { transactionID?: string } }) => {
      if (args.collection === "journey-runs") {
        return !dansLaTransaction.run || voitLeNonCommite(args) ? run : null;
      }
      if (args.collection === "partner-clients") return { companyName: "SOCOM FRANCE" };
      if (args.collection === "partners") return { displayName: "Partenaire X", email: "p@x.fr" };
      return null;
    },
    count: async () => ({ totalDocs: 0 }),
    update: async ({ data }: { data: { emails?: unknown } }) => {
      run = { ...run, ...data };
      return run;
    },
  }) as never;

beforeEach(() => {
  envoyes = [];
  delete process.env.REPLY_DOMAIN;
  run = {
    id: RUN_ID,
    client: CLIENT_ID,
    partner: 6,
    status: "preparation",
    startDate: "2026-09-07T00:00:00.000Z",
    endDate: "2026-10-05T00:00:00.000Z",
    steps: [],
    emails: [{ key: "invitation-espace-client", audience: "client", sentAt: null }],
  };
});

const inviter = (payload: never, avecReq: boolean) =>
  sendJourneyEmailForClient(
    payload,
    CLIENT_ID,
    "invitation-espace-client",
    undefined,
    avecReq ? req : undefined,
  );

describe("invitation envoyée depuis un hook, dans la transaction en cours", () => {
  it("part quand le parcours ET le compte d'accès viennent d'être créés", async () => {
    // Le cas SOCOM, exactement.
    const r = await inviter(fakePayload({ run: true, compte: true }), true);
    expect(r).toEqual({ sent: true });
    expect(envoyes[0]?.to).toBe(ADRESSE);
  });

  it("part quand seul le compte d'accès vient d'être créé", async () => {
    // Le Go sur un parcours déjà en base : c'est le compte qui est tout neuf.
    const r = await inviter(fakePayload({ run: false, compte: true }), true);
    expect(r).toEqual({ sent: true });
    expect(envoyes[0]?.to).toBe(ADRESSE);
  });

  it("part quand seul le parcours vient d'être créé", async () => {
    const r = await inviter(fakePayload({ run: true, compte: false }), true);
    expect(r).toEqual({ sent: true });
    expect(envoyes[0]?.to).toBe(ADRESSE);
  });

  it("marque l'envoi dans la transaction, pas à côté", async () => {
    await inviter(fakePayload({ run: true, compte: true }), true);
    const ligne = (run.emails as Array<{ key: string; sentAt?: string | null }>).find(
      (e) => e.key === "invitation-espace-client",
    );
    expect(ligne?.sentAt).toBeTruthy();
  });

  it("sans la transaction, ne trouve toujours personne — la régression est visible", async () => {
    // Ce test dit ce qui se passait AVANT, et ce qui se repasserait si un
    // appelant oubliait `req`. Il n'y a pas de repli à inventer ici : envoyer à
    // une adresse devinée serait pire que ne pas envoyer.
    const r = await inviter(fakePayload({ run: true, compte: true }), false);
    expect(r.sent).toBe(false);
    expect(envoyes).toHaveLength(0);
  });
});
