import { describe, expect, it } from "vitest";

import { renderSignature, signatureFromPartner, signatureText } from "@/modules/partner/lib/signature";

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

describe("fiche partenaire → signature", () => {
  it("compose le nom à partir du prénom et du nom", () => {
    expect(signatureFromPartner({ firstName: "Charlie", name: "Piancatelli" }).name).toBe(
      "Charlie Piancatelli",
    );
  });

  it("se rabat sur la société quand la personne n'est pas nommée", () => {
    // Certains partenaires sont saisis comme une entreprise, sans interlocuteur.
    expect(signatureFromPartner({ societe: "BTP Diffusion" }).name).toBe("BTP Diffusion");
  });

  it("reprend le mobile et l'avatar quand le bloc signature est vide", () => {
    // Le bloc « Signature e-mail » est facultatif. Sans ces replis, un partenaire
    // qui ne l'a pas rempli signerait sans aucune coordonnée alors que sa fiche
    // en porte.
    const sig = signatureFromPartner({
      firstName: "Luis",
      mobile: "06 11 22 33 44",
      societe: "Toiture 34",
      avatar: { url: "/media/luis.jpg" },
    });
    expect(sig.phone).toBe("06 11 22 33 44");
    expect(sig.company).toBe("Toiture 34");
    expect(sig.photoUrl).toBe("/media/luis.jpg");
  });

  it("laisse le bloc signature l'emporter sur la fiche", () => {
    const sig = signatureFromPartner({
      firstName: "Luis",
      mobile: "06 11 22 33 44",
      signaturePhone: "04 67 00 00 00",
      societe: "Toiture 34",
      signatureCompany: "Groupe Toiture",
    });
    expect(sig.phone).toBe("04 67 00 00 00");
    expect(sig.company).toBe("Groupe Toiture");
  });

  it("signe le seul nom quand rien d'autre n'est renseigné", () => {
    /**
     * C'est le cas le plus fréquent au démarrage : la fiche existe, le bloc
     * signature est vide. Le message doit rester signé — sans encadré de
     * fonction, sans photo, sans ligne de coordonnées vide.
     */
    const html = renderSignature(signatureFromPartner({ firstName: "Luis", name: "Martin" }));
    expect(html).toContain("Luis Martin");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("border-radius:6px");
  });

  it("ne rend rien pour une fiche absente ou anonyme", () => {
    expect(renderSignature(signatureFromPartner(null))).toBe("");
    expect(renderSignature(signatureFromPartner({ email: "x@y.fr" }))).toBe("");
  });
});
