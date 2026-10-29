import { describe, expect, it } from "vitest";

import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { licenceGaps, missingOnly, profileCount } from "@/modules/marketing/lib/licence-gaps";

const FICHE = { licences: { compagnonQty: 20, chefEquipeQty: 1, conducteurQty: 2, adminQty: 0 } };

describe("licences prévues face aux utilisateurs déclarés", () => {
  it("compte par profil, dans l'ordre de la grille, sans les profils non prévus", () => {
    const gaps = licenceGaps(FICHE, ["compagnon", "compagnon", "chefEquipe", null, "admin"]);
    expect(gaps.map((g) => [g.key, g.expected, g.declared, g.missing])).toEqual([
      ["conducteur", 2, 0, 2],
      ["chefEquipe", 1, 1, 0],
      ["compagnon", 20, 2, 18],
    ]);
    expect(missingOnly(gaps).map((g) => g.key)).toEqual(["conducteur", "compagnon"]);
  });

  it("un utilisateur de trop n'est pas un manque négatif", () => {
    const [g] = licenceGaps({ licences: { compagnonQty: 1 } }, ["compagnon", "compagnon"]);
    expect(g.missing).toBe(0);
  });

  it("lit les quantités dans le groupe `licences`, pas à la racine de la fiche", () => {
    expect(licenceGaps({ compagnonQty: 20 }, [])).toEqual([]);
    expect(licenceGaps(null, [])).toEqual([]);
  });

  it("accorde le nom du profil", () => {
    expect(profileCount("compagnon", 18)).toBe("18 compagnons");
    expect(profileCount("chefEquipe", 1)).toBe("1 chef d'équipe");
    expect(profileCount("conducteur", 2)).toBe("2 conducteurs de travaux");
  });
});

describe("relance du dossier", () => {
  it("chiffre ce qui manque et mène au tableau des utilisateurs", () => {
    const mail = JOURNEY_EMAILS["relance-dossier"]({
      licenceGaps: licenceGaps(FICHE, ["compagnon", "compagnon", "chefEquipe"]),
    });
    expect(mail.text).toContain("- 18 compagnons (2 déclarés sur 20)");
    expect(mail.text).toContain("- 2 conducteurs de travaux (0 déclaré sur 2)");
    expect(mail.text).not.toContain("chef d'équipe");
    expect(mail.html).toContain("18 compagnons (2 déclarés sur 20)");
    expect(mail.html).toContain("/espace-client/dossier/administrateur");
  });

  it("sans manque, le message reste celui d'origine", () => {
    const mail = JOURNEY_EMAILS["relance-dossier"]({ licenceGaps: licenceGaps(FICHE, Array(20).fill("compagnon").concat("chefEquipe", "conducteur", "conducteur")) });
    expect(mail.text).not.toContain("il manque encore");
    expect(mail.html).toContain("/espace-client/dossier\"");
  });

  it("porte le mot personnel, échappé", () => {
    const mail = JOURNEY_EMAILS["relance-dossier"]({ personalNote: "Merci <b>Paul</b>" });
    expect(mail.html).toContain("Merci &lt;b&gt;Paul&lt;/b&gt;");
    expect(mail.text).toContain("Merci <b>Paul</b>");
  });
});
