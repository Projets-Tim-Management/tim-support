import { describe, expect, it } from "vitest";

import { firstFreeSlot, parisInstant, upcomingSlots } from "@/modules/editorial/lib/articles/schedule";
import { statusFromWordPress } from "@/modules/editorial/lib/articles/statuses";
import { buildDraftPayload, sameContent, slugify } from "@/modules/editorial/lib/articles/wp-write";

describe("créneaux de publication : mardi et jeudi à 9 h (Paris)", () => {
  it("9 h à Paris en hiver (UTC+1) comme en été (UTC+2)", () => {
    expect(parisInstant("2026-11-24", 9).toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(parisInstant("2026-06-02", 9).toISOString()).toBe("2026-06-02T07:00:00.000Z");
  });
  it("les prochains créneaux après maintenant (mercredi 18/11 → jeudi 19, mardi 24, jeudi 26)", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(upcomingSlots(now, 3).map((d) => d.toISOString())).toEqual(["2026-11-19T08:00:00.000Z", "2026-11-24T08:00:00.000Z", "2026-11-26T08:00:00.000Z"]);
  });
  it("un mardi à 9 h 30, le créneau du jour est passé", () => {
    expect(upcomingSlots(new Date("2026-11-24T08:30:00Z"), 1)[0].toISOString()).toBe("2026-11-26T08:00:00.000Z");
  });
  it("premier créneau libre : un seul article par créneau, le planning glisse", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(firstFreeSlot(["2026-11-19T08:00:00.000Z"], now).toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(firstFreeSlot([], now).toISOString()).toBe("2026-11-19T08:00:00.000Z");
  });
});

describe("écriture dans WordPress", () => {
  it("slug court, sans accents", () => {
    expect(slugify("Calcul des heures supplémentaires dans le BTP : règles 2026")).toBe("calcul-des-heures-supplementaires-dans-le-btp-regles-2026");
    expect(slugify("L'astreinte d'un chef d'équipe").startsWith("l-astreinte-d-un-chef-d-equipe")).toBe(true);
    expect(slugify("x".repeat(80)).length).toBe(60);
  });
  it("brouillon : statut draft, auteur Charlie, catégorie de la thématique, relu par Charlie à la date du jour", () => {
    const p = buildDraftPayload(
      { title: "Heures sup", yoast_title: "Heures sup BTP", yoast_description: "Tout savoir", introduction: "<p>Intro</p>", contenu: [{ acf_fc_layout: "texte", texte: "<h2>A ?</h2>" }], faq: [], sources: [{ libelle: "Légifrance", url: "https://www.legifrance.gouv.fr/x", date: "2026" }], methode: { assistance_ia: true } },
      { keyword: "heures supplémentaires btp", themeNumber: 2, reviewedOn: "2026-11-24" },
    );
    expect(p).toMatchObject({ status: "draft", author: 1, slug: "heures-supplementaires-btp", categories: [62], seo_meta: { title: "Heures sup BTP", metadesc: "Tout savoir", focuskw: "heures supplémentaires btp" } });
    expect(p.acf.methode).toMatchObject({ assistance_ia: true, relu_par: 1, relu_le: "2026-11-24" });
    expect(p.acf.date_mise_a_jour).toBe("");
  });
  it("relecture après écriture : le texte compte, pas les espaces ni les entités", () => {
    expect(sameContent({ introduction: "<p>Délai d’un an</p>" }, { introduction: "<p>Délai d&rsquo;un  an</p>\n" })).toEqual([]);
    expect(sameContent({ introduction: "<p>Un an</p>" }, { introduction: "<p>Cinq ans</p>" })).toEqual(["introduction"]);
    // WordPress met les apostrophes en typographiques et ajoute `acf_fc_layout` aux sections (19/11/2026).
    expect(sameContent({ introduction: "<p>selon l'INRS</p>" }, { introduction: "<p>selon l’INRS</p>" })).toEqual([]);
    expect(sameContent({ contenu: [{ texte: "<h2>A</h2><p>B</p>" }], faq: [{ text: "R", titre: "Q ?" }] }, { contenu: [{ acf_fc_layout: "texte", texte: "<h2>A</h2><p>B</p>" }], faq: [{ titre: "Q ?", text: "R" }] })).toEqual([]);
    expect(sameContent({ contenu: [{ texte: "<p>B</p>" }] }, { contenu: [{ acf_fc_layout: "texte", texte: "<p>C</p>" }] })).toEqual(["contenu"]);
  });
  it("synchronisation : un article programmé reste programmé tant qu'il est brouillon dans WordPress", () => {
    expect(statusFromWordPress("programme", "draft")).toBe("programme");
    expect(statusFromWordPress("image", "draft")).toBe("image");
    expect(statusFromWordPress("programme", "publish")).toBe("publie");
  });
});
