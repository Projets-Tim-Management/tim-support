import { describe, expect, it } from "vitest";

import { renderSignature, signatureText } from "@/modules/partner/lib/signature";

/**
 * Signature d'e-mail d'un partenaire.
 *
 * Elle part sur chaque message envoyé à un client : une balise mal fermée ou un
 * nom mal échappé se voit chez le destinataire, pas chez nous.
 */

const full = {
  name: "Charlie Piancatelli",
  jobTitle: "Co-fondateur",
  company: "TIM – Management",
  phone: "06 50 46 75 48",
  website: "tim-management.co",
  photoUrl: "/media/charlie.jpg",
};

describe("rendu HTML", () => {
  it("reprend nom, fonction, entreprise et coordonnées", () => {
    const html = renderSignature(full);
    expect(html).toContain("Charlie Piancatelli");
    expect(html).toContain("Co-fondateur | TIM – Management");
    expect(html).toContain("06 50 46 75 48");
    expect(html).toContain("tim-management.co");
  });

  it("rend le téléphone et le site cliquables", () => {
    const html = renderSignature(full);
    expect(html).toContain('href="tel:0650467548"');
    expect(html).toContain('href="https://tim-management.co"');
  });

  it("rend l'image joignable depuis une messagerie (URL absolue)", () => {
    expect(renderSignature(full)).toMatch(/src="https?:\/\/[^"]+\/media\/charlie\.jpg"/);
    // Une URL déjà absolue n'est pas préfixée deux fois.
    expect(renderSignature({ ...full, photoUrl: "https://cdn.x/y.png" })).toContain(
      'src="https://cdn.x/y.png"',
    );
  });

  it("se passe de ce qui manque sans laisser de trou", () => {
    const html = renderSignature({ name: "Jean Dupont" });
    expect(html).toContain("Jean Dupont");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("tel:");
  });

  it("ne rend RIEN sans nom — une signature anonyme n'est qu'un décor", () => {
    expect(renderSignature({ jobTitle: "Co-fondateur", phone: "06" })).toBe("");
    expect(renderSignature({})).toBe("");
  });

  it("échappe les champs (ils viennent d'une saisie libre)", () => {
    const html = renderSignature({ name: "<script>x</script>", jobTitle: "a<b" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a&lt;b");
  });
});

describe("version texte", () => {
  it("aligne les mêmes informations, une par ligne", () => {
    expect(signatureText(full)).toBe(
      "Charlie Piancatelli\nCo-fondateur | TIM – Management\n06 50 46 75 48\ntim-management.co",
    );
  });

  it("reste vide sans nom", () => {
    expect(signatureText({ phone: "06" })).toBe("");
  });
});
