"use client";

import { useState, type ReactNode } from "react";

const baseClass = "nav-group";

/** Chevron replié (droite) / déplié (bas) — rotation pilotée en CSS. */
function Chevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  label: string;
  children: ReactNode;
  /** Mode contrôlé : si `open`/`onToggle` sont fournis, le parent pilote l'état
   *  (utilisé pour l'accordéon des groupes de 1er niveau). Sinon, état local. */
  open?: boolean;
  onToggle?: () => void;
  /** Mode non contrôlé : état initial (sous-groupes). */
  defaultOpen?: boolean;
  /**
   * Libellé exposé au CSS (`data-nav-group`) pour poser l'icône du groupe en
   * mode réduit. Sur les sous-groupes, il n'y en a pas : ils ne s'affichent
   * jamais dans la colonne d'icônes.
   */
  iconKey?: string;
  /**
   * Infobulle native. Posée seulement quand le menu est réduit : c'est là
   * qu'une icône seule ne dit pas ce qu'elle ouvre. En mode déplié le libellé
   * est écrit à côté, et un titre qui répète le texte visible n'apporte rien.
   */
  title?: string;
}

/**
 * Groupe de menu repliable, aux mêmes classes que le NavGroup de Payload
 * (`nav-group`, `__toggle`, `__label`, `__content`, `--collapsed`) pour rester
 * compatible avec tout le SCSS existant — mais entièrement contrôlable, ce qui
 * permet le comportement accordéon (un seul groupe ouvert à la fois).
 */
export default function CollapsibleGroup({
  label,
  children,
  open: openProp,
  onToggle,
  defaultOpen = false,
  iconKey,
  title,
}: Props) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : localOpen;
  const toggle = controlled ? onToggle : () => setLocalOpen((o) => !o);

  return (
    <div className={`${baseClass}${open ? "" : ` ${baseClass}--collapsed`}`}>
      <button
        type="button"
        className={`${baseClass}__toggle`}
        onClick={toggle}
        aria-expanded={open}
        {...(title ? { title } : {})}
        {...(iconKey ? { "data-nav-group": iconKey } : {})}
      >
        <span className={`${baseClass}__label`}>{label}</span>
        <span className={`${baseClass}__indicator`}>
          <Chevron />
        </span>
      </button>
      {/* Wrapper grille pour animer la hauteur sans clipping (0fr ↔ 1fr). */}
      <div className={`${baseClass}__content`}>
        <div className={`${baseClass}__list`}>{children}</div>
      </div>
    </div>
  );
}
