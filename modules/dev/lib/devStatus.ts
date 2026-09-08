/**
 * Statuts d'un développement — désormais du CONTENU, plus du code.
 *
 * Les statuts vivent dans la collection `dev-statuses` : on en ajoute, on en
 * renomme, on en recolore et on les réordonne depuis « Développements ›
 * Paramètres › Statuts », et chaque statut est une colonne du Kanban. Aucune
 * migration n'est nécessaire pour en créer un — c'était le prix de l'enum
 * Postgres, et c'est ce qui a fait renoncer à cette rigidité.
 *
 * Ce fichier ne garde donc que ce qui doit rester STABLE :
 *  - les PHASES, qui regroupent les colonnes et structurent l'écran ;
 *  - les RÔLES, par lesquels un statut déclenche un automatisme (dater le
 *    démarrage, dater la livraison, clore le dossier) — le code ne peut pas
 *    deviner qu'un statut nouvellement créé signifie « c'est livré », il faut
 *    que la fiche du statut le dise ;
 *  - le jeu de DÉPART, semé une seule fois dans une base vide (lib/seed.ts).
 */

/** Les 5 phases du cycle. Le code raisonne par PHASE, jamais par statut nommé. */
export type DevPhaseValue = "entree" | "etude" | "realisation" | "livraison" | "hors-flux";

export type DevPhase = {
  value: DevPhaseValue;
  label: string;
  /** Ce que la phase veut dire, affiché en tête de colonne / d'onglet. */
  hint: string;
};

/**
 * Beaucoup de statuts d'un coup d'œil, c'est illisible ; cinq phases, non. Les
 * phases sont l'échelon auquel on regarde le tableau de loin (« il y a du monde
 * en Étude »), les statuts celui auquel on travaille.
 */
export const DEV_PHASES: DevPhase[] = [
  { value: "entree", label: "Entrée", hint: "Reçu, pas encore instruit" },
  { value: "etude", label: "Étude", hint: "On cherche à comprendre et à chiffrer" },
  { value: "realisation", label: "Réalisation", hint: "Le travail est engagé" },
  { value: "livraison", label: "Livraison", hint: "Ça part, ou c'est parti" },
  // Ni une fin, ni une étape : ce qui est sorti du flux. « En attente » y vit
  // aussi — un dev bloqué n'est pas terminé, mais il n'avance plus, et le voir
  // dans la colonne « En développement » ferait mentir le tableau.
  { value: "hors-flux", label: "Hors flux", hint: "En pause, écarté ou fusionné" },
];

export const DEV_PHASE_OPTIONS = DEV_PHASES.map(({ label, value }) => ({ label, value }));

/**
 * Ce qu'un statut DÉCLENCHE. Sans ces rôles, un statut créé en back-office ne
 * serait qu'une étiquette : le système ne saurait pas qu'y arriver signifie
 * « le travail a commencé » et n'aurait plus daté aucun jalon.
 */
export type DevStatusRole = "demarre" | "livre" | "cloture";

export const DEV_STATUS_ROLES: { value: DevStatusRole; label: string; hint: string }[] = [
  {
    value: "demarre",
    label: "Démarre le travail",
    hint: "Date le démarrage la première fois qu'un développement atteint ce statut.",
  },
  {
    value: "livre",
    label: "Marque la livraison",
    hint: "Date la livraison : c'est chez l'utilisateur.",
  },
  {
    value: "cloture",
    label: "Clôt le dossier",
    hint: "Plus rien n'est attendu — le développement sort des vues de travail.",
  },
];

export const DEV_STATUS_ROLE_OPTIONS = DEV_STATUS_ROLES.map(({ label, value }) => ({ label, value }));

/** Un statut tel qu'il revient de la base (lecture défensive : tout est optionnel). */
export type DevStatusDoc = {
  id: number | string;
  key?: string | null;
  name?: string | null;
  color?: string | null;
  phase?: string | null;
  roles?: string[] | null;
  hint?: string | null;
  /**
   * Stockée en `numeric` côté Postgres : selon la couche de lecture (API ou
   * couche db brute), elle revient en nombre ou en chaîne. Tout ce qui la
   * consomme passe donc par `positionOf`.
   */
  position?: number | string | null;
};

/** Position d'un statut, quelle que soit la forme sous laquelle elle arrive. */
export const positionOf = (status: DevStatusDoc | null | undefined): number | null => {
  const raw = Number(status?.position);
  return Number.isFinite(raw) ? raw : null;
};

