import { describe, expect, it } from "vitest";

import { isActiveHref } from "@/admin/nav/nav-structure";
import { AdRushes } from "@/modules/ads/collections/AdRushes";
import { insightPrompt, proposalHeading, proposalText } from "@/modules/ads/lib/rush-describe";
import { isInspiration } from "@/modules/ads/lib/rushes";
import { inspirationForAgent, rushForAgent } from "@/modules/ads/video/mount";

/**
 * Les inspirations (plan Publicité, §9 sexies, I1) : des pubs à imiter ou à
 * éviter, importées comme les rushes (captures ET vidéos), dont l'IA tire une
 * fiche de style — lue par le directeur artistique, jamais montée.
 */

type AnyField = { name?: string; type?: string; fields?: AnyField[]; admin?: { condition?: (d: unknown, s: unknown) => boolean } };
const flat = (fields: AnyField[]): AnyField[] => fields.flatMap((f) => [f, ...(f.fields ? flat(f.fields) : [])]);
const field = (name: string) => flat(AdRushes.fields as AnyField[]).find((f) => f.name === name)!;
const rowOf = (name: string) => (AdRushes.fields as AnyField[]).find((f) => f.type === "row" && f.fields?.some((x) => x.name === name))!;

describe("la fiche : un usage, et les champs qui vont avec", () => {
  const INSP = { use: "inspiration" };
  const MAT = { use: "matiere" };

  it("une inspiration dit son verdict et ce qui plaît ; ni source, ni fonctionnalités, ni recadrage", () => {
    expect(rowOf("verdict").admin!.condition!(INSP, {})).toBe(true);
    expect(field("why").admin!.condition!(INSP, {})).toBe(true);
    expect(rowOf("source").admin!.condition!(INSP, {})).toBe(false);
    expect(field("description").admin!.condition!(INSP, {})).toBe(false);
    expect(field("framingTool").admin!.condition!(INSP, {})).toBe(false);
  });

  it("la matière garde ses champs, sans ceux d'une inspiration", () => {
    expect(rowOf("source").admin!.condition!(MAT, {})).toBe(true);
    expect(field("why").admin!.condition!(MAT, {})).toBe(false);
    expect(isInspiration({})).toBe(false);
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

describe("le menu : deux listes d'une même collection", () => {
  const R = "/admin/collections/ad-rushes?where[use][equals]=matiere";
  const I = "/admin/collections/ad-rushes?where[use][equals]=inspiration";
  it("chaque liste s'allume sur son seul filtre", () => {
    expect(isActiveHref("/admin/collections/ad-rushes", I, undefined, "where%5Buse%5D%5Bequals%5D=inspiration")).toBe(true);
    expect(isActiveHref("/admin/collections/ad-rushes", R, undefined, "where%5Buse%5D%5Bequals%5D=inspiration")).toBe(false);
    expect(isActiveHref("/admin/collections/ad-rushes", R, undefined, "")).toBe(false);
  });
});
