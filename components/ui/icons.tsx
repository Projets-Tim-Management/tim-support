/**
 * Icônes de l'interface — tracé, pas de remplissage.
 *
 * Rassemblées ici plutôt que redessinées dans chaque composant : le site en
 * comptait déjà une demi-douzaine copiées à la main, et deux traits d'épaisseur
 * différente sur le même écran se voient tout de suite.
 *
 * Style repris de l'existant (loupe, chevrons) : viewBox 24, `currentColor`,
 * trait de 2, embouts arrondis. La couleur et la taille viennent donc du parent
 * (`className="h-5 w-5 text-muted"`), jamais de l'icône.
 */

type IconProps = { className?: string };

const Svg = ({ className, children }: IconProps & { children: React.ReactNode }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** Agenda — la session de prise en main, qui se réserve à une date. */
export const IconCalendar = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

/** Presse-papier — le dossier de démarrage, une liste à remplir. */
export const IconClipboard = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
    <path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
    <path d="M9 12h6M9 16h4" />
  </Svg>
);

/** Clé — les accès applicatifs remis aux équipes. */
export const IconKey = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.85 12.15 21 2M18 5l3 3M15 8l3 3" />
  </Svg>
);

/** Croix — une saisie refusée. Le pendant exact de la coche, même trait. */
export const IconCross = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

/** Coche — un jalon acquis. */
export const IconCheck = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m5 13 4 4L19 7" />
  </Svg>
);

/** Personne seule — l'administrateur du compte. */
export const IconUser = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

/** Groupe — les salariés déclarés. */
export const IconUsers = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20a7 7 0 0 1 14 0" />
    <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.5a6 6 0 0 1 4 5.5" />
  </Svg>
);

/** Bâtiment — les chantiers ouverts pendant le test. */
export const IconBuilding = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15" />
    <path d="M15 11h4a1 1 0 0 1 1 1v9" />
    <path d="M2 21h20M8 9h3M8 13h3M8 17h3" />
  </Svg>
);

/** Utilitaire — la flotte de véhicules. */
export const IconTruck = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 16V7a1 1 0 0 1 1-1h9v10" />
    <path d="M13 9h3.6a1 1 0 0 1 .8.4L20 13v3" />
    <circle cx="7.5" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
    <path d="M9.3 17.5h5.9" />
  </Svg>
);

/** Bras articulé sur chenilles — les engins de chantier. */
export const IconMachine = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="16" width="18" height="4" rx="2" />
    <path d="M6 16v-3a1 1 0 0 1 1-1h4v4" />
    <path d="M11 13l5-6M16 7l3 3-2.5 2.5" />
  </Svg>
);

/** Enveloppe — envoyer ses accès à une personne, à son adresse. */
export const IconMail = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </Svg>
);

/** Imprimante — la fiche à découper et à remettre en main propre. */
export const IconPrinter = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </Svg>
);

/** Sablier / horloge — un envoi en cours, ou une attente. */
export const IconSpinner = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Svg>
);

/** Jalons reliés — le parcours d'apprentissage, étape par étape. */
export const IconRoute = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="6" cy="19" r="3" />
    <circle cx="18" cy="5" r="3" />
    <path d="M9 19h4a4 4 0 0 0 4-4V9" />
  </Svg>
);

/** Livre ouvert — la documentation des fonctionnalités. */
export const IconBook = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5V18c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2V4.5c-4.5 0-6.5.5-8 2Z" />
    <path d="M12 6.5V20" />
  </Svg>
);

/** Bulle — poser une question à l'équipe. */
export const IconChat = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8Z" />
  </Svg>
);
