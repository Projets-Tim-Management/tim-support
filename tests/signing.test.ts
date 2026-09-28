import { describe, expect, it } from "vitest";

import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { buildProductionStepEmail } from "@/modules/marketing/lib/notify";
import {
  missingCompanyInfo,
  normalizeCompanyId,
  portalProgress,
  signingStarted,
  signingSteps,
  stampDocumentDates,
} from "@/modules/partner/lib/signing";

/**
 * Le process de signature : de « oui » au contrat signé.
 *
 * Une étape = un fait. Le document déposé la coche, d'où qu'il vienne ; passé
 * par e-mail, la date posée à la main suffit.
 */

const COMPANY = {
  raisonSociale: "SOUVET VMB",
  siren: "811756721",
  billingAddress: "1 rue X, 69000 Lyon",
  legalForm: "sas",
  representativeFirstName: "Marie",
  representativeLastName: "Durand",
  representativeRole: "Président",
};
const byKey = (facts: Record<string, unknown>) =>
  Object.fromEntries(signingSteps(facts).map((s) => [s.key, s]));

describe("informations de l'entreprise", () => {
  it("demande raison sociale, SIREN ou SIRET, adresse, forme et représentant", () => {
    expect(missingCompanyInfo({})).toEqual([
      "Raison sociale",
      "SIREN ou SIRET",
      "Adresse de facturation",
      "Forme sociale",
      "Prénom du représentant",
      "Nom du représentant",
      "Qualité du représentant",
    ]);
    expect(missingCompanyInfo(COMPANY)).toEqual([]);
  });

  it("accepte le SIRET à la place du SIREN", () => {
    expect(missingCompanyInfo({ ...COMPANY, siren: "", siret: "81175672100018" })).toEqual([]);
  });

  it("ne prend pas des espaces pour une saisie", () => {
    expect(missingCompanyInfo({ ...COMPANY, raisonSociale: "   " })).toEqual(["Raison sociale"]);
  });
});

describe("étapes documentaires", () => {
  it("un document déposé coche l'étape", () => {
    const s = byKey({ quoteDocument: 12, quoteSentAt: "2026-10-01T00:00:00.000Z" });
    expect(s["devis-envoye"]).toMatchObject({ done: true, via: "document" });
  });

  it("une date sans document = fait par e-mail", () => {
    const s = byKey({ contractSentAt: "2026-10-05T00:00:00.000Z" });
    expect(s["contrat-envoye"]).toMatchObject({ done: true, via: "manuel" });
  });

  it("la version signée prouve l'envoi de l'original", () => {
    const s = byKey({ quoteSignedDocument: 40 });
    expect(s["devis-signe"].done).toBe(true);
    expect(s["devis-envoye"]).toMatchObject({ done: true, via: "deduit" });
  });

  it("rien de fait sur une fiche vierge", () => {
    expect(signingSteps({}).filter((s) => s.done)).toHaveLength(0);
  });

  it("reprend la date de signature existante pour le contrat signé", () => {
    expect(byKey({ signatureDate: "2026-10-10T00:00:00.000Z" })["contrat-signe"]).toMatchObject({
      done: true,
      via: "manuel",
    });
  });
});

describe("dates posées au dépôt", () => {
  const NOW = "2026-10-12T09:00:00.000Z";

  it("pose la date d'un document qui arrive", () => {
    expect(stampDocumentDates({ quoteDocument: 12 }, {}, NOW)).toEqual({ quoteSentAt: NOW });
  });

  it("ne réécrit jamais une date déjà posée (e-mail d'abord, PDF ensuite)", () => {
    expect(
      stampDocumentDates({ quoteDocument: 12 }, { quoteSentAt: "2026-10-03T00:00:00.000Z" }, NOW),
    ).toEqual({});
  });

  it("un document remplacé garde sa date", () => {
    expect(stampDocumentDates({ contractDocument: 13 }, { contractDocument: 9 }, NOW)).toEqual({});
  });

  it("une mise à jour qui ne touche pas aux documents ne pose rien", () => {
    expect(stampDocumentDates({ companyName: "X" }, { quoteDocument: 12 }, NOW)).toEqual({});
  });
});

