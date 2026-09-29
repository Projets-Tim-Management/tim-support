import type { CollectionBeforeValidateHook } from "payload";
import { describe, expect, it, vi } from "vitest";

import { AdCompetitors } from "@/modules/ads/collections/AdCompetitors";
import { parsePageRef } from "@/modules/ads/lib/ad-library";

const LINK = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=FR&media_type=all&search_type=page&view_all_page_id=1759865937563144";

describe("lien de la bibliothèque publicitaire → identifiant de page", () => {
  it("extrait view_all_page_id et garde le lien collé tel quel", () => {
    expect(parsePageRef(`  ${LINK} `)).toEqual({ ok: true, pageId: "1759865937563144", sourceUrl: LINK });
  });

  it("accepte un identifiant seul, sans lien d'origine", () => {
    expect(parsePageRef("1759865937563144")).toEqual({ ok: true, pageId: "1759865937563144", sourceUrl: null });
  });

  it("accepte le lien sans https:// et sur un sous-domaine facebook.com", () => {
    expect(parsePageRef("fr-fr.facebook.com/ads/library/?view_all_page_id=123456789")).toMatchObject({ ok: true, pageId: "123456789" });
  });

  it("refuse un lien de la bibliothèque sans identifiant de page, en le disant", () => {
    const r = parsePageRef("https://www.facebook.com/ads/library/?active_status=active&country=FR&q=logiciel%20btp");
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/ne contient pas d'identifiant de page \(view_all_page_id\)/);
  });

  it("refuse le lien d'une seule publicité, en disant quoi copier à la place", () => {
    const r = parsePageRef("https://www.facebook.com/ads/library/?id=987654321012345");
    expect(!r.ok && r.reason).toMatch(/une seule publicité.*Voir toutes les publicités/);
  });

  it("refuse un autre site, une page Facebook hors bibliothèque, un identifiant non numérique, et le vide", () => {
    expect(parsePageRef("https://exemple.fr/?view_all_page_id=123456")).toMatchObject({ ok: false, reason: expect.stringMatching(/exemple\.fr/) });
    expect(parsePageRef("https://www.facebook.com/timmanagement").ok).toBe(false);
    expect(parsePageRef("https://www.facebook.com/ads/library/?view_all_page_id=abc")).toMatchObject({ ok: false, reason: expect.stringMatching(/que des chiffres/) });
    expect(parsePageRef("   ")).toMatchObject({ ok: false, reason: expect.stringMatching(/Collez/) });
    expect(parsePageRef("concurrent btp").ok).toBe(false);
  });
});

describe("collection Concurrents", () => {
  const normalize = AdCompetitors.hooks!.beforeValidate![0] as CollectionBeforeValidateHook;
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    normalize({ data, originalDoc, operation: originalDoc ? "update" : "create" } as never) as Record<string, unknown>;

  it("remplace le lien collé par l'identifiant, et range le lien à part", () => {
    expect(run({ name: "X", pageId: LINK })).toMatchObject({ pageId: "1759865937563144", sourceUrl: LINK });
  });

  it("garde le lien d'origine si l'identifiant ne change pas (simple modification du nom)", () => {
    expect(run({ name: "Y", pageId: "1759865937563144" }, { pageId: "1759865937563144", sourceUrl: LINK })).toMatchObject({ sourceUrl: LINK });
  });

  it("efface le lien d'origine si un autre identifiant est saisi à la main : il ne correspondrait plus", () => {
    expect(run({ pageId: "123456789" }, { pageId: "1759865937563144", sourceUrl: LINK })).toMatchObject({ pageId: "123456789", sourceUrl: null });
  });

  it("laisse un lien illisible tel quel, pour que la validation dise pourquoi", () => {
    expect(run({ pageId: "https://www.facebook.com/ads/library/?q=x" }).pageId).toBe("https://www.facebook.com/ads/library/?q=x");
  });

  const field = AdCompetitors.fields.find((f) => "name" in f && f.name === "pageId") as {
    unique?: boolean;
    required?: boolean;
    validate: (v: unknown, o: unknown) => Promise<true | string>;
  };

  it("fait de l'identifiant la référence unique et obligatoire", () => {
    expect(field.unique).toBe(true);
    expect(field.required).toBe(true);
  });

  const withExisting = (docs: unknown[]) => {
    const find = vi.fn().mockResolvedValue({ docs });
    return { find, opts: { req: { payload: { find } }, id: 7 } };
  };

  it("refuse un doublon en nommant le concurrent déjà présent", async () => {
    const { find, opts } = withExisting([{ name: "Concurrent A", status: "refuse" }]);
    await expect(field.validate("1759865937563144", opts)).resolves.toBe("Cette page est déjà dans la liste : « Concurrent A » (refusé).");
    // Il s'exclut lui-même : modifier un concurrent n'est pas un doublon de lui-même.
    expect(find.mock.calls[0][0].where.and).toContainEqual({ id: { not_equals: 7 } });
  });

  it("accepte un identifiant nouveau, et renvoie le motif d'un lien refusé", async () => {
    await expect(field.validate("1759865937563144", withExisting([]).opts)).resolves.toBe(true);
    await expect(field.validate("https://www.facebook.com/ads/library/?id=1", withExisting([]).opts)).resolves.toMatch(/une seule publicité/);
  });
});
