import { describe, expect, it } from "vitest";

import { validateBirthDate } from "@/core/lib/validators";
import { sectionByKey, validateRow } from "@/modules/marketing/lib/portal-sections";

/**
 * Date de naissance d'un salarié.
 *
 * Il y avait ici un seuil de 16 ans que personne n'avait demandé, et qui était
 * faux : un apprenti s'embauche dès 15 ans révolus. Ce qui reste n'est plus une
 * règle d'emploi mais un garde-fou de frappe — et il vit dans les DEUX écrans,
 * parce que la version « collection seulement » laissait le tableau du client
 * tout vert avant de refuser la ligne à l'enregistrement.
 */

const salaries = sectionByKey("salaries")!;
const anneesAvant = (n: number) => new Date(Date.now() - n * 31_557_600_000).toISOString();

describe("garde-fou de la date de naissance", () => {
  it("laisse passer un apprenti de 15 ans", () => {
    // Le cas qui a motivé la suppression du seuil : une donnée vraie, refusée.
    expect(validateBirthDate(anneesAvant(15))).toBe(true);
  });

  it("refuse une naissance dans le futur", () => {
    // « 2026 » au lieu de « 1926 » : la faute de frappe la plus courante.
    expect(validateBirthDate(anneesAvant(-1))).toContain("futur");
  });

  it("refuse une naissance d'il y a plus d'un siècle", () => {
    expect(validateBirthDate(anneesAvant(120))).toContain("improbable");
  });

  it("ne dit rien d'une case vide — le champ reste facultatif", () => {
    expect(validateBirthDate("")).toBe(true);
    expect(validateBirthDate(null)).toBe(true);
  });

  it("refuse ce qui n'est pas une date", () => {
    expect(validateBirthDate("bientôt")).toBe("Date invalide.");
  });
});

describe("l'écran du client applique la même règle", () => {
  const ligne = (birthDate: string) => ({
    company: "BTP Sud",
    firstName: "Luis",
    lastName: "Martin",
    birthDate,
  });

  it("signale la case AVANT l'enregistrement, au lieu de la refuser après", () => {
    // C'est ce que voit le client : la cellule passe au rouge dans le tableau
    // d'import, avec le motif — plutôt qu'un refus du serveur une fois validé.
    expect(validateRow(salaries, ligne(anneesAvant(-1))).birthDate).toContain("futur");
  });

  it("accepte la ligne quand la date est plausible", () => {
    expect(validateRow(salaries, ligne(anneesAvant(38)))).toEqual({});
  });
});
