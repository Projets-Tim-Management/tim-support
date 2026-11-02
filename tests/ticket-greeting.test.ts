import { describe, expect, it } from "vitest";

import { greeting } from "@/modules/support/lib/greeting";

/** Le « Bonjour … » des tickets : prénom + nom, ou rien — jamais le nom de famille seul. */
describe("salutation des tickets", () => {
  it("prénom + nom", () => expect(greeting("TROY", "Antoine")).toBe("Bonjour Antoine Troy,"));
  it("nom seul : pas de nom", () => expect(greeting("TROY")).toBe("Bonjour,"));
  it("civilité retirée", () => expect(greeting("Mr. TROY")).toBe("Bonjour,"));
  it("prénom et nom dans le même champ", () => expect(greeting("Antoine Troy")).toBe("Bonjour Antoine Troy,"));
  it("prénom seul : pas de nom", () => expect(greeting(null, "Antoine")).toBe("Bonjour,"));
  it("rien : Bonjour,", () => expect(greeting(undefined, undefined)).toBe("Bonjour,"));
  it("casse composée gardée", () => expect(greeting("McDonald", "JEAN-MARC")).toBe("Bonjour Jean-Marc McDonald,"));
});
