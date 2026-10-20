import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_HIDDEN, NAV_LAYOUT, isActiveHref, isSubGroup } from "@/admin/nav/nav-structure";

describe("menu : une seule entrée active", () => {
  it("sur « À valider », le tableau de bord Publicité ne s'allume pas avec", () => {
    expect(isActiveHref("/admin/publicite/a-valider", "/admin/publicite/a-valider")).toBe(true);
    expect(isActiveHref("/admin/publicite/a-valider", "/admin/publicite")).toBe(false);
  });

  it("le tableau de bord reste actif sur sa propre page", () => {
    expect(isActiveHref("/admin/publicite", "/admin/publicite")).toBe(true);
    expect(isActiveHref("/admin/publicite", "/admin/publicite/a-valider")).toBe(false);
  });

  it("une sous-page sans lien à elle garde son parent actif (règle de Payload)", () => {
    expect(isActiveHref("/admin/collections/ad-campaigns/12", "/admin/collections/ad-campaigns")).toBe(true);
  });

  it("un préfixe qui n'est pas un segment ne compte pas", () => {
    expect(isActiveHref("/admin/publicite-bis", "/admin/publicite")).toBe(false);
  });
});

describe("menu Publicité : chaque entrée a son icône", () => {
  const scss = readFileSync(join(process.cwd(), "admin/nav/nav.scss"), "utf8");
  const slugs = NAV_LAYOUT["Publicité"].flatMap((it) => (typeof it === "string" ? [it] : isSubGroup(it) ? it.slugs : []));
  // Les globals sont identifiés `global-<slug>` dans le menu.
  const GLOBALS = new Set(["ads-brand-kit", "ads-settings"]);

  it("Réglages reste la dernière entrée du groupe", () => {
    const last = NAV_LAYOUT["Publicité"].at(-1);
    expect(last && isSubGroup(last) && last.label).toBe("Réglages");
  });

  it.each(slugs)("%s", (slug) => {
    const key = GLOBALS.has(slug) ? `global-${slug}` : slug;
    expect(scss).toContain(`"${key}":`);
  });
});

describe("pages hors menu", () => {
  const listed = new Set(
    Object.values(NAV_LAYOUT)
      .flat()
      .flatMap((it) => (typeof it === "string" ? [it] : "slugs" in it ? it.slugs : [])),
  );

  it("une collection hors menu n'est rangée nulle part dans le menu", () => {
    for (const slug of NAV_HIDDEN) expect(listed.has(slug)).toBe(false);
  });

  it("Publicité : 4 entrées de travail, puis la matière de l'agent, puis les réglages", () => {
    const pub = NAV_LAYOUT["Publicité"];
    expect(pub.map((it) => (typeof it === "string" ? it : it.label))).toEqual(["Tableau de bord", "À valider", "ad-campaigns", "ad-creatives", "Ressources", "Réglages"]);
  });
});
