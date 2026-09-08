import { describe, expect, it } from "vitest";

import { isSafeHref, parseInline, parseMarkdown } from "@/modules/dev/lib/markdown";

/**
 * L'affichage mis en forme des descriptions.
 *
 * Ce qui est en jeu : le texte saisi ne doit JAMAIS être perdu. L'analyse ne
 * sert qu'à l'afficher — si elle ne reconnaît rien, elle doit rendre le texte
 * tel quel plutôt que d'en avaler un morceau.
 */

describe("fragments d'une ligne", () => {
  it("reconnaît gras, italique, code et lien", () => {
    expect(parseInline("**arrêter d'écraser**")).toEqual([
      { kind: "bold", value: "arrêter d'écraser" },
    ]);
    expect(parseInline("`setTime(10/14)`")).toEqual([{ kind: "code", value: "setTime(10/14)" }]);
    expect(parseInline("_important_")).toEqual([{ kind: "italic", value: "important" }]);
    expect(parseInline("[la maquette](https://figma.com/x)")).toEqual([
      { href: "https://figma.com/x", kind: "link", value: "la maquette" },
    ]);
  });

  it("garde le texte autour, dans l'ordre", () => {
    expect(parseInline("stocker `period` dans la base")).toEqual([
      { kind: "text", value: "stocker " },
      { kind: "code", value: "period" },
      { kind: "text", value: " dans la base" },
    ]);
  });

  it("laisse intact ce qu'il ne reconnaît pas", () => {
    // Un astérisque isolé, une multiplication, un chemin : du texte.
    expect(parseInline("3 * 4 = 12")).toEqual([{ kind: "text", value: "3 * 4 = 12" }]);
    expect(parseInline("app/(frontend)/api")).toEqual([{ kind: "text", value: "app/(frontend)/api" }]);
  });

  it("ne perd jamais un caractère", () => {
    const source = "Migration : ajouter `period` (enum, défaut `full`) sur **timesheet**.";
    const restitue = parseInline(source)
      .map((s) => s.value)
      .join("");
    // Seuls les signes de balisage disparaissent — le contenu, jamais.
    expect(restitue).toBe("Migration : ajouter period (enum, défaut full) sur timesheet.");
  });
});

describe("blocs", () => {
  it("découpe une liste numérotée collée depuis une spécification", () => {
    const blocks = parseMarkdown(
      "1. Migration : ajouter `period`.\n2. Requests : accepter la valeur.\n3. Repository : stocker.",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("list");
    expect(blocks[0].kind === "list" && blocks[0].ordered).toBe(true);
    expect(blocks[0].kind === "list" && blocks[0].items).toHaveLength(3);
  });

  it("sépare une puce d'une numérotée : ce sont deux listes", () => {
    const blocks = parseMarkdown("- un\n- deux\n1. trois");
    expect(blocks.map((b) => b.kind)).toEqual(["list", "list"]);
    expect(blocks[0].kind === "list" && blocks[0].ordered).toBe(false);
    expect(blocks[1].kind === "list" && blocks[1].ordered).toBe(true);
  });

  it("garde le paragraphe d'introduction séparé de la liste", () => {
    const blocks = parseMarkdown("Le back l'empêche :\n\n1. Migration\n2. Requests");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "list"]);
  });

  it("reconnaît les titres", () => {
    const blocks = parseMarkdown("## Ce qu'il faut faire\ndu texte");
    expect(blocks[0].kind === "heading" && blocks[0].level).toBe(2);
    expect(blocks[1].kind).toBe("paragraph");
  });

  it("un texte ordinaire reste un paragraphe, retours à la ligne compris", () => {
    const blocks = parseMarkdown("Première ligne\nseconde ligne");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind === "paragraph" && blocks[0].spans[0].value).toBe(
      "Première ligne\nseconde ligne",
    );
  });

  it("ne casse pas sur du vide", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});

describe("liens cliquables", () => {
  it("laisse passer les adresses ordinaires", () => {
    expect(isSafeHref("https://figma.com/x")).toBe(true);
    expect(isSafeHref("http://intranet.tim.fr")).toBe(true);
    expect(isSafeHref("mailto:contact@tim.fr")).toBe(true);
    expect(isSafeHref("  https://exemple.fr  ")).toBe(true);
  });

  it("refuse ce qui s'exécuterait au clic", () => {
    // Une description peut être pré-remplie depuis un ticket : le texte vient
    // alors d'un tiers, et un lien piégé s'exécuterait dans la session admin.
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("JavaScript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeHref("vbscript:msgbox")).toBe(false);
  });

  it("refuse aussi ce qui n'a pas de schéma du tout", () => {
    // Un lien relatif dans une description n'a pas de sens ici, et pourrait
    // pointer vers une action de l'admin.
    expect(isSafeHref("/admin/collections/users")).toBe(false);
    expect(isSafeHref("figma.com/x")).toBe(false);
  });
});
