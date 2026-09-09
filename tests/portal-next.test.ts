import { describe, expect, it } from "vitest";

import { PORTAL_HOME, safeNext } from "@/modules/marketing/lib/portal-next";

/**
 * Revenir où l'on allait après s'être connecté — sans en faire un tremplin.
 *
 * Le risque n'est pas théorique : le lien de connexion se trouve dans des
 * e-mails, et une destination libre ferait de notre page, logo compris, le
 * dernier écran vu avant un site qu'on n'a pas choisi.
 */
describe("destination après connexion", () => {
  it("suit un chemin de l'espace client", () => {
    expect(safeNext("/espace-client/bilan")).toBe("/espace-client/bilan");
    expect(safeNext("/espace-client/dossier/salaries")).toBe("/espace-client/dossier/salaries");
  });

  it("retombe sur l'accueil quand il n'y a rien à suivre", () => {
    expect(safeNext(null)).toBe(PORTAL_HOME);
    expect(safeNext("")).toBe(PORTAL_HOME);
    expect(safeNext("   ")).toBe(PORTAL_HOME);
  });

  it("REFUSE tout ce qui sort de l'espace client", () => {
    for (const mauvais of [
      "https://ailleurs.example",
      "//ailleurs.example",
      "http://localhost:3001/admin",
      "/admin/collections/users",
      "/espace-clientele/ailleurs",
      "\\\\ailleurs.example",
      "/espace-client/bilan?next=https://ailleurs.example",
      "/espace-client/bilan#x",
    ]) {
      expect(safeNext(mauvais), mauvais).toBe(PORTAL_HOME);
    }
  });
});
