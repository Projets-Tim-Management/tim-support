/**
 * @vitest-environment jsdom
 *
 * `htmlToMarkdown` parcourt un DOM : le tester sans DOM reviendrait à ne tester
 * que la moitié du trajet. jsdom est déjà une dépendance du projet ; seul ce
 * fichier bascule d'environnement, les autres tests restent en `node`.
 */
import { describe, expect, it } from "vitest";

import { htmlToMarkdown, markdownToHtml, markdownToPlain } from "@/modules/partner/lib/rich-text";

/**
 * Notes mises en forme.
 *
 * Deux exigences, dans cet ordre : ce qu'on tape doit revenir intact après un
 * aller-retour éditeur → base → éditeur, et RIEN de ce qui est tapé ne doit
 * pouvoir devenir du HTML actif. La seconde prime : une note est du texte
 * saisi librement, elle finit dans un navigateur.
 */

describe("markdown → HTML", () => {
  it("rend gras, italique, titres et listes", () => {
    expect(markdownToHtml("**gros** et *fin*")).toBe(
      "<p><strong>gros</strong> et <em>fin</em></p>",
    );
    expect(markdownToHtml("# Titre\n## Sous-titre")).toBe("<h3>Titre</h3><h4>Sous-titre</h4>");
    expect(markdownToHtml("- un\n- deux")).toBe("<ul><li>un</li><li>deux</li></ul>");
    expect(markdownToHtml("1. un\n2. deux")).toBe("<ol><li>un</li><li>deux</li></ol>");
  });

  it("ferme une liste quand le texte reprend", () => {
    expect(markdownToHtml("- un\nsuite")).toBe("<ul><li>un</li></ul><p>suite</p>");
  });

  it("enchaîne deux listes de natures différentes", () => {
    expect(markdownToHtml("- a\n1. b")).toBe("<ul><li>a</li></ul><ol><li>b</li></ol>");
  });

  it("échappe le HTML tapé — c'est du texte, pas du balisage", () => {
    const html = markdownToHtml('<script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(markdownToHtml("<img src=x onerror=1>")).not.toContain("<img");
  });

  it("échappe aussi à l'intérieur d'un gras ou d'un titre", () => {
    expect(markdownToHtml("**<b>x</b>**")).toBe("<p><strong>&lt;b&gt;x&lt;/b&gt;</strong></p>");
    expect(markdownToHtml("# <i>t</i>")).toBe("<h3>&lt;i&gt;t&lt;/i&gt;</h3>");
  });

  it("accepte une note vide sans produire de balise", () => {
    expect(markdownToHtml("")).toBe("");
    expect(markdownToHtml("\n\n")).toBe("");
  });
});

describe("HTML de l'éditeur → markdown", () => {
  /** Mini-DOM : le test porte sur le parcours, pas sur le navigateur. */
  const parse = (html: string) => {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    return doc.body.firstElementChild as HTMLElement;
  };

  it("retrouve chaque mise en forme", () => {
    expect(htmlToMarkdown(parse("<p><strong>gros</strong> et <em>fin</em></p>"))).toBe(
      "**gros** et *fin*",
    );
    expect(htmlToMarkdown(parse("<h3>Titre</h3><h4>Sous</h4>"))).toBe("# Titre\n## Sous");
    expect(htmlToMarkdown(parse("<ul><li>un</li><li>deux</li></ul>"))).toBe("- un\n- deux");
    expect(htmlToMarkdown(parse("<ol><li>un</li><li>deux</li></ol>"))).toBe("1. un\n2. deux");
  });

  it("réduit une balise inconnue à son texte", () => {
    // Ce que produit un copier-coller depuis une page web.
    expect(htmlToMarkdown(parse('<p><span style="color:red">rouge</span></p>'))).toBe("rouge");
    expect(htmlToMarkdown(parse("<table><tr><td>a</td></tr></table>"))).toBe("a");
  });

  it("survit à l'aller-retour", () => {
    const md = "# Compte rendu\n\n- rappeler **lundi**\n- envoyer l'offre\n\n## Suite\n\nOK.";
    expect(htmlToMarkdown(parse(markdownToHtml(md)))).toBe(
      "# Compte rendu\n- rappeler **lundi**\n- envoyer l'offre\n## Suite\nOK.",
    );
  });

  it("ne fabrique pas de gras à partir d'une balise vide", () => {
    expect(htmlToMarkdown(parse("<p><strong> </strong>x</p>"))).toBe("x");
  });
});

describe("markdown → texte brut", () => {
  it("retire les marques sans perdre le contenu", () => {
    expect(markdownToPlain("# Titre\n- **un**\n- *deux*")).toBe("Titre\n• un\n• deux");
  });
});