export const statusHasRole = (status: DevStatusDoc | null | undefined, role: DevStatusRole): boolean =>
  Array.isArray(status?.roles) && status.roles.includes(role);

/**
 * Clé du statut d'ENTRÉE : celui posé sur un développement qui vient de naître.
 *
 * Cherchée par clé, qui ne bouge pas quand on renomme le statut. Si elle a
 * disparu — le statut peut être supprimé en back-office —, le code retombe sur
 * la première colonne du tableau, qui est par construction celle où arrivent les
 * demandes (voir hooks/stamps.ts).
 */
export const DEFAULT_STATUS_KEY = "qualification";

/**
 * Le jeu de départ — semé UNE FOIS dans une base vide, puis à la main de
 * l'équipe.
 *
 * ⚠️ Ce n'est PAS la liste en vigueur : les colonnes réelles vivent en base et
 * se règlent dans « Paramètres › Statuts ». Ce tableau ne sert qu'à amorcer une
 * base vierge — il reprend le jeu retenu par l'équipe le 08/09/2026, pour qu'une
 * nouvelle installation démarre sur le tableau que les gens connaissent.
 *
 * Les positions sont espacées : intercaler un statut ne demande pas de
 * renuméroter les autres.
 */
export type DevStatusSeed = {
  key: string;
  name: string;
  color: string;
  phase: DevPhaseValue;
  position: number;
  roles: DevStatusRole[];
  hint?: string;
};

export const DEV_STATUS_SEED: DevStatusSeed[] = [
  // ── Entrée ───────────────────────────────────────────────────────────────
  { key: "qualification", name: "En qualification", color: "blue", phase: "entree", position: 20, roles: [], hint: "On fait préciser le besoin au demandeur." },

  // ── Étude ────────────────────────────────────────────────────────────────
  // Un bug non reproduit n'est pas « en développement » : le distinguer, c'est
  // voir combien de signalements attendent un diagnostic.
  { key: "investigation", name: "En investigation", color: "indigo", phase: "etude", position: 40, roles: [], hint: "Bug : reproduire et diagnostiquer avant de corriger." },
  { key: "attente-validation", name: "En attente de validation", color: "purple", phase: "etude", position: 60, roles: [], hint: "La décision appartient à TIM ou au client." },

  // ── Réalisation ──────────────────────────────────────────────────────────
  { key: "en-cours", name: "En développement", color: "amber", phase: "realisation", position: 80, roles: ["demarre"] },
  { key: "en-test", name: "En test", color: "teal", phase: "realisation", position: 90, roles: ["demarre"], hint: "On vérifie que ça fait bien ce qui était demandé, avant de livrer." },

  // ── Livraison ────────────────────────────────────────────────────────────
  { key: "en-production", name: "En production", color: "green", phase: "livraison", position: 120, roles: ["demarre", "livre"], hint: "Livré, en observation chez les utilisateurs." },
  // Le pont vers le site support : un dev livré mais non documenté est un dev
  // que le client ne trouvera pas. Sa couleur tranche volontairement entre les
  // deux verts de la phase — c'est la colonne qu'on ne doit pas oublier.
  { key: "a-documenter", name: "À documenter", color: "rose", phase: "livraison", position: 130, roles: ["demarre", "livre"], hint: "En production, mais la fiche du site support reste à écrire." },
  { key: "termine", name: "Terminé", color: "green", phase: "livraison", position: 140, roles: ["demarre", "livre", "cloture"], hint: "Livré et documenté. Plus rien à faire." },

  // ── Hors flux ────────────────────────────────────────────────────────────
  { key: "en-attente", name: "En attente", color: "slate", phase: "hors-flux", position: 200, roles: [], hint: "Bloqué par un tiers, une décision ou un prérequis." },
  { key: "non-retenu", name: "Non retenu", color: "red", phase: "hors-flux", position: 210, roles: ["cloture"], hint: "Étudié puis écarté. On garde la trace pour ne pas le réétudier." },
  { key: "abandonne", name: "Abandonné", color: "gray", phase: "hors-flux", position: 220, roles: ["cloture"], hint: "Commencé puis arrêté." },
  { key: "doublon", name: "Doublon", color: "gray", phase: "hors-flux", position: 230, roles: ["cloture"], hint: "La même demande existe ailleurs — la rattacher au dev qui la porte." },
];
