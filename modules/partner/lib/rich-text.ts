/**
 * Notes mises en forme : gras, italique, titres, listes.
 *
 * Ce qui est STOCKÉ est du **Markdown**, pas du HTML. Trois raisons :
 *  - une note reste lisible partout — dans un export, dans un e-mail, dans une
 *    requête SQL — là où du HTML devient illisible dès qu'il quitte son écran ;
 *  - le champ reste un simple `varchar` : aucune migration, aucun format à
 *    convertir le jour où l'on changera d'éditeur ;
 *  - surtout, RIEN de ce que l'utilisateur tape n'est jamais réinjecté tel quel.
 *    Le HTML affiché est reconstruit ici, à partir de texte échappé et d'une
 *    liste fermée de balises. Une note contenant `<script>` est du texte, point.
 *
 * Le sous-ensemble est volontairement court — c'est ce qu'on utilise vraiment
 * dans une note commerciale :
 *   `# Titre` · `## Sous-titre` · `- puce` · `1. numéro` · `**gras**` · `*italique*`
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Gras et italique, appliqués sur du texte DÉJÀ échappé. */
const inline = (escaped: string): string =>
  escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

/**
 * Markdown → HTML sûr, pour l'affichage ET pour le contenu initial de
 * l'éditeur. Toute chaîne en entrée est acceptable : il n'y a pas d'entrée
 * « malveillante », seulement du texte.
 */
export function markdownToHtml(md: string): string {
  const lines = (md ?? "").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;

  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const openList = (kind: "ul" | "ol") => {
    if (list !== kind) {
      closeList();
      out.push(`<${kind}>`);
      list = kind;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);

    if (bullet) {
      openList("ul");
      out.push(`<li>${inline(escapeHtml(bullet[1]))}</li>`);
    } else if (numbered) {
      openList("ol");
      out.push(`<li>${inline(escapeHtml(numbered[1]))}</li>`);
    } else if (heading) {
      closeList();
      // h3/h4 et non h1/h2 : la page a déjà ses titres, une note ne doit pas
      // prendre le pas sur eux dans la hiérarchie du document.
      const tag = heading[1].length === 1 ? "h3" : "h4";
      out.push(`<${tag}>${inline(escapeHtml(heading[2]))}</${tag}>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(escapeHtml(line))}</p>`);
    }
  }
  closeList();
  return out.join("");
}

/** Balises que l'éditeur produit et que la conversion inverse sait lire. */
const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "UL", "OL", "LI"]);

/**
 * DOM de l'éditeur → Markdown.
 *
 * On ne fait confiance à AUCUNE balise : tout ce qui n'est pas connu est traversé
 * pour son texte. Coller une page web entière dans l'éditeur donne donc du texte,
 * jamais une structure inattendue en base.
 */
export function htmlToMarkdown(root: Node): string {
  const lines: string[] = [];

  /** Contenu en ligne d'un bloc : gras, italique, et rien d'autre. */
  const inlineOf = (node: Node): string => {
    let out = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        out += child.textContent ?? "";
        return;
      }
      if (child.nodeType !== 1) return;
      const el = child as HTMLElement;
      const tag = el.tagName;
      if (tag === "BR") {
        out += "\n";
        return;
      }
      if (BLOCK.has(tag)) {
        // Un bloc imbriqué dans un bloc : on prend son texte, la structure
        // interne sera de toute façon reconstruite par le parcours principal.
        out += inlineOf(el);
        return;
      }
      const inner = inlineOf(el);
      if (!inner.trim()) {
        out += inner;
        return;
      }
      if (tag === "B" || tag === "STRONG") out += `**${inner}**`;
      else if (tag === "I" || tag === "EM") out += `*${inner}*`;
      else out += inner;
    });
    return out;
  };

  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        const text = (child.textContent ?? "").trim();
        if (text) lines.push(text);
        return;
      }
      if (child.nodeType !== 1) return;
      const el = child as HTMLElement;
      switch (el.tagName) {
        case "H1":
        case "H3":
          lines.push(`# ${inlineOf(el).trim()}`);
          break;
        case "H2":
        case "H4":
          lines.push(`## ${inlineOf(el).trim()}`);
          break;
        case "UL":
          el.querySelectorAll(":scope > li").forEach((li) => {
            lines.push(`- ${inlineOf(li).trim()}`);
          });
          break;
        case "OL":
          el.querySelectorAll(":scope > li").forEach((li, i) => {
            lines.push(`${i + 1}. ${inlineOf(li).trim()}`);
          });
          break;
        case "BR":
          lines.push("");
          break;
        case "P":
        case "DIV": {
          const text = inlineOf(el).trim();
          // Un `div` vide est la ligne blanche que l'utilisateur vient de taper.
          lines.push(text);
          break;
        }
        default:
          walk(el);
      }
    });
  };

  walk(root);

  // Deux lignes vides d'affilée n'apportent rien de plus qu'une seule.
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Texte brut d'une note (aperçu, objet d'e-mail) : le Markdown sans ses marques. */
export function markdownToPlain(md: string): string {
  return (md ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .trim();
}
