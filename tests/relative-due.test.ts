import { describe, expect, it } from "vitest";

import { relativeDue } from "@/modules/partner/lib/relative-due";

/**
 * L'échéance dite en clair, sur la fiche client.
 *
 * Le défaut réparé ici se lisait comme un problème de fuseau : une réunion à
 * 11 h annoncée « dans 1 h » alors qu'il était presque 11 h. C'était un arrondi
 * — tout ce qui restait sous l'heure devenait « 1 h » — et il rendait
 * l'indication inutile au moment précis où on la regarde.
 */

const T = Date.parse("2026-09-08T09:00:00.000Z"); // 11 h à Paris
const dans = (ms: number) => new Date(T + ms).toISOString();

describe("ce qui reste avant l'échéance", () => {
  it("compte en MINUTES sous l'heure, au lieu d'annoncer une heure", () => {
    // Le cas vécu : réunion à 11 h, il est 10 h 55.
    expect(relativeDue(dans(5 * 60_000), T)).toEqual({ text: "dans 5 min", late: false });
    expect(relativeDue(dans(59 * 60_000), T)).toEqual({ text: "dans 59 min", late: false });
  });

  it("dit « maintenant » à la minute de l'échéance", () => {
    // Une seconde de retard s'annonçait « en retard de 1 h ».
    expect(relativeDue(dans(30_000), T)).toEqual({ text: "maintenant", late: false });
    expect(relativeDue(dans(-30_000), T)).toEqual({ text: "maintenant", late: true });
  });

  it("passe aux heures, puis aux jours", () => {
    const texte = (ms: number) => relativeDue(dans(ms), T)?.text;
    expect(texte(3 * 3_600_000)).toBe("dans 3 h");
    expect(texte(23 * 3_600_000)).toBe("dans 23 h");
    expect(texte(25 * 3_600_000)).toBe("dans 1 jour");
    expect(texte(3 * 86_400_000)).toBe("dans 3 jours");
  });

  it("dit le retard dans la même unité", () => {
    expect(relativeDue(dans(-12 * 60_000), T)).toEqual({ text: "en retard de 12 min", late: true });
    expect(relativeDue(dans(-2 * 86_400_000), T)).toEqual({
      text: "en retard de 2 jours",
      late: true,
    });
  });

  it("ne rend rien sans échéance, ni sur une date illisible", () => {
    expect(relativeDue(null, T)).toBeNull();
    expect(relativeDue("bientôt", T)).toBeNull();
  });
});
