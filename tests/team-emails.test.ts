import { describe, expect, it } from "vitest";

import { TEAM_EMAILS, resolveTeamRecipients, rulesOf } from "@/core/lib/team-emails";

/** Qui reçoit un e-mail d'équipe : les rôles du réglage, ou la liste personnelle d'un compte. */
const users = [
  { email: "direction@tim-management.co", roles: ["super-admin", "admin"] },
  { email: "cpiancatelli@tim-management.co", roles: ["partner-metier", "admin"] },
  { email: "mpetrini@tim-management.co", roles: ["admin", "support"] },
  { email: "partenaire@exemple.fr", roles: ["partner-utilisateur"] },
];

describe("e-mails d'équipe", () => {
  it("par défaut, comme avant : tous les admins, jamais un partenaire utilisateur", () => {
    expect(resolveTeamRecipients("publicite-recap", users, {})).toEqual(["direction@tim-management.co", "cpiancatelli@tim-management.co", "mpetrini@tim-management.co"]);
  });

  it("suit les rôles du réglage", () => {
    expect(resolveTeamRecipients("rapprochement-mois", users, { "rapprochement-mois": ["support", "super-admin"] })).toEqual(["direction@tim-management.co", "mpetrini@tim-management.co"]);
  });

  it("une liste personnelle remplace les rôles, dans les deux sens", () => {
    const perso = [
      ...users.slice(0, 2),
      { email: "mpetrini@tim-management.co", roles: ["admin", "support"], teamEmailsMode: "custom", teamEmails: ["parcours-devis"] },
      // Un partenaire utilisateur ne reçoit rien, même avec une liste.
      { email: "partenaire@exemple.fr", roles: ["partner-utilisateur"], teamEmailsMode: "custom", teamEmails: ["publicite-recap"] },
    ];
    const rules = { "publicite-recap": ["admin"], "parcours-devis": ["super-admin"] };
    expect(resolveTeamRecipients("publicite-recap", perso, rules)).toEqual(["direction@tim-management.co", "cpiancatelli@tim-management.co"]);
    expect(resolveTeamRecipients("parcours-devis", perso, rules)).toEqual(["direction@tim-management.co", "mpetrini@tim-management.co"]);
  });

  it("une alerte critique que personne ne reçoit part au super-admin ; une simple information, non", () => {
    expect(resolveTeamRecipients("publicite-urgence", users, { "publicite-urgence": [] })).toEqual(["direction@tim-management.co"]);
    expect(resolveTeamRecipients("publicite-recap", users, { "publicite-recap": [] })).toEqual([]);
  });

  it("ne double pas une adresse portée par deux comptes ou deux rôles", () => {
    const twice = [...users, { email: "Direction@tim-management.co ", roles: ["admin"] }];
    expect(resolveTeamRecipients("agendas", twice, {}).filter((e) => e.toLowerCase().startsWith("direction"))).toHaveLength(1);
  });

  it("lit les règles du réglage ; le registre a des clés uniques", () => {
    expect(rulesOf({ rules: [{ email: "agendas", roles: ["admin"] }, { email: null, roles: ["x"] }] })).toEqual({ agendas: ["admin"] });
    expect(new Set(TEAM_EMAILS.map((e) => e.key)).size).toBe(TEAM_EMAILS.length);
  });
});

describe("nouveau client signé", () => {
  it("annonce le client, son montant mensuel et ses licences", async () => {
    const { buildClientWonEmail } = await import("@/modules/marketing/lib/notify");
    const mail = buildClientWonEmail({
      clientId: 42,
      clientName: "Berthouly Construction",
      partnerName: "Mathieu",
      monthlyHT: 471,
      licences: { adminQty: 1, adminPrice: 29, conducteurQty: 2, conducteurPrice: 19 },
      billingStart: "2026-11-01T00:00:00.000Z",
      billingPeriod: "mensuelle",
      paymentMethod: "prelevement-gocardless",
    });
    // Le format monétaire français met une espace insécable avant « € ».
    const plain = (t: string) => t.replace(/[\u00a0\u202f]/g, " ");
    expect(plain(mail.subject)).toBe("Nouveau client signé — Berthouly Construction (471,00 € HT / mois)");
    expect(plain(mail.text)).toContain("Montant mensuel : 471,00 € HT / mois");
    expect(mail.text).toContain("1 × ");
    expect(mail.text).toContain("Apporté par : Mathieu");
    expect(mail.text).toContain("Facturation à partir du : 1 novembre 2026");
    expect(mail.text).toContain("/collections/partner-clients/42");
  });
});

describe("garde-fous", () => {
  it("un partenaire (métier ou utilisateur) ne reçoit jamais d'e-mail d'équipe, même avec une liste", () => {
    const partners = [
      { email: "metier@partenaire.fr", roles: ["partner-metier"], teamEmailsMode: "custom", teamEmails: ["client-gagne"] },
      { email: "util@partenaire.fr", roles: ["partner-utilisateur"], teamEmailsMode: "custom", teamEmails: ["client-gagne"] },
      { email: "direction@tim-management.co", roles: ["super-admin", "admin"] },
    ];
    expect(resolveTeamRecipients("client-gagne", partners, { "client-gagne": ["admin"] })).toEqual(["direction@tim-management.co"]);
  });

  it("« nouveau client signé » : seulement une affaire qui passe en Gagnée sans contrat avant", async () => {
    const { isNewSignature } = await import("@/modules/partner/lib/clientStatus");
    expect(isNewSignature("update", "en-signature", "actif")).toBe(true);
    expect(isNewSignature("update", "en-test", "actif")).toBe(true);
    expect(isNewSignature("update", "nouvelle", "actif")).toBe(true);
    expect(isNewSignature("create", undefined, "actif")).toBe(false);
    expect(isNewSignature("update", "resilie", "actif")).toBe(false);
    expect(isNewSignature("update", "actif", "actif")).toBe(false);
    expect(isNewSignature("update", "en-signature", "perdue")).toBe(false);
  });
});
