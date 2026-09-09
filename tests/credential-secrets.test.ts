import { beforeAll, describe, expect, it } from "vitest";

import {
  PASSWORD_MASK,
  encryptPasswordValue,
  readPassword,
} from "@/modules/marketing/lib/credential-secrets";
import { profileRank } from "@/modules/partner/lib/pricing";

/**
 * Chiffrement des mots de passe d'accès.
 *
 * Le cas qui compte est le n°3 : un enregistrement de la fiche sans toucher au
 * champ. Il a réellement écrasé un mot de passe pendant le développement — le
 * masque affiché revenait en écriture et se faisait chiffrer à la place du vrai.
 */

const CLEAR = "094220";
/** Le champ relu est celui que l'appelant DÉSIGNE : la fausse base le respecte. */
const fakePayload = (stored: string | null, field = "timPassword") =>
  ({ db: { findOne: async () => (stored ? { [field]: stored } : null) } }) as never;

beforeAll(() => {
  process.env.PAYLOAD_SECRET = "secret-de-test-pour-les-acces";
});

describe("écriture", () => {
  it("chiffre un mot de passe en clair", async () => {
    const stored = await encryptPasswordValue(CLEAR);
    expect(stored).not.toBe(CLEAR);
    expect(readPassword(stored as string)).toBe(CLEAR);
  });

  it("ne rechiffre pas une valeur déjà chiffrée", async () => {
    const once = (await encryptPasswordValue(CLEAR)) as string;
    const twice = await encryptPasswordValue(once);
    expect(twice).toBe(once);
    expect(readPassword(twice as string)).toBe(CLEAR);
  });

  it("restitue la valeur stockée quand le formulaire renvoie le masque", async () => {
    // Sans ça, enregistrer la fiche sans y toucher remplace le mot de passe par
    // des points — perte définitive et silencieuse.
    const stored = (await encryptPasswordValue(CLEAR)) as string;
    const after = await encryptPasswordValue(PASSWORD_MASK, {
      payload: fakePayload(stored),
      id: 1,
      // La cible est désormais exigée : c'est elle qui a manqué le jour où le
      // masque a été relu dans la mauvaise table.
      collection: "client-contacts",
      field: "timPassword",
    });
    expect(after).toBe(stored);
    expect(readPassword(after as string)).toBe(CLEAR);
  });

  it("n'invente rien si le masque arrive sans valeur stockée", async () => {
    const after = await encryptPasswordValue(PASSWORD_MASK, {
      payload: fakePayload(null),
      id: 1,
      collection: "client-contacts",
      field: "timPassword",
    });
    expect(after).toBeUndefined();
  });

  it("laisse passer le vide : un accès peut être créé avant son mot de passe", async () => {
    expect(await encryptPasswordValue("")).toBe("");
    expect(await encryptPasswordValue(null)).toBeNull();
  });
});

describe("lecture", () => {
  it("déchiffre", async () => {
    expect(readPassword((await encryptPasswordValue(CLEAR)) as string)).toBe(CLEAR);
  });

  it("rend telle quelle une valeur antérieure au chiffrement", () => {
    // Un accès créé avant cette mise en place est en clair : le rendre lisible
    // vaut mieux que de faire croire à un accès perdu.
    expect(readPassword("ancien-en-clair")).toBe("ancien-en-clair");
  });

  it("ne rend rien pour une valeur absente", () => {
    expect(readPassword(null)).toBeNull();
    expect(readPassword("")).toBeNull();
  });
});

/**
 * L'ORDRE des accès : par niveau, jamais par nom.
 *
 * `readTimAccesses` alimente les trois écrans qui remettent des identifiants —
 * l'espace client, le récapitulatif par e-mail, la feuille d'impression. Trier
 * ici plutôt que dans chacun d'eux est ce qui les garde d'accord entre eux :
 * une feuille imprimée doit se relire ligne à ligne à côté de l'écran.
 */
describe("rang des profils", () => {
  it("classe du plus haut au plus bas, et le nom départage", () => {
    const gens = [
      { lastName: "Zoll", licenceProfile: "compagnon" },
      { lastName: "Abel", licenceProfile: "admin" },
      { lastName: "Marc", licenceProfile: "chefEquipe" },
      { lastName: "Blin", licenceProfile: "conducteur" },
      { lastName: "Cole", licenceProfile: "chefChantier" },
      { lastName: "Aube", licenceProfile: "compagnon" },
    ];
    const trie = [...gens].sort(
      (a, b) =>
        profileRank(a.licenceProfile) - profileRank(b.licenceProfile) ||
        a.lastName.localeCompare(b.lastName, "fr"),
    );
    expect(trie.map((g) => g.lastName)).toEqual(["Abel", "Blin", "Cole", "Marc", "Aube", "Zoll"]);
  });

  it("range un profil vide ou inconnu à la fin, jamais au milieu", () => {
    expect(profileRank(null)).toBeGreaterThan(profileRank("compagnon"));
    expect(profileRank("directeur-general")).toBeGreaterThan(profileRank("compagnon"));
  });
});
