import { describe, expect, it } from "vitest";

import { AdInspirations } from "@/modules/ads/collections/AdInspirations";
import { AdRushes } from "@/modules/ads/collections/AdRushes";
import { insightPrompt, proposalHeading, proposalText } from "@/modules/ads/lib/rush-describe";
import { importCollectionOf } from "@/modules/ads/lib/rushes";
import { inspirationForAgent, rushForAgent } from "@/modules/ads/video/mount";

/**
 * Les inspirations (plan Publicité, §9 sexies, I1) : des pubs à imiter ou à
 * éviter, dans leur propre collection, importées comme les rushes (captures ET
 * vidéos), dont l'IA tire une fiche de style — lue par le directeur
 * artistique, jamais montée.
 */

type AnyField = { name?: string; type?: string; fields?: AnyField[] };
const names = (fields: AnyField[]): string[] => fields.flatMap((f) => [...(f.name ? [f.name] : []), ...(f.fields ? names(f.fields) : [])]);

describe("une collection à part, sans rien d'une donnée de l'entreprise", () => {
  const fields = names(AdInspirations.fields as AnyField[]);

  it("verdict, lien, ce qui plaît — et la chaîne d'import des rushes", () => {
    for (const f of ["upload", "original", "title", "verdict", "link", "why", "insight", "etat", "processing", "working", "ai"]) expect(fields, f).toContain(f);
  });

  it("ni usage, ni source, ni fonctionnalités, ni droits, ni données réelles, ni recadrage", () => {
    for (const f of ["use", "source", "features", "description", "origin", "noRealData", "framing", "framingTool"]) expect(fields, f).not.toContain(f);
  });

  it("deux listes, deux titres, deux boutons « Ajouter »", () => {
    expect(AdInspirations.labels).toEqual({ singular: "Inspiration", plural: "Inspirations" });
    expect(AdRushes.labels).toEqual({ singular: "Rush", plural: "Rushes" });
  });

  it("les routes partagées ne visent que l'une des deux collections", () => {
    expect(importCollectionOf("/api/admin/ads/rushes/3/description?collection=ad-inspirations")).toBe("ad-inspirations");
    expect(importCollectionOf("/api/admin/ads/rushes/3/description")).toBe("ad-rushes");
    expect(importCollectionOf("/api/admin/ads/rushes/3/description?collection=users")).toBe("ad-rushes");
  });
});

describe("l'IA en tire une fiche de style, pas une description", () => {
  const insp = { id: 1, use: "inspiration", verdict: "aimer", why: "Les mots un à un", title: "Pub X", working: { meta: { kind: "video", durationSec: 14, orientation: "portrait" } } };

  it("le prompt parle de style, avec le verdict et ce qui plaît", () => {
    const p = insightPrompt(insp);
    expect(p.system).toMatch(/STYLE, pas son sujet/);
    expect(p.system).toMatch(/procédés précis à reprendre/);
    expect(p.text).toMatch(/Verdict de Charlie : j'aime/);
    expect(p.text).toMatch(/Les mots un à un/);
    expect(insightPrompt({ ...insp, verdict: "eviter" }).system).toMatch(/erreurs précises à ne PAS reproduire/);
  });

  it("la liste qui suit la fiche porte le bon titre", () => {
    const i = { description: "Coupes rapides.", plans: [], atouts_publicitaires: ["texte mot à mot"] };
    expect(proposalText(i, proposalHeading(insp))).toBe("Coupes rapides.\n\nÀ reprendre chez TIM : texte mot à mot.");
    expect(proposalHeading({ ...insp, verdict: "eviter" })).toBe("À ne pas reproduire");
    expect(proposalHeading({ id: 2 })).toBe("Atouts pour une pub");
  });
});

describe("l'agent lit la fiche validée, jamais les images", () => {
  it("seulement validée", () => {
    const base = { id: 7, use: "inspiration", title: "Pub X", verdict: "eviter", why: "Trop chargé" };
    expect(inspirationForAgent({ ...base, ai: { status: "proposee", proposal: "Fiche" } })).toBeNull();
    expect(inspirationForAgent({ ...base, ai: { status: "validee", proposal: "Fiche" } })).toEqual({ id: 7, nom: "Pub X", verdict: "eviter", ceQuiPlait: "Trop chargé", ficheDeStyle: "Fiche" });
    expect(Object.keys(inspirationForAgent({ ...base, ai: { status: "validee", proposal: "F" } })!)).not.toContain("url");
    expect(rushForAgent({ id: 3 })).toMatchObject({ id: 3 });
  });
});
