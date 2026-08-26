"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { htmlToMarkdown, markdownToHtml } from "@/modules/partner/lib/rich-text";

/**
 * Éditeur de note, à la manière de Notion : on voit la mise en forme pendant
 * qu'on écrit, et c'est du Markdown qui est enregistré (voir lib/rich-text.ts).
 *
 * Deux façons de formater, aucune barre d'outils permanente :
 *  - à la FRAPPE : « # » puis espace ouvre un titre, « - » une puce, « 1. » une
 *    liste numérotée. C'est le geste le plus rapide, et le seul disponible sur
 *    une note encore vide ;
 *  - à la SÉLECTION : une barre flottante apparaît au-dessus du texte
 *    sélectionné, avec le type de bloc et les mises en forme.
 *
 * Une barre fixe aurait occupé une ligne en permanence pour un usage
 * occasionnel, dans un panneau où la hauteur est comptée.
 *
 * Trois garde-fous qui font toute la différence à l'usage :
 *  - le COLLER est forcé en texte brut. Coller un e-mail ou une page web
 *    injecterait sinon tableaux, styles et polices dans la note ;
 *  - la barre flottante ne prend JAMAIS le focus (`onMouseDown` empêché), sans
 *    quoi le simple fait de cliquer dessus effacerait la sélection à formater ;
 *  - le contenu n'est réinjecté dans le DOM qu'au MONTAGE. Le réécrire à chaque
 *    frappe replacerait le curseur au début à chaque lettre — le piège classique
 *    du contenteditable piloté par React.
 */

/** Types de bloc proposés par la barre flottante. */
const BLOCKS: { id: string; label: string; tag: string; cmd?: string }[] = [
  { id: "p", label: "Texte normal", tag: "P", cmd: "formatBlock" },
  { id: "h3", label: "Titre", tag: "H3", cmd: "formatBlock" },
  { id: "h4", label: "Sous-titre", tag: "H4", cmd: "formatBlock" },
  { id: "ul", label: "Liste à puces", tag: "UL", cmd: "insertUnorderedList" },
  { id: "ol", label: "Liste numérotée", tag: "OL", cmd: "insertOrderedList" },
];

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "LI", "UL", "OL"]);

/** Bloc contenant un nœud, à l'intérieur de l'éditeur. */
function closestBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  let el: Node | null = node;
  while (el && el !== root) {
    if (el.nodeType === 1 && BLOCK_TAGS.has((el as HTMLElement).tagName)) return el as HTMLElement;
    el = el.parentNode;
  }
  return null;
}

/** Étiquette du bloc courant, telle qu'affichée dans la barre flottante. */
function blockLabel(el: HTMLElement | null): string {
  if (!el) return "Texte normal";
  if (el.tagName === "LI") {
    return el.closest("ol") ? "Liste numérotée" : "Liste à puces";
  }
  return BLOCKS.find((b) => b.tag === el.tagName)?.label ?? "Texte normal";
}

type BarState = { top: number; left: number } | null;

