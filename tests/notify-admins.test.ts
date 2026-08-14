import { beforeEach, describe, expect, it } from "vitest";

import { notifyAdminsTestRequested } from "@/modules/marketing/lib/notify";

/**
 * Destinataires des alertes internes.
 *
 * Le rôle `roles` est un select `hasMany`, donc une table à part : chercher
 * « roles in (admin, super-admin) » renvoie une ligne PAR RÔLE correspondant.
 * Un super-admin porte aussi le rôle admin (valeur par défaut du champ), il
 * ressortait donc deux fois — et recevait chaque alerte en double.
 *
 * Ce test rejoue exactement ce que renvoie la base dans ce cas : le même
 * document, deux fois.
 */

let envoyes: Array<Record<string, unknown>>;

const fakePayload = (docs: Array<{ email?: string }>) =>
  ({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    sendEmail: async (m: Record<string, unknown>) => {
      envoyes.push(m);
    },
    find: async () => ({ docs }),
  }) as never;

const run = { id: 7, startDate: null, endDate: null };
const ctx = { client: null, partner: null };

beforeEach(() => {
  envoyes = [];
});

describe("adresses des admins notifiés", () => {
  it("un compte qui porte admin ET super-admin n'est servi qu'une fois", async () => {
    await notifyAdminsTestRequested(
      fakePayload([{ email: "chef@tim.co" }, { email: "chef@tim.co" }]),
      run,
      ctx,
    );

    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].to).toBe("chef@tim.co");
  });

  it("deux écritures de la même boîte ne font qu'un destinataire", async () => {
    await notifyAdminsTestRequested(
      fakePayload([{ email: "Chef@Tim.co" }, { email: "chef@tim.co " }]),
      run,
      ctx,
    );

    expect(envoyes[0].to).toBe("Chef@Tim.co");
  });

  it("les vrais destinataires distincts sont tous servis", async () => {
    await notifyAdminsTestRequested(
      fakePayload([{ email: "a@tim.co" }, { email: "b@tim.co" }, { email: "a@tim.co" }]),
      run,
      ctx,
    );

    expect(envoyes[0].to).toBe("a@tim.co,b@tim.co");
  });

  it("aucune adresse : rien n'est envoyé, et ça ne casse pas", async () => {
    await notifyAdminsTestRequested(fakePayload([{}, { email: "" }]), run, ctx);
    expect(envoyes).toHaveLength(0);
  });
});
