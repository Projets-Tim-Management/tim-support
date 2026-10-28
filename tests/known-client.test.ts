import { describe, expect, it } from "vitest";
import type { Payload } from "payload";

import { knownLeadPartnerEmail, newLeadNoticeEmail } from "@/modules/forms/lib/lead-emails";
import { findKnownClient } from "@/modules/partner/lib/known-client";

/**
 * Une base en mémoire qui comprend juste ce que findKnownClient demande :
 * `like` (contient, sans casse), `equals`, `not_equals`, `in`, `and` / `or`.
 */
type Doc = Record<string, unknown>;
function fakePayload(data: Record<string, Doc[]>): Payload {
  const test = (doc: Doc, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, cond]) => {
      if (k === "and") return (cond as Record<string, unknown>[]).every((w) => test(doc, w));
      if (k === "or") return (cond as Record<string, unknown>[]).some((w) => test(doc, w));
      const c = cond as Record<string, unknown>;
      const v = doc[k];
      if ("equals" in c) return String(v ?? "") === String(c.equals);
      if ("not_equals" in c) return String(v ?? "") !== String(c.not_equals);
      if ("like" in c) return String(v ?? "").toLowerCase().includes(String(c.like).toLowerCase());
      if ("in" in c) return (c.in as unknown[]).map(String).includes(String(v));
      return true;
    });
  return {
    find: async ({ collection, where }: { collection: string; where: Record<string, unknown> }) => ({
      docs: (data[collection] ?? []).filter((d) => test(d, where)),
    }),
  } as unknown as Payload;
}

const DB = {
  "partner-clients": [
    { id: 1, companyName: "Laurin Électricité", email: "Contact@Laurin-Elec.fr", phoneDigits: "0611223344", partner: 7, clientStatus: "en-qualification" },
    { id: 2, companyName: "Ancien doublon", email: "vieux@laurin-elec.fr", partner: 7, clientStatus: "archive" },
    { id: 3, companyName: "Ajp", email: "ajp@x.fr", partner: 9, clientStatus: "nouvelle" },
  ],
  "client-contacts": [
    { id: 10, client: 1, email: "m.laurin@gmail.com", phoneDigits: "0699887766" },
    { id: 11, client: 2, email: "vieux@laurin-elec.fr" },
  ],
};

describe("une entreprise déjà suivie", () => {
  const payload = fakePayload(DB);

  it("se retrouve par l'e-mail de sa fiche, sans tenir compte des majuscules, chez un autre partenaire", async () => {
    expect(await findKnownClient(payload, { email: "contact@laurin-elec.fr" })).toEqual({
      id: 1,
      companyName: "Laurin Électricité",
      partner: 7,
    });
  });

  it("se retrouve par l'e-mail ou le téléphone d'un de ses contacts", async () => {
    expect((await findKnownClient(payload, { email: "M.Laurin@gmail.com" }))?.id).toBe(1);
    expect((await findKnownClient(payload, { phone: "+33 6 99 88 77 66" }))?.id).toBe(1);
  });

  it("par le téléphone de la fiche, quel que soit le format", async () => {
    expect((await findKnownClient(payload, { phone: "06.11.22.33.44" }))?.id).toBe(1);
  });

  it("n'est pas une adresse qui en CONTIENT une autre", async () => {
    expect(await findKnownClient(payload, { email: "jp@x.fr" })).toBeNull();
  });

  it("ignore une fiche archivée, et la fiche qu'on exclut", async () => {
    expect(await findKnownClient(payload, { email: "vieux@laurin-elec.fr" })).toBeNull();
    expect(await findKnownClient(payload, { email: "contact@laurin-elec.fr" }, { exclude: 1 })).toBeNull();
  });

  it("ne rapproche rien sur un numéro trop court ou sans coordonnées", async () => {
    expect(await findKnownClient(payload, { phone: "3949" })).toBeNull();
    expect(await findKnownClient(payload, {})).toBeNull();
  });
});

describe("e-mails d'une demande rattachée", () => {
  const ctx = { companyName: "Laurin Électricité", nom: "Marc Laurin", email: "m.laurin@gmail.com", clientId: 1 };

  it("l'alerte TIM dit « prospect connu » et qui le suit", () => {
    const mail = newLeadNoticeEmail({ ...ctx, known: true, followedBy: "Elec Partenaires" });
    expect(mail.subject).toBe("Demande d'un prospect connu — Laurin Électricité");
    expect(mail.text).toContain("Déjà suivie par : Elec Partenaires");
    expect(mail.html).toContain("Aucune fiche créée");
  });

  it("un lead inconnu reste un « Nouveau lead »", () => {
    expect(newLeadNoticeEmail(ctx).subject).toBe("Nouveau lead — Laurin Électricité");
  });

  it("le partenaire reçoit la demande et le lien de SA fiche", () => {
    const mail = knownLeadPartnerEmail(ctx);
    expect(mail.subject).toBe("Laurin Électricité vient de faire une demande sur le site TIM");
    expect(mail.text).toContain("/collections/partner-clients/1");
    expect(mail.text).toContain("qui reste la vôtre");
  });
});
