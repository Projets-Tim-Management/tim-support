import { describe, expect, it } from "vitest";

import {
  FEATURE_IMPORT_PROMPT,
  FEATURE_IMPORT_TEMPLATE,
  buildCopyText,
} from "@/modules/editorial/import/featureTemplate";

/**
 * La forme que doivent prendre les points d'une documentation de feature.
 *
 * Le modèle n'est pas de la décoration : c'est LUI que le rédacteur lit pour
 * savoir quoi produire. Tant qu'il montrait « - étape 1 », il recevait des
 * listes à puces — alors que la charte veut des flèches « → », chacune sur son
 * propre paragraphe, les unes sous les autres, sans retrait ni pastille.
 *
 * Ces tests verrouillent la consigne à l'endroit où elle est réellement lue.
 */

const parties = FEATURE_IMPORT_TEMPLATE.parties as readonly { description: string }[];
const textes = [FEATURE_IMPORT_TEMPLATE.intro, ...parties.map((p) => p.description)];

describe("modèle d'import d'une feature", () => {
  it("n'illustre AUCUNE liste à puces ni numérotée", () => {
    // C'est l'exemple qui dicte la sortie : une puce montrée est une puce reçue.
    for (const t of textes) {
      expect(t, t.slice(0, 40)).not.toMatch(/(^|\n)\s*[-*]\s/);
      expect(t, t.slice(0, 40)).not.toMatch(/(^|\n)\s*\d+\.\s/);
    }
  });

  it("montre des flèches, chacune sur son propre paragraphe", () => {
    for (const t of textes) {
      const points = t.split("\n\n").filter((p) => p.startsWith("→"));
      expect(points.length, t.slice(0, 40)).toBeGreaterThanOrEqual(2);
    }
  });

  it("met en gras le terme défini, puis l'explication", () => {
    expect(parties[0].description).toMatch(/→ \*\*[^*]+\*\* : /);
  });

  it("se termine par la ligne « Idéal pour », qui dit à quoi ça sert", () => {
    expect(parties[0].description.trim()).toMatch(/\*Idéal pour[^*]*\*$/);
  });
});

describe("consignes envoyées au rédacteur", () => {
  it("interdisent explicitement les puces", () => {
    expect(FEATURE_IMPORT_PROMPT).toMatch(/AUCUNE LISTE À PUCES/);
    expect(FEATURE_IMPORT_PROMPT).not.toMatch(/listes à puces\/numérotées/);
  });

  it("décrivent la flèche et le paragraphe séparé", () => {
    expect(FEATURE_IMPORT_PROMPT).toContain("→");
    expect(FEATURE_IMPORT_PROMPT).toMatch(/ligne vide/);
  });

  it("le texte copié réunit bien les consignes ET le modèle", () => {
    // Copier l'un sans l'autre laisserait le rédacteur deviner la forme.
    const copie = buildCopyText();
    expect(copie).toContain(FEATURE_IMPORT_PROMPT);
    expect(copie).toContain('"parties"');
    expect(copie).toContain("→ **");
  });
});
