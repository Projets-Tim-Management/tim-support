import { describe, expect, it } from "vitest";

import {
  TABLES_IGNOREES,
  conditionCitee,
  conditionReferencee,
  referencesUtiles,
  type Reference,
} from "@/core/lib/media-orphans";

/**
 * Ce qui décide qu'un média peut être SUPPRIMÉ définitivement.
 *
 * Une erreur ici n'affiche pas un message : elle efface le logo d'un
 * partenaire, et cela se découvre en ouvrant la fiche des semaines plus tard.
 * Les vingt-trois colonnes qui pointent vers `media` sont donc lues dans le
 * catalogue de la base, jamais recopiées — une liste écrite à la main serait
 * fausse dès le prochain champ ajouté, et ce qu'on oublie d'interroger passe
 * pour inutilisé.
 */

const refs: Reference[] = [
  { table: "features", column: "thumbnail_id" },
  { table: "features_blocks_img", column: "image_id" },
  { table: "_features_v_blocks_img", column: "image_id" },
  { table: "partners", column: "avatar_id" },
  { table: "payload_locked_documents_rels", column: "media_id" },
];

describe("ce qui compte comme un usage", () => {
  it("garde les tables de VERSIONS", () => {
    // Un média rattaché à un brouillon est utilisé : le supprimer viderait le
    // brouillon de son auteur, sans que rien ne le signale.
    expect(referencesUtiles(refs).map((r) => r.table)).toContain("_features_v_blocks_img");
  });

  it("écarte les verrous d'édition, qui ne sont pas un lien", () => {
    // « untel a cette fiche ouverte » est un état passager.
    expect(referencesUtiles(refs).map((r) => r.table)).not.toContain(TABLES_IGNOREES[0]);
  });

  it("écarte tout identifiant qui n'en est pas un", () => {
    const douteux: Reference[] = [
      { table: "media; drop table media", column: "id" },
      { table: "ok", column: "id\"; --" },
      { table: "", column: "" },
    ];
    expect(referencesUtiles(douteux)).toEqual([]);
  });
});

describe("condition SQL", () => {
  it("interroge chaque colonne, reliées par OU", () => {
    const sql = conditionReferencee(refs);
    expect(sql).toContain('from "features" r where r."thumbnail_id" = m.id');
    expect(sql).toContain('from "partners" r where r."avatar_id" = m.id');
    expect(sql.split(" or ")).toHaveLength(4); // les 5 moins le verrou
  });

  it("respecte l'alias de la requête appelante", () => {
    expect(conditionReferencee(refs, "med")).toContain("= med.id");
  });

  it("REFUSE de produire une condition vide", () => {
    // Le garde-fou qui compte : « NOT (rien) » voudrait dire « aucun média
    // n'est utilisé », donc la suppression de toute la médiathèque. Ce cas
    // arrive pour de bon si la requête de catalogue échoue.
    expect(() => conditionReferencee([])).toThrow(/balayage interrompu/i);
    expect(() => conditionReferencee([{ table: TABLES_IGNOREES[0], column: "media_id" }])).toThrow();
  });

  it("refuse un alias fantaisiste", () => {
    expect(() => conditionReferencee(refs, "m; drop table media")).toThrow(/alias/i);
  });
});

describe("médias cités dans un texte libre", () => {
  const colonnes: Reference[] = [
    { table: "email_templates", column: "body" },
    { table: "client_activities", column: "content" },
  ];

  it("cherche le nom du fichier dans chaque colonne", () => {
    const sql = conditionCitee(colonnes);
    expect(sql).toContain('from "email_templates" t');
    expect(sql).toContain('from "client_activities" t');
    expect(sql?.split(" or ")).toHaveLength(2);
  });

  it("n'utilise PAS LIKE : un nom de fichier contient des jokers", () => {
    // « photo_1.png » avec LIKE correspondrait aussi à « photoX1.png », et on
    // protégerait alors un média au lieu de l'autre.
    const sql = conditionCitee(colonnes) ?? "";
    expect(sql).not.toMatch(/\blike\b/i);
    expect(sql).toContain("position(");
  });

  it("ne se fouille pas elle-même", () => {
    expect(conditionCitee([{ table: "media", column: "description" }])).toBeNull();
  });

  it("rend null quand il n'y a rien à fouiller — ce n'est pas une anomalie", () => {
    // À la différence des clés étrangères, dont l'absence doit tout arrêter.
    expect(conditionCitee([])).toBeNull();
  });

  it("écarte les identifiants douteux", () => {
    expect(conditionCitee([{ table: "t; drop table media", column: "body" }])).toBeNull();
  });
});
