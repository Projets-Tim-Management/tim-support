import { describe, expect, it } from "vitest";

import { signStepOf, signingMail } from "@/modules/marketing/lib/run-mail-log";
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
    expect(signingAdvice(false, null, NOW).text).toContain("invitez le client");
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
    await mail.record("invitation-signature", "Votre espace de signature", "client@exemple.fr", "entreprise");
    expect(updates).toHaveLength(1);
    expect(updates[0].emails).toHaveLength(2);
    // Rattaché à son étape : la barre d'étapes l'affiche dessous, avec son heure d'envoi.
    expect(updates[0].emails[1]).toMatchObject({ key: "invitation-signature", audience: "client", trigger: "evenement", stepKey: "entreprise", detail: "Envoyé à client@exemple.fr" });
    expect((updates[0].emails[1] as { sentAt: string }).sentAt).toBeTruthy();
  });

  it("date la ligne PRÉVUE par le modèle (même gabarit, même étape) au lieu d'en ajouter une", async () => {
    const planned = [
      { key: "document-disponible:devis", subject: "Un document vous attend", stepKey: "devis-envoye", trigger: "Dès que le devis est déposé" },
      { key: "document-disponible:contrat", subject: "Un document vous attend", stepKey: "contrat-envoye", trigger: "Dès que le contrat est déposé" },
    ];
    const { payload, updates } = fakePayload([{ id: 15, emails: planned }]);
    const mail = await signingMail(payload, 58);
    await mail.record("document-disponible", "Un document vous attend dans votre espace TIM", "c@x.fr", "contrat-envoye");
    const lines = updates[0].emails as { key: string; sentAt?: string; trigger?: string }[];
    expect(lines).toHaveLength(2);
    expect(lines[0].sentAt).toBeUndefined();
    expect(lines[1]).toMatchObject({ key: "document-disponible:contrat", trigger: "Dès que le contrat est déposé" });
    expect(lines[1].sentAt).toBeTruthy();
    // Une deuxième fois (ligne déjà datée) : une nouvelle ligne s'ajoute, l'historique reste complet.
    await mail.record("document-disponible", "Un document vous attend dans votre espace TIM", "c@x.fr", "contrat-envoye");
    expect(updates[1].emails).toHaveLength(3);
  });

  it("sans parcours de mise en production : l'e-mail part sans marqueur, rien n'est inscrit", async () => {
    const { payload, updates } = fakePayload([]);
    const mail = await signingMail(payload, 21);
    expect(mail.mailHeaders).toEqual({});
    await mail.record("relance-signature", "Relance", "client@exemple.fr", signStepOf("devis"));
    expect(updates).toHaveLength(0);
  });
});

describe("étape de chaque e-mail de signature", () => {
  it("relance, code et copie signée vont sous l'étape qui attend la signature du document", () => {
    expect(signStepOf("devis")).toBe("devis-signe");
    expect(signStepOf("contrat")).toBe("contrat-signe");
  });
});

describe("invitation : ce qui manque", () => {
  it("liste les informations manquantes avec le lien vers l'espace client", async () => {
    const { JOURNEY_EMAILS } = await import("@/modules/marketing/lib/emails");
    const mail = JOURNEY_EMAILS["invitation-signature"]({ clientName: "ACME", missingInfo: ["SIREN ou SIRET", "Adresse de facturation"], texts: {} } as never);
    for (const out of [mail.text, mail.html]) {
      expect(out).toContain("SIREN ou SIRET");
      expect(out).toContain("Adresse de facturation");
    }
    expect(mail.html).toContain("Compléter mes informations");
    expect(mail.text).toContain("espace-client");
  });
  it("rien ne manque : pas de liste", async () => {
    const { JOURNEY_EMAILS } = await import("@/modules/marketing/lib/emails");
    const mail = JOURNEY_EMAILS["invitation-signature"]({ clientName: "ACME", missingInfo: [], texts: {} } as never);
    expect(mail.text).not.toContain("il nous manque");
  });
});
