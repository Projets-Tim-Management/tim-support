import { describe, expect, it } from "vitest";

import {
  MAX_QUERY,
  SEARCHABLE,
  asNumber,
  filterPages,
  fold,
  hiddenFor,
  labelOf,
  mapLimit,
  normalizeQuery,
  selectFor,
  whereFor,
} from "@/core/lib/global-search";

/**
 * Recherche globale de la barre du haut.
 *
 * Ce qui compte ici : qu'on retrouve une page en tapant sans accent, qu'un
 * numéro de ticket tombe sur le ticket, et que la recherche respecte le même
 * masquage que le menu — elle ne doit jamais montrer plus que lui.
 */

const bySlug = (slug: string) => {
  const s = SEARCHABLE.find((x) => x.slug === slug);
  if (!s) throw new Error(`collection ${slug} absente de SEARCHABLE`);
  return s;
};

describe("filtrage des pages", () => {
  const pages = [
    { label: "Tableau de bord", href: "/admin" },
    { label: "Développements", href: "/admin/collections/developments" },
    { label: "Opportunités", href: "/admin/collections/partner-clients" },
  ];

  it("ignore accents et casse", () => {
    expect(filterPages(pages, "developpe").map((p) => p.label)).toEqual(["Développements"]);
    expect(filterPages(pages, "OPPORT").map((p) => p.label)).toEqual(["Opportunités"]);
  });

  it("fold enlève les diacritiques", () => {
    expect(fold("Éàçù")).toBe("eacu");
  });
});

describe("clause where", () => {
  it("cherche chaque champ texte en like", () => {
    expect(whereFor(bySlug("partner-clients"), "dupont")).toEqual({
      or: [
        { companyName: { like: "dupont" } },
        { raisonSociale: { like: "dupont" } },
        { email: { like: "dupont" } },
        { siren: { like: "dupont" } },
      ],
    });
  });

  it("un numéro (avec ou sans #) tombe aussi sur le N° du ticket", () => {
    expect(asNumber("#42")).toBe(42);
    expect(asNumber("42")).toBe(42);
    expect(asNumber("42b")).toBeNull();
    const w = whereFor(bySlug("tickets"), "#42");
    expect(w.or).toContainEqual({ number: { equals: 42 } });
  });

  it("pas d'égalité numérique quand la collection n'a pas de N°", () => {
    const w = whereFor(bySlug("partners"), "12");
    expect(w.or?.some((c) => "number" in c)).toBe(false);
  });
});

describe("libellés", () => {
  it("un ticket = son numéro puis son sujet, l'entreprise en sous-titre", () => {
    const t = bySlug("tickets");
    const doc = { number: 7, subject: "Écran figé", company: "Garage Martin", email: "a@b.fr" };
    expect(t.label(doc)).toBe("#7 · Écran figé");
    expect(t.sub?.(doc)).toBe("Garage Martin");
  });

  it("une opportunité sans nom retombe sur l'e-mail, jamais sur du vide", () => {
    const c = bySlug("partner-clients");
    expect(c.label({ email: "x@y.fr" })).toBe("x@y.fr");
    expect(c.label({})).toBe("Opportunité");
  });

  it("labelOf accepte une chaîne ou un objet i18n", () => {
    expect(labelOf("Tickets", "x")).toBe("Tickets");
    expect(labelOf({ fr: "Tickets", en: "Tickets" }, "x")).toBe("Tickets");
    expect(labelOf(undefined, "slug")).toBe("slug");
  });
});

describe("masquage identique au menu", () => {
  it("hiddenFor évalue la fonction avec l'utilisateur", () => {
    const hideUnlessAdmin = ({ user }: { user?: unknown }) =>
      !((user as { roles?: string[] })?.roles ?? []).includes("admin");
    expect(hiddenFor(hideUnlessAdmin, { roles: ["admin"] })).toBe(false);
    expect(hiddenFor(hideUnlessAdmin, { roles: ["support"] })).toBe(true);
    expect(hiddenFor(true, {})).toBe(true);
    expect(hiddenFor(undefined, {})).toBe(false);
  });
});

describe("bornes et colonnes", () => {
  it("normalizeQuery rogne et tronque", () => {
    expect(normalizeQuery("  dupont ")).toBe("dupont");
    expect(normalizeQuery(null)).toBe("");
    expect(normalizeQuery("a".repeat(200))).toHaveLength(MAX_QUERY);
  });

  it("selectFor ne lit que les champs cherchés et le N°", () => {
    expect(selectFor(bySlug("tickets"))).toEqual({
      subject: true,
      email: true,
      name: true,
      company: true,
      number: true,
    });
    expect(selectFor(bySlug("features"))).toEqual({ title: true });
  });

  it("mapLimit plafonne la concurrence et garde l'ordre", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
  });
});
