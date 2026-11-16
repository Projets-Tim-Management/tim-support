/**
 * Présentation de la V2 de l'application mobile — page publique envoyée aux
 * clients (/app-mobile-v2) : la vidéo et ce qui change pour chaque profil.
 *
 * Tout ce qui se règle est ici, et nulle part ailleurs : le contenu des onglets,
 * la vidéo. La prise de rendez-vous de la page est fermée (16/11/2026) : les
 * rendez-vous se prennent sur les pages /rdv (modules/booking).
 */

/** Identifiant du compteur de vues (analyses → vidéos). */
export const APP_V2_VIDEO_ID = "app-mobile-v2";
export const APP_V2_PATH = "/app-mobile-v2";

/**
 * Les interlocuteurs : la page se lit sous `/app-mobile-v2/<interlocuteur>`, et
 * c'est l'agenda, le nom et la photo de CETTE fiche partenaire que le client
 * voit. Liste fermée : une adresse qui n'y est pas renvoie une page introuvable
 * — on ne réserve pas dans l'agenda de n'importe qui en tapant une URL.
 *
 * Par identifiant de fiche, jamais par e-mail (voir resolvePartner) — dev et
 * prod partagent la même base, l'identifiant est le même partout.
 *
 * ⚠️ Un SECOND interlocuteur demandera de rattacher chaque rendez-vous à son
 * hôte (registre `presentation-bookings`) : aujourd'hui le créneau verrouillé et
 * l'annulation d'agenda supposent un hôte unique.
 */
export const APP_V2_HOSTS: Record<string, number> = {
  cpiancatelli: 6,
};
export const APP_V2_DEFAULT_HOST = "cpiancatelli";

/** Fiche partenaire de l'interlocuteur par défaut (Charlie Piancatelli). */
export const APP_V2_HOST_PARTNER_ID = APP_V2_HOSTS[APP_V2_DEFAULT_HOST];

/** Fiche partenaire d'un interlocuteur de l'URL, ou null s'il n'est pas dans la liste. */
export const appV2HostId = (slug?: string | null): number | null =>
  slug && Object.prototype.hasOwnProperty.call(APP_V2_HOSTS, slug) ? APP_V2_HOSTS[slug] : null;

/** Adresse de la page d'un interlocuteur : `/app-mobile-v2/cpiancatelli`. */
export const appV2Path = (slug: string = APP_V2_DEFAULT_HOST): string => `${APP_V2_PATH}/${slug}`;

/**
 * Vidéo : même fabrication que les vidéos de la vitrine (AV1 + H.264 1080p +
 * 720p, faststart — voir docs/videos/FABRICATION.md côté tim-front), mais
 * hébergée sur le Blob DU SUPPORT, celui de ses médias : la page est au support,
 * ses fichiers aussi. L'aperçu est dans public/videos/.
 */
const BLOB = "https://ytlg8jezeqmgptjq.public.blob.vercel-storage.com";

export const APP_V2_VIDEO = {
  id: APP_V2_VIDEO_ID,
  titre: "L'application mobile V2.0",
  dureeSecondes: 251,
  sources: {
    av1: `${BLOB}/app-mobile-v2-1080p-av1.mp4`,
    mp4: `${BLOB}/app-mobile-v2-1080p.mp4`,
    mp4Mobile: `${BLOB}/app-mobile-v2-720p.mp4`,
  },
  poster: {
    url: "/videos/app-mobile-v2-poster.jpg",
    largeur: 1920,
    hauteur: 1080,
    alt: "Les trois écrans d'accueil de la V2 : Compagnon visuel, Compagnon, Chef de chantier et Conducteur de travaux",
  },
} as const;

export type AppV2Change = {
  titre: string;
  texte: string;
  /** Nouveau dans la V2 (badge « Nouveau »), plutôt qu'une évolution de l'existant. */
  nouveau?: boolean;
};

/**
 * Couleur d'un rôle — celles des étiquettes de la vidéo (jaune, bleu, vert,
 * violet), qui sont déjà les tokens de l'app : le client retrouve sur la page
 * le code couleur qu'il vient de voir à l'écran.
 */
export type AppV2Tone = "processing" | "absence" | "success" | "unavailable";

