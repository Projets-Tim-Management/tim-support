/**
 * Un Markdown minimal, pour AFFICHER ce qu'on a écrit en texte brut.
 *
 * Les descriptions se saisissent dans une zone de texte ordinaire — c'est le
 * choix de l'équipe, et il a de bonnes raisons : on colle une demande de client
 * ou une spécification produite ailleurs sans qu'un éditeur la retouche. Mais
 * ce qu'on colle CONTIENT de la mise en forme : des listes numérotées, du
 * `code`, du **gras**. L'afficher telle quelle donne une bouillie de signes.
 *
 * On analyse donc à l'affichage, jamais à l'écriture : la donnée reste le texte
 * exact qui a été collé, et rien ne se perd si l'analyse se trompe.
 *
 * Sous-ensemble volontairement étroit — ce qu'on croise dans une spécification
 * collée : titres, listes à puces et numérotées, gras, italique, code en ligne,
 * liens. Pas de tableaux, pas d'images, pas de blocs de code : ils demanderaient
 * un vrai analyseur, et ils n'apparaissent pas ici.
 */

export type Span =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; href: string };

export type Block =
  | { kind: "heading"; level: number; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; ordered: boolean; items: Span[][] };

/** `**gras**`, `*italique*`, `` `code` ``, `[texte](url)` — dans cet ordre de priorité. */
const INLINE =
  /(\*\*|__)(?=\S)([\s\S]*?\S)\1|(\*|_)(?=\S)([\s\S]*?\S)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/;

/** Découpe une ligne en fragments. Le texte non reconnu reste du texte. */
export const parseInline = (line: string): Span[] => {
  const spans: Span[] = [];
  let rest = line;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) break;

    if (match.index > 0) spans.push({ kind: "text", value: rest.slice(0, match.index) });

    if (match[2] !== undefined) spans.push({ kind: "bold", value: match[2] });
    else if (match[4] !== undefined) spans.push({ kind: "italic", value: match[4] });
    else if (match[5] !== undefined) spans.push({ kind: "code", value: match[5] });
    else if (match[6] !== undefined) spans.push({ href: match[7], kind: "link", value: match[6] });

    rest = rest.slice(match.index + match[0].length);
  }

  if (rest.length > 0) spans.push({ kind: "text", value: rest });
  return spans;
};

/**
 * Ce qui a le droit de devenir un lien cliquable.
 *
 * Le texte affiché vient parfois d'un TIERS : une description pré-remplie
 * depuis un ticket reprend ce que le demandeur a écrit. Un
 * `[cliquez ici](javascript:…)` glissé dans un e-mail s'exécuterait dans la
 * session admin au premier clic. Tout le reste s'affiche en texte — visible,
 * et inoffensif.
 */
export const isSafeHref = (href: string): boolean => /^(https?:|mailto:)/i.test(href.trim());

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Découpe un texte en blocs. Une ligne vide sépare deux blocs ; à l'intérieur
 * d'un paragraphe, les retours à la ligne sont conservés (on colle souvent des
 * énumérations sans ligne vide entre elles).
 */
export const parseMarkdown = (input: string): Block[] => {
  const blocks: Block[] = [];
  const lines = (input ?? "").replace(/\r\n?/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ items: list.items.map(parseInline), kind: "list", ordered: list.ordered });
    list = null;
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", level: heading[1].length, spans: parseInline(heading[2]) });
      continue;
    }

    const numbered = NUMBER.exec(line);
    const bulleted = BULLET.exec(line);
    if (numbered || bulleted) {
      flushParagraph();
      const ordered = Boolean(numbered);
      // Changer de sorte de liste ferme la précédente : « 1. » puis « - » sont
      // deux listes, pas une liste bancale.
      if (list && list.ordered !== ordered) flushList();
      list ??= { items: [], ordered };
      list.items.push((numbered ?? bulleted)![1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
};