describe("démarrage et identifiants", () => {
  it("démarré par la date de démarrage, ou par une signature déjà acquise", () => {
    expect(signingStarted({})).toBe(false);
    expect(signingStarted({ signingStartedAt: "2026-10-01T00:00:00.000Z" })).toBe(true);
    expect(signingStarted({ signatureDate: "2025-01-01T00:00:00.000Z" })).toBe(true);
  });

  it("SIREN à 9 chiffres, SIRET à 14, espaces tolérés", () => {
    expect(normalizeCompanyId("811 756 721", 9)).toBe("811756721");
    expect(normalizeCompanyId("81175672", 9)).toBeNull();
    expect(normalizeCompanyId("811 756 721 00018", 14)).toBe("81175672100018");
    expect(normalizeCompanyId(123, 9)).toBeNull();
  });
});

describe("messages", () => {
  it("l'invitation de signature mène à la page Signature, sans parler de test", () => {
    const mail = JOURNEY_EMAILS["invitation-signature"]({ clientName: "SOUVET VMB", contactFirstName: "Marie" });
    expect(mail.html).toContain("next=%2Fespace-client%2Fsignature");
    expect(mail.text).not.toMatch(/phase de test/i);
    expect(mail.html).toContain("SOUVET VMB");
  });

  it("l'étape franchie dit au partenaire ce qu'il doit faire ensuite", () => {
    const mail = buildProductionStepEmail({ clientId: 20, clientName: "SOUVET VMB", milestone: "entreprise" }, "partenaire");
    expect(mail.subject).toBe("SOUVET VMB a complété les informations de son entreprise — créer et déposer le devis");
    expect(mail.text).toContain("déposez-le sur la fiche, onglet « Signature »");
    expect(mail.html).toContain("/collections/partner-clients/20");
  });

  it("le devis signé appelle le contrat ; le contrat signé, l'activation par TIM", () => {
    expect(buildProductionStepEmail({ clientId: 1, milestone: "devis-signe" }, "partenaire").subject).toMatch(
      /déposer le contrat à signer$/,
    );
    const tim = buildProductionStepEmail({ clientId: 1, milestone: "contrat-signe" }, "tim");
    expect(tim.text).toContain("Compte de production activé");
  });
});

describe("espace client : une étape à la fois", () => {
  it("commence par l'entreprise, et n'ouvre rien d'autre", () => {
    const p = portalProgress({});
    expect(p.current).toBe("entreprise");
    expect(p.reached).toEqual(["entreprise"]);
  });

  it("ouvre le devis une fois l'entreprise complète", () => {
    const p = portalProgress(COMPANY);
    expect(p.current).toBe("devis");
    expect(p.reached).toEqual(["entreprise", "devis"]);
  });

  it("le devis envoyé ne suffit pas : il faut le devis signé pour passer au contrat", () => {
    expect(portalProgress({ ...COMPANY, quoteDocument: 1, quoteSentAt: "2026-10-01" }).current).toBe("devis");
    expect(portalProgress({ ...COMPANY, quoteSignedDocument: 2 }).current).toBe("contrat");
  });

  it("ne saute pas une étape manquante, même si la suivante est faite", () => {
    const p = portalProgress({ quoteSignedDocument: 2 });
    expect(p.current).toBe("entreprise");
    expect(p.reached).toEqual(["entreprise"]);
  });

  it("termine au contrat signé", () => {
    const p = portalProgress({ ...COMPANY, quoteSignedDocument: 2, contractDocument: 3 });
    expect(p.current).toBe("termine");
    expect(p.reached).toEqual(["entreprise", "devis", "contrat"]);
  });
});
