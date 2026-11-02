import { describe, expect, it } from "vitest";

import { signingMail } from "@/modules/marketing/lib/run-mail-log";
import { signingAdvice } from "@/modules/partner/lib/signing-advice";

/** Les e-mails de signature : inscrits sur le parcours de mise en production, et le conseil de relance qui en découle. */
const NOW = new Date("2026-11-10T10:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("conseil de relance", () => {
  it("rien à relancer une fois signé", () => {
    expect(signingAdvice(true, { at: daysAgo(10), sort: "remis" }, NOW).tone).toBe("ok");
  });
  it("aucun e-mail parti : inviter", () => {
    expect(signingAdvice(false, null, NOW)).toMatchObject({ tone: "warn" });
    expect(signingAdvice(false, null, NOW).text).toContain("invitez-le");
  });
  it("rejeté : vérifier l'adresse", () => {
    expect(signingAdvice(false, { at: daysAgo(0), sort: "echec" }, NOW)).toMatchObject({ tone: "bad" });
  });
  it("trop tôt : patienter, avec la date à partir de laquelle relancer", () => {
    const a = signingAdvice(false, { at: daysAgo(1), sort: "ouvert" }, NOW);
    expect(a.tone).toBe("info");
    expect(a.text).toContain("hier");
    expect(a.text).toContain("12 novembre");
  });
  it("pas ouvert, ou ouvert sans signature, après trois jours : relancer", () => {
    expect(signingAdvice(false, { at: daysAgo(4), sort: "remis" }, NOW).text).toContain("Pas ouvert depuis 4 jours");
    expect(signingAdvice(false, { at: daysAgo(5), sort: "ouvert" }, NOW).text).toContain("Ouvert, mais pas signé depuis 5 jours");
  });
});

describe("inscription sur le parcours", () => {
  const fakePayload = (runs: { id: number; emails: unknown[] }[]) => {
    const updates: { id: number; emails: unknown[] }[] = [];
    return {
      updates,
      payload: {
        find: async () => ({ docs: runs }),
        update: async ({ id, data }: { id: number; data: { emails: unknown[] } }) => {
          updates.push({ id, emails: data.emails });
          return {};
        },
        logger: { error: () => {} },
      } as never,
    };
  };

  it("marque l'e-mail du tag du parcours et l'ajoute, parti, à sa liste", async () => {
    const { payload, updates } = fakePayload([{ id: 19, emails: [{ key: "x", subject: "Avant" }] }]);
    const mail = await signingMail(payload, 21);
    expect(mail.mailHeaders).toEqual({ headers: { "X-Mailin-Tag": "run-19" } });
    await mail.record("invitation-signature", "Votre espace de signature", "client@exemple.fr");
    expect(updates).toHaveLength(1);
    expect(updates[0].emails).toHaveLength(2);
    expect(updates[0].emails[1]).toMatchObject({ key: "invitation-signature", audience: "client", trigger: "evenement", detail: "Envoyé à client@exemple.fr" });
    expect((updates[0].emails[1] as { sentAt: string }).sentAt).toBeTruthy();
  });

  it("sans parcours de mise en production : l'e-mail part sans marqueur, rien n'est inscrit", async () => {
    const { payload, updates } = fakePayload([]);
    const mail = await signingMail(payload, 21);
    expect(mail.mailHeaders).toEqual({});
    await mail.record("relance-signature", "Relance", "client@exemple.fr");
    expect(updates).toHaveLength(0);
  });
});
