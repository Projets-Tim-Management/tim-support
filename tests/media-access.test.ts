import type { Field } from "payload";
import { describe, expect, it } from "vitest";

import { mediaIdsIn, uploadSelect } from "@/core/lib/media-access";

describe("mediaIdsIn — les médias référencés par un document", () => {
  const fields: Field[] = [
    { name: "logo", type: "upload", relationTo: "media" },
    { name: "autre", type: "upload", relationTo: "users" as never },
    { type: "row", fields: [{ name: "contrat", type: "upload", relationTo: "media" }] },
    { type: "collapsible", label: "x", fields: [{ name: "devis", type: "upload", relationTo: "media" }] },
    { name: "documents", type: "array", fields: [{ name: "file", type: "upload", relationTo: "media" }] },
    { name: "groupe", type: "group", fields: [{ name: "pj", type: "upload", relationTo: "media" }] },
    {
      type: "tabs",
      tabs: [
        { label: "A", fields: [{ name: "a", type: "upload", relationTo: "media" }] },
        { name: "b", label: "B", fields: [{ name: "c", type: "upload", relationTo: "media" }] },
      ],
    },
  ];

  it("parcourt lignes, repliables, tableaux, groupes et onglets", () => {
    const out = new Set<string | number>();
    mediaIdsIn(
      fields,
      {
        logo: 1,
        autre: 99,
        contrat: { id: 2 },
        devis: 3,
        documents: [{ file: 4 }, { file: { id: 5 } }],
        groupe: { pj: 6 },
        a: 7,
        b: { c: 8 },
      },
      out,
    );
    expect([...out].sort((x, y) => Number(x) - Number(y))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("ignore les valeurs vides", () => {
    const out = new Set<string | number>();
    mediaIdsIn(fields, { logo: null, documents: null, groupe: null }, out);
    expect(out.size).toBe(0);
  });
});

describe("blocs et sélection des champs « fichier »", () => {
  const fields: Field[] = [
    { name: "titre", type: "text" },
    { name: "avatar", type: "upload", relationTo: "media" },
    {
      name: "contenu",
      type: "blocks",
      blocks: [
        { slug: "img", fields: [{ name: "image", type: "upload", relationTo: "media" }] },
        { slug: "texte", fields: [{ name: "texte", type: "text" }] },
      ],
    },
    { name: "docs", type: "array", fields: [{ name: "file", type: "upload", relationTo: "media" }, { name: "label", type: "text" }] },
  ];

  it("relève les médias des blocs selon leur type", () => {
    const out = new Set<string | number>();
    mediaIdsIn(fields, { contenu: [{ blockType: "img", image: 3 }, { blockType: "texte", texte: "x" }] }, out);
    expect([...out]).toEqual([3]);
  });

  it("ne sélectionne que les champs « fichier » et leurs conteneurs", () => {
    expect(uploadSelect(fields)).toEqual({ avatar: true, contenu: true, docs: { file: true } });
    expect(uploadSelect(fields, ["avatar"])).toEqual({ avatar: true });
  });
});