export type AppV2Profile = {
  id: "compagnon-visuel" | "compagnon" | "encadrement";
  label: string;
  /** Les rôles couverts, avec leur couleur (l'encadrement en réunit deux). */
  roles: { label: string; tone: AppV2Tone }[];
  /**
   * Écrans de l'app (public/app-v2) : les captures d'iPhone de Charlie, une par
   * profil. Plusieurs écrans défileraient (voir Phone) — on s'en tient à ses
   * captures, sans écran tiré de la vidéo.
   */
  screens: { src: string; alt: string; full?: boolean }[];
  /** Pour qui, en une ligne : le client doit se reconnaître sans hésiter. */
  pourQui: string;
  intro: string;
  changes: AppV2Change[];
};

/**
 * Le contenu des trois onglets, d'après la liste de Charlie (23/10/2026).
 * Un titre court et une phrase qui dit ce que ça change sur le chantier, pas
 * comment c'est codé.
 */
export const APP_V2_PROFILES: AppV2Profile[] = [
  {
    id: "compagnon-visuel",
    label: "Compagnon visuel",
    roles: [{ label: "Compagnon visuel", tone: "processing" }],
    screens: [{ src: "/app-v2/ecran-visuel-3.jpg", alt: "Profil Compagnon visuel : planning de la semaine, documents et demandes d'absence", full: true }],
    pourQui: "Nouveau profil en V2, pour les compagnons qui consultent sans pointer.",
    intro: "Un accès en lecture seule à ce qui le concerne, et ses demandes de congé.",
    changes: [
      {
        titre: "Le planning, toujours sous la main",
        texte: "Le compagnon voit où il est prévu et sur quel chantier, sans avoir à demander.",
        nouveau: true,
      },
      {
        titre: "Les pointages effectués",
        texte: "Il retrouve les heures pointées pour lui, jour par jour.",
        nouveau: true,
      },
      {
        titre: "Les demandes de congé",
        texte: "Il pose sa demande depuis l'application et reçoit la réponse par e-mail.",
        nouveau: true,
      },
    ],
  },
  {
    id: "compagnon",
    label: "Compagnon",
    roles: [{ label: "Compagnon", tone: "absence" }],
    screens: [{ src: "/app-v2/ecran-chrono-3.jpg", alt: "Pointage au chrono en cours", full: true }],
    pourQui: "Pour les compagnons qui pointent leurs heures au quotidien.",
    intro: "Le pointage arrive sur l'écran d'accueil : moins d'onglets, moins de gestes.",
    changes: [
      {
        titre: "Pointer depuis l'accueil",
        texte: "L'onglet Pointage a fusionné avec l'Accueil : le compagnon y fait ses pointages, en mode standard ou au chrono.",
      },
      {
        titre: "Le chrono en un clic",
        texte: "Un seul chantier prévu : un clic suffit pour lancer le chrono. Plusieurs : un clic pour choisir le chantier, un second pour démarrer.",
      },
      {
        titre: "Le pointage standard en deux clics",
        texte: "Toujours deux gestes : sélectionner, puis valider.",
      },
      {
        titre: "Les demandes de congé",
        texte: "Depuis l'onglet Profil : choisir l'absence, la période, ajouter si besoin un commentaire ou un justificatif. Le bureau valide ou refuse, et le compagnon est prévenu par e-mail.",
        nouveau: true,
      },
      {
        titre: "Un document ou une photo de chantier en deux clics",
        texte: "La partie Chantier a été simplifiée : un bon, une photo, un plan s'ajoutent en deux clics.",
      },
    ],
  },
  {
    id: "encadrement",
    label: "Chef de chantier & Conducteur de travaux",
    roles: [
      { label: "Chef de chantier", tone: "success" },
      { label: "Conducteur de travaux", tone: "unavailable" },
    ],
    screens: [{ src: "/app-v2/ecran-equipe-3.jpg", alt: "Accueil du chef de chantier : l'équipe du jour à pointer", full: true }],
    pourQui: "Pour ceux qui pointent pour leur équipe et suivent leurs compagnons.",
    intro: "L'onglet Pointage reste là, avec un accès direct à la fiche de chaque ouvrier.",
    changes: [
      {
        titre: "L'onglet Pointage conservé",
        texte: "Ils voient toujours les équipes de leurs chantiers et choisissent qui pointer.",
      },
      {
        titre: "La fiche ouvrier d'un glissé",
        texte: "Un glissé vers la droite sur un ouvrier ouvre sa fiche et ses documents : carte BTP, pièce d'identité…",
        nouveau: true,
      },
      {
        titre: "Les demandes de congé",
        texte: "Comme les compagnons, ils posent leurs propres demandes depuis l'application.",
        nouveau: true,
      },
    ],
  },
];
