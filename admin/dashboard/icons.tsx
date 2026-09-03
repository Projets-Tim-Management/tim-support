import type { ReactElement } from "react";

/**
 * Icônes ligne (style Lucide, viewBox 24, currentColor) pour le dashboard.
 * Server-safe : simples fonctions renvoyant un <svg>.
 */

const svg = (children: ReactElement | ReactElement[]) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

export const Icons = {
  reply: () => svg(<path d="M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v1" />),
  inbox: () =>
    svg([
      <path key="a" d="M4 13h4l2 3h4l2-3h4" />,
      <path key="b" d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />,
    ]),
  alert: () =>
    svg([
      <path key="a" d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" />,
      <line key="b" x1="12" y1="9" x2="12" y2="13" />,
      <line key="c" x1="12" y1="17" x2="12.01" y2="17" />,
    ]),
  check: () => svg(<path d="M20 6 9 17l-5-5" />),
  /** Fait : la coche DANS son cercle — l'état se lit sans lire le texte. */
  checkCircle: () =>
    svg([
      <circle key="c" cx="12" cy="12" r="9" />,
      <path key="v" d="m8.5 12 2.5 2.5 4.5-5" />,
    ]),
  /** Pas encore fait : le même cercle, vide. Deux formes de même taille se
      comparent d'un coup d'œil ; une coche présente ou absente, non. */
  circle: () => svg(<circle cx="12" cy="12" r="9" />),
  clock: () => svg([<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M12 7v5l3 2" />]),
  ticket: () =>
    svg(<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1 0 4H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />),
  partner: () =>
    svg([
      <path key="a" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />,
      <circle key="b" cx="9" cy="7" r="4" />,
      <path key="c" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
    ]),
  euro: () =>
    svg([
      <path key="a" d="M15 6a6 6 0 1 0 0 12" />,
      <line key="b" x1="4" y1="10" x2="13" y2="10" />,
      <line key="c" x1="4" y1="14" x2="13" y2="14" />,
    ]),
  coins: () =>
    svg([
      <circle key="a" cx="8" cy="8" r="6" />,
      <path key="b" d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" />,
    ]),
  mission: () =>
    svg([<circle key="a" cx="12" cy="12" r="9" />, <circle key="b" cx="12" cy="12" r="5" />, <circle key="c" cx="12" cy="12" r="1" />]),
  gift: () =>
    svg([
      <polyline key="a" points="20 12 20 22 4 22 4 12" />,
      <rect key="b" x="2" y="7" width="20" height="5" />,
      <line key="c" x1="12" y1="22" x2="12" y2="7" />,
      <path key="d" d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />,
    ]),
  feature: () => svg(<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />),
  parcours: () =>
    svg([
      <polygon key="a" points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />,
      <line key="b" x1="8" y1="2" x2="8" y2="18" />,
      <line key="c" x1="16" y1="6" x2="16" y2="22" />,
    ]),
  smile: () =>
    svg([<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M8 14s1.5 2 4 2 4-2 4-2" />, <line key="c" x1="9" y1="9" x2="9.01" y2="9" />, <line key="d" x1="15" y1="9" x2="15.01" y2="9" />]),
  users: () =>
    svg([<path key="a" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />, <circle key="b" cx="9" cy="7" r="4" />]),
  media: () =>
    svg([<rect key="a" x="3" y="3" width="18" height="18" rx="2" />, <circle key="b" cx="8.5" cy="8.5" r="1.5" />, <polyline key="c" points="21 15 16 10 5 21" />]),
  plus: () => svg(<path d="M12 5v14M5 12h14" />),
} as const;

export type IconName = keyof typeof Icons;