export function RichNoteEditor({
  value,
  onChange,
  placeholder,
  rows = 10,
  autoFocus,
  footer,
}: {
  /** Markdown. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  /**
   * Bloc affiché DANS le cadre, sous la zone de saisie, mais HORS du texte
   * édité : la signature d'un e-mail. On la voit à sa vraie place — au bas du
   * message — sans qu'elle entre dans ce qui est enregistré. L'y coller
   * vraiment la figerait (un numéro changé sur la fiche ne suivrait plus) et
   * la doublerait, puisque l'envoi l'ajoute déjà.
   */
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(!value);
  const [bar, setBar] = useState<BarState>(null);
  const [menu, setMenu] = useState(false);
  const [current, setCurrent] = useState("Texte normal");
  const [marks, setMarks] = useState({ bold: false, italic: false });

  // Contenu initial seulement : voir l'en-tête (curseur).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = markdownToHtml(value);
    setEmpty(!el.textContent?.trim());
    if (autoFocus) el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim());
    onChange(htmlToMarkdown(el));
  }, [onChange]);

  /**
   * Place la barre au-dessus de la sélection, ou la retire.
   *
   * Coordonnées de la FENÊTRE (`position: fixed`) : la barre est rendue par
   * portail sur `<body>` pour passer au-dessus du drawer, elle ne peut donc pas
   * se positionner par rapport à l'éditeur.
   */
  const syncBar = useCallback(() => {
    const el = ref.current;
    const sel = typeof window === "undefined" ? null : window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode)) {
      setBar(null);
      setMenu(false);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setBar(null);
      return;
    }
    setBar({ top: rect.top, left: rect.left + rect.width / 2 });
    setCurrent(blockLabel(closestBlock(sel.anchorNode, el)));
    setMarks({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", syncBar);
    // La sélection ne bouge pas quand la page défile, mais son écran, si.
    window.addEventListener("scroll", syncBar, true);
    window.addEventListener("resize", syncBar);
    return () => {
      document.removeEventListener("selectionchange", syncBar);
      window.removeEventListener("scroll", syncBar, true);
      window.removeEventListener("resize", syncBar);
    };
  }, [syncBar]);

  /**
   * `document.execCommand` est officiellement obsolète mais reste la seule API
   * gérée par tous les navigateurs pour formater une sélection SANS reconstruire
   * soi-même curseur, annulation et sélections multiples. Le jour où elle
   * disparaîtra, seul ce fichier changera : ce qui est stocké est du Markdown,
   * pas ce que produit l'éditeur.
   */
  const exec = useCallback(
    (command: string, arg?: string) => {
      ref.current?.focus();
      document.execCommand(command, false, arg);
      emit();
      syncBar();
    },
    [emit, syncBar],
  );

  const applyBlock = (b: (typeof BLOCKS)[number]) => {
    setMenu(false);
    if (b.cmd === "formatBlock") exec("formatBlock", `<${b.tag.toLowerCase()}>`);
    else exec(b.cmd!);
  };

  /**
   * Raccourcis de frappe, à la Notion : « # », « ## », « - », « * », « 1. »
   * suivis d'une espace, EN DÉBUT DE BLOC, transforment le bloc.
   *
   * On ne déclenche que si le curseur est juste après la marque, dans le premier
   * nœud texte du bloc : « 3 - 4 » au milieu d'une phrase ne doit évidemment pas
   * créer de liste.
   */
  const handleMarkdownShortcut = (): boolean => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3) return false;

    const block = closestBlock(node, el);
    if (!block || block.tagName === "LI") return false;
    // Premier nœud texte du bloc, sinon la marque n'est pas en tête de ligne.
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    if (walker.nextNode() !== node) return false;

    const prefix = (node.textContent ?? "").slice(0, sel.anchorOffset);
    const rule =
      prefix === "#"
        ? { cmd: "formatBlock", arg: "<h3>" }
        : prefix === "##"
          ? { cmd: "formatBlock", arg: "<h4>" }
          : prefix === "-" || prefix === "*"
            ? { cmd: "insertUnorderedList" }
            : /^\d+[.)]$/.test(prefix)
              ? { cmd: "insertOrderedList" }
              : null;
    if (!rule) return false;

    // La marque disparaît : elle a servi à déclencher, elle n'est pas du texte.
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, sel.anchorOffset);
    range.deleteContents();
    sel.removeAllRanges();
    const caret = document.createRange();
    caret.setStart(node, 0);
    caret.collapse(true);
    sel.addRange(caret);

    exec(rule.cmd, rule.arg);
    return true;
  };

  return (
    <div className="tim-rte">
      <div
        ref={ref}
        className={`tim-rte__area${empty ? " tim-rte__area--empty" : ""}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder ?? "Note"}
        data-placeholder={placeholder}
        style={{ minHeight: `${rows * 1.6}rem` }}
        onInput={emit}
        onBlur={emit}
        onMouseUp={syncBar}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          emit();
        }}
        onKeyDown={(e) => {
          if (e.key === " " && handleMarkdownShortcut()) {
            e.preventDefault();
            return;
          }
          if (e.key === "Escape" && bar) {
            // Referme la barre sans fermer le drawer derrière.
            e.stopPropagation();
            setBar(null);
            return;
          }
          if (!(e.metaKey || e.ctrlKey)) return;
          const key = e.key.toLowerCase();
          if (key === "b") {
            e.preventDefault();
            exec("bold");
          }
          if (key === "i") {
            e.preventDefault();
            exec("italic");
          }
        }}
      />

      {footer}

      {empty && (
        <p className="tim-rte__tip">
          <strong>#</strong> + espace pour un titre, <strong>-</strong> pour une liste. Sélectionnez
          du texte pour le mettre en forme.
        </p>
      )}

      {bar &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="tim-rte__bubble"
            style={{ top: bar.top, left: bar.left }}
            // Le clic ne doit pas déplacer le focus : sans ça, la sélection à
            // formater disparaîtrait avant même que la commande ne s'exécute.
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="tim-rte__block">
              <button
                type="button"
                className="tim-rte__block-btn"
                onClick={() => setMenu((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menu}
              >
                {current}
                <span className="tim-rte__chev">›</span>
              </button>
              {menu && (
                <div className="tim-rte__menu" role="menu">
                  {BLOCKS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      role="menuitem"
                      className={`tim-rte__menu-item${current === b.label ? " is-on" : ""}`}
                      onClick={() => applyBlock(b)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="tim-rte__sep" />

            <button
              type="button"
              className={`tim-rte__mark tim-rte__mark--bold${marks.bold ? " is-on" : ""}`}
              title="Gras (⌘B)"
              aria-label="Gras"
              onClick={() => exec("bold")}
            >
              B
            </button>
            <button
              type="button"
              className={`tim-rte__mark tim-rte__mark--italic${marks.italic ? " is-on" : ""}`}
              title="Italique (⌘I)"
              aria-label="Italique"
              onClick={() => exec("italic")}
            >
              I
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
