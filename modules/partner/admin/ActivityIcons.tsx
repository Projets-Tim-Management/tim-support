"use client";

/**
 * Icônes de l'historique : les trois gestes (note, e-mail, tâche) ET les natures
 * de tâche (appel, réunion, déjeuner, échéance, LinkedIn).
 *
 * Un même jeu pour les deux, parce qu'une tâche « Appel » mérite l'icône du
 * téléphone dans la chronologie, pas la coche générique — c'est ce qui permet
 * de balayer l'historique sans lire.
 *
 * En SVG inline plutôt qu'en police d'icônes ou en fichiers : cinq traits qui
 * suivent la couleur du texte (`currentColor`), donc justes dans un bouton comme
 * dans une pastille de chronologie, sans requête supplémentaire.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const IconNote = () => (
  <svg {...base}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const IconPhone = () => (
  <svg {...base}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  </svg>
);

const IconMeeting = () => (
  <svg {...base}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.1a4 4 0 0 1 0 7.8" />
  </svg>
);

const IconMail = () => (
  <svg {...base}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </svg>
);

const IconTask = () => (
  <svg {...base}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const IconLunch = () => (
  <svg {...base}>
    <path d="M3 2v7a3 3 0 0 0 3 3 3 3 0 0 0 3-3V2" />
    <path d="M6 2v20" />
    <path d="M18 2c-1.7 1.2-2.5 3-2.5 5.5S16.3 12 18 13v9" />
  </svg>
);

const IconFlag = () => (
  <svg {...base}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z" />
    <path d="M4 22V4" />
  </svg>
);

const IconLinkedIn = () => (
  <svg {...base}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 10v7" />
    <path d="M8 7v.01" />
    <path d="M12 17v-4a2 2 0 0 1 4 0v4" />
  </svg>
);

/**
 * Clé → icône. Les clés mêlent volontairement types d'activité et natures de
 * tâche : `appel` désigne les deux, et c'est bien la même icône qu'on veut.
 */
const BY_KIND: Record<string, () => React.JSX.Element> = {
  note: IconNote,
  email: IconMail,
  tache: IconTask,
  "a-faire": IconTask,
  appel: IconPhone,
  reunion: IconMeeting,
  dejeuner: IconLunch,
  echeance: IconFlag,
  linkedin: IconLinkedIn,
};

/** Icône d'un type d'activité ; rien si le type n'en a pas (journal auto). */
export function ActivityIcon({ kind }: { kind?: string | null }) {
  const Icon = kind ? BY_KIND[kind] : undefined;
  return Icon ? <Icon /> : null;
}
