import { afterEach, describe, expect, it } from "vitest";

import { extractJourneyRunId, journeyReplyTo } from "@/modules/marketing/lib/reply-routing";
import { ticketReplyNoticeEmail } from "@/modules/support/lib/email";

const DOMAIN = process.env.REPLY_DOMAIN;
afterEach(() => {
  if (DOMAIN === undefined) delete process.env.REPLY_DOMAIN;
  else process.env.REPLY_DOMAIN = DOMAIN;
});

describe("adresse de réponse d'un parcours", () => {
  it("porte l'id du parcours", () => {
    process.env.REPLY_DOMAIN = "reply.tim-management.co";
    expect(journeyReplyTo(12)).toBe("run-12@reply.tim-management.co");
  });

  it("n'invente pas d'adresse quand le domaine n'est pas configuré", () => {
    // Sinon la réponse partirait vers un domaine qui n'écoute pas : elle serait
    // perdue pour de bon, alors que sans en-tête elle arrive au moins au support.
    delete process.env.REPLY_DOMAIN;
    expect(journeyReplyTo(12)).toBeUndefined();
  });
});

describe("reconnaissance du destinataire", () => {
  it("retrouve le parcours parmi plusieurs destinataires", () => {
    expect(
      extractJourneyRunId(["contact@client.fr", "run-7@reply.tim-management.co"]),
    ).toBe(7);
  });

  it("tolère la casse : les serveurs ne la préservent pas", () => {
    expect(extractJourneyRunId(["RUN-33@Reply.Tim-Management.co"])).toBe(33);
  });

  it("ignore une adresse de ticket : les deux motifs ne doivent pas se confondre", () => {
    expect(extractJourneyRunId(["ticket-99@reply.tim-management.co"])).toBeNull();
  });

  it("ignore une adresse ordinaire", () => {
    expect(extractJourneyRunId(["support@tim-management.co"])).toBeNull();
  });
});

describe("alerte interne", () => {
  const base = { id: 4, number: 4, subject: "Comment ça se passe ?", email: "c@x.fr", body: "Tout va bien" };

  it("signale la phase de test dans l'objet, pas seulement dans le corps", () => {
    const mail = ticketReplyNoticeEmail({ ...base, journey: { runId: 9, clientName: "TOITURES SA" } });
    expect(mail.subject).toContain("Phase de test");
    expect(mail.html).toContain("TOITURES SA");
    expect(mail.html).toContain("/admin/collections/journey-runs/9");
    expect(mail.text).toContain("TOITURES SA");
  });

  it("reste inchangée pour un ticket ordinaire", () => {
    const mail = ticketReplyNoticeEmail(base);
    expect(mail.subject).not.toContain("Phase de test");
    expect(mail.html).not.toContain("journey-runs");
  });
});
