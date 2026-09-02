import { describe, expect, it } from "vitest";

import { fillTemplate } from "@/modules/partner/lib/email-template";
import { firstStartableMonday, isMonday, leadDaysOf } from "@/modules/marketing/lib/journey";
import { tarifsMarkdown } from "@/modules/partner/lib/pricing";

/**
 * Ce qu'un modèle annonce au client : les tarifs et la date de démarrage.
 *
 * Deux chiffres qu'on ne rattrape pas une fois l'e-mail parti — un prix public
 * annoncé à un client qui avait négocié, ou un lundi que l'écran de démarrage
 * refusera ensuite.
 */

describe("tarifs du client", () => {
  it("prend les prix saisis pour CE client", () => {
    const md = tarifsMarkdown({ adminQty: 2, adminPrice: 29, compagnonQty: 10, compagnonPrice: 6 });
    expect(md).toBe("- Admin : 2 × 29 €\n- Compagnon : 10 × 6 €");
  });

  it("ne liste que les profils réellement demandés", () => {
    const md = tarifsMarkdown({ adminQty: 1, adminPrice: 39 });
    expect(md).toBe("- Admin : 1 × 39 €");
    expect(md).not.toContain("Compagnon");
  });

  it("complète par le prix de base un profil demandé sans prix négocié", () => {
    expect(tarifsMarkdown({ conducteurQty: 3 })).toBe("- Conducteur de travaux : 3 × 32 €");
  });

  it("déroule toute la grille tant qu'aucune quantité n'est décidée", () => {
    const md = tarifsMarkdown({});
    expect(md.split("\n")).toHaveLength(5);
    expect(md).toContain("- Admin : 39 €");
    expect(md).toContain("- Compagnon : 8 €");
    // Aucune quantité affichée : rien n'a encore été négocié.
    expect(md).not.toContain("×");
  });

  it("tient debout sans licences du tout", () => {
    expect(tarifsMarkdown(null)).toContain("- Admin : 39 €");
  });
});

describe("premier lundi démarrable", () => {
  it("tombe toujours un lundi", () => {
    for (const lead of [0, 3, 10, 14, 21]) {
      expect(isMonday(`${firstStartableMonday(lead)}T00:00:00Z`)).toBe(true);
    }
  });

  it("respecte le délai de préparation du parcours", () => {
    const sans = firstStartableMonday(0);
    const avec = firstStartableMonday(14);
    expect(avec >= sans).toBe(true);
    expect(Date.parse(`${avec}T00:00:00Z`) - Date.now()).toBeGreaterThanOrEqual(13 * 86_400_000);
  });

  it("lit le délai dans les étapes d'avant-test", () => {
    expect(
      leadDaysOf([
        { anchor: "debut", offsetDays: -14 },
        { anchor: "debut", offsetDays: -7 },
        { anchor: "fin", offsetDays: -30 },
      ]),
    ).toBe(14);
    expect(leadDaysOf([{ anchor: "debut", offsetDays: 3 }])).toBe(0);
    expect(leadDaysOf([])).toBe(0);
  });
});

describe("insertion d'un modèle", () => {
  /**
   * Les modèles vivent désormais en BASE (un admin les corrige depuis
   * l'interface) : ce qu'il reste à garantir ici, c'est le remplacement des
   * variables — le reste est de la donnée, pas du code.
   */
  const body = [
    "Bonjour {{prenom}},",
    "",
    "## Tarification (HT mensuel – sans engagement)",
    "",
    "{{tarifs}}",
    "",
    "Mise en place & formation : **XXX € HT**.",
    "",
    "Le premier démarrage possible est le **{{premier_lundi}}**.",
  ].join("\n");

  it("remplace tarifs et date de démarrage", () => {
    const out = fillTemplate(body, {
      prenom: "Béatrice",
      tarifs: tarifsMarkdown({ adminQty: 1, adminPrice: 29 }),
      premier_lundi: "lundi 7 septembre",
    });
    expect(out).toContain("Bonjour Béatrice,");
    expect(out).toContain("- Admin : 1 × 29 €");
    expect(out).toContain("**lundi 7 septembre**");
    expect(out).not.toContain("{{");
  });

  it("laisse intact ce qui doit être complété à la main", () => {
    const out = fillTemplate(body, { tarifs: tarifsMarkdown({}), premier_lundi: "lundi 7 septembre" });
    expect(out).toContain("XXX € HT");
  });
});
