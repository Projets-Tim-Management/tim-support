"use client";

import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Infobulle instantanée.
 *
 * L'attribut `title` natif ne convient pas ici pour deux raisons : il n'apparaît
 * qu'après une à deux secondes d'immobilité (on croit qu'il n'y a rien), et il
 * n'existe pas au clavier. Rendue par PORTAIL sur <body>, elle échappe en plus
 * au `overflow: auto` de la liste d'étapes, qui la rognerait.
 */
export function Tooltip({
  content,
  className,
  interactive,
  children,
}: {
  /** Lignes de l'infobulle. La première sert de titre. */
  content: string[];
  className?: string;
  /**
   * L'enfant est déjà focusable (un bouton) : l'enveloppe ne prend pas le focus,
   * sinon la tabulation s'arrêterait deux fois au même endroit. `onFocus`
   * remonte depuis l'enfant, l'infobulle s'ouvre quand même au clavier.
   */
  interactive?: boolean;
  children: ReactNode;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const open = useCallback((e: React.MouseEvent | React.FocusEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchor({ x: r.left + r.width / 2, y: r.top });
  }, []);

  const close = useCallback(() => setAnchor(null), []);

  const [title, ...rest] = content;

  return (
    <>
      <span
        className={className}
        tabIndex={interactive ? undefined : 0}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
      >
        {children}
      </span>

      {anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            className="jr-tip"
            style={{
              // Bornée à la fenêtre : près d'un bord, l'infobulle se recentre
              // au lieu de sortir de l'écran.
              left: Math.min(Math.max(anchor.x, 170), window.innerWidth - 170),
              top: anchor.y - 10,
            }}
          >
            <span className="jr-tip__title">{title}</span>
            {rest.map((line, i) => (
              <span key={i} className="jr-tip__line">
                {line}
              </span>
            ))}
          </span>,
          document.body,
        )}
    </>
  );
}
