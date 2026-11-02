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
