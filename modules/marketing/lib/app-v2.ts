import type { SchedulingRules } from "@/modules/marketing/lib/scheduling";

/**
 * Présentation de la V2 de l'application mobile — page publique envoyée aux
 * clients (/app-mobile-v2) : la vidéo, ce qui change pour chaque profil, et la
 * prise de rendez-vous pour un tour de l'app avant la mise en production.
 *
 * Tout ce qui se règle est ici, et nulle part ailleurs : le contenu des onglets,
 * la vidéo, et les règles des créneaux. Ces règles sont PROPRES à la page — elles
 * ne touchent pas à celles de la session de prise en main réglées sur la fiche
 * partenaire, qui restent ce qu'elles sont.
 */

/** Identifiant du compteur de vues (analyses → vidéos). */
export const APP_V2_VIDEO_ID = "app-mobile-v2";
export const APP_V2_PATH = "/app-mobile-v2";

/**
 * Fiche partenaire dont l'agenda reçoit les rendez-vous : Charlie Piancatelli.
 * Par identifiant, jamais par e-mail (voir resolvePartner) — dev et prod
 * partagent la même base, l'identifiant est donc le même partout.
 */
export const APP_V2_HOST_PARTNER_ID = 6;

/**
 * Règles des créneaux : 20 minutes, mardi, mercredi et jeudi de 14 h à 18 h.
 * Dix minutes entre deux rendez-vous : la grille tombe sur les demi-heures
 * (14 h, 14 h 30…), plus lisible pour le client et plus vivable pour l'agenda.
 */
export const APP_V2_RULES: SchedulingRules = {
  hours: {
    "2": [{ start: "14:00", end: "18:00" }],
    "3": [{ start: "14:00", end: "18:00" }],
    "4": [{ start: "14:00", end: "18:00" }],
  },
  durationMin: 20,
  bufferMin: 10,
  minNoticeHours: 24,
  // Large : c'est `APP_V2_BOOKING_UNTIL` qui borne vraiment l'offre.
  horizonDays: 60,
};

/**
 * Dernier jour proposé. La mise en production est prévue courant novembre :
 * passé cette date, un tour « avant la mise en production » n'a plus de sens.
 * À avancer dès que la date est fixée.
 */
export const APP_V2_BOOKING_UNTIL = "2026-11-30T23:59:59+01:00";

/**
 * Créneaux OUVERTS par après-midi, sur les huit que la grille permet.
 *
 * Volontairement peu, et en nombre VARIABLE d'un jour à l'autre (décision de
 * Charlie, 23/10/2026) : trois le plus souvent, parfois quatre ou cinq, parfois
 * un ou deux. Une offre resserrée et irrégulière se lit comme un agenda demandé.
 *
 * Tout est FIXE — le nombre du jour comme les heures retenues, les mêmes à
 * chaque visite — et se décide sur la grille entière, AVANT de retirer ce qui est
 * occupé : un créneau réservé disparaît donc sans être remplacé, et l'offre fond
 * pour de vrai au fil des réservations.
 */
const SLOTS_PER_DAY_WEIGHTS: [count: number, weight: number][] = [
  [1, 1],
  [2, 2],
  [3, 4],
  [4, 2],
  [5, 1],
];

/** Nombre de créneaux ouverts pour un jour donné, tiré une fois pour toutes. */
const slotsForDay = (day: string): number => {
  const total = SLOTS_PER_DAY_WEIGHTS.reduce((n, [, w]) => n + w, 0);
  let pick = hash(`jour-${day}`) % total;
  for (const [count, weight] of SLOTS_PER_DAY_WEIGHTS) {
    if (pick < weight) return count;
    pick -= weight;
  }
  return 3;
};

/** Empreinte stable d'un créneau : sert seulement à mélanger, pas à sécuriser. */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * Les créneaux ouverts d'une grille : par jour (heure de Paris), autant que
 * `slotsForDay` en accorde, pris en tête du mélange.
 */
export function openSlots(grid: string[]): Set<string> {
  const byDay = new Map<string, string[]>();
  for (const s of grid) {
    const day = new Date(s).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const open = new Set<string>();
  for (const [day, slots] of byDay) {
    [...slots]
      .sort((a, b) => hash(a) - hash(b))
      .slice(0, slotsForDay(day))
      .forEach((s) => open.add(s));
  }
  return open;
}

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
  /** Écrans de l'app (public/app-v2), dans l'ordre où ils défilent. */
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
    screens: [
      // Le chrono d'abord : c'est l'écran mis en avant en haut de la page (capture
      // réelle, qui remplit le téléphone), l'accueil vient ensuite dans l'onglet.
      { src: "/app-v2/ecran-chrono-3.jpg", alt: "Pointage au chrono en cours", full: true },
      { src: "/app-v2/ecran-accueil.jpg", alt: "Accueil du compagnon avec le bouton Pointer" },
    ],
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
    screens: [
      { src: "/app-v2/ecran-equipe-3.jpg", alt: "Accueil du chef de chantier : l'équipe du jour à pointer", full: true },
      { src: "/app-v2/ecran-fiche.jpg", alt: "Fiche d'un ouvrier, ouverte d'un glissé" },
    ],
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
