import type { ElementType } from "@/modules/ads/video/elements";

/**
 * Les RÉGLAGES des éléments de motion design (plan Publicité, atelier des
 * éléments) : ce qu'on peut changer à un élément sans toucher à son code —
 * surface, coins, ombre, vitesse, style de coche, graisse du titre…
 *
 * C'est le contrat entre l'atelier (Publicité › Éléments), l'IA qui propose
 * des améliorations, et le moteur (remotion/elements.tsx) qui les applique.
 * Chaque réglage dit son nom, ses choix ou sa plage, et sa valeur par défaut :
 * une valeur hors contrat est refusée avec la raison, jamais appliquée.
 *
 * Ce qui ne tient pas dans ces réglages (un comportement nouveau) passe par
 * une demande de développement.
 */

export type ParamSpec =
  | { key: string; label: string; kind: "choix"; options: readonly string[]; defaut: string; aide?: string }
  | { key: string; label: string; kind: "nombre"; min: number; max: number; defaut: number; aide?: string }
  | { key: string; label: string; kind: "oui-non"; defaut: boolean; aide?: string };

/** Les réglages des éléments qui ont une surface (cartes de l'app, bulles, étiquettes). */
const SURFACE: ParamSpec[] = [
  { key: "surface", label: "Surface", kind: "choix", options: ["clair", "sombre", "accent", "verre"], defaut: "clair", aide: "« verre » : translucide et flouté, pour poser sur un rush." },
  { key: "coins", label: "Coins", kind: "choix", options: ["style", "carres", "arrondis", "pilule"], defaut: "style", aide: "« style » : ceux du style de la vidéo." },
  { key: "ombre", label: "Ombre", kind: "choix", options: ["aucune", "douce", "forte"], defaut: "forte" },
  { key: "bordure", label: "Bordure", kind: "choix", options: ["aucune", "fine", "accent"], defaut: "aucune" },
];

/** Les réglages de tous les éléments. */
const COMMON: ParamSpec[] = [
  { key: "taille_texte", label: "Taille du contenu", kind: "nombre", min: 0.7, max: 1.6, defaut: 1, aide: "Agrandit ou réduit le contenu de l'élément (textes et marges), dans sa largeur." },
  { key: "vitesse", label: "Vitesse des animations", kind: "nombre", min: 0.5, max: 2, defaut: 1, aide: "2 : deux fois plus vite." },
  { key: "rebond", label: "Rebond des entrées", kind: "nombre", min: 0, max: 3, defaut: 1.8, aide: "0 : aucun rebond." },
];

/** Les couleurs possibles d'une partie d'élément : celles du Kit de marque, jamais une couleur libre (la charte tient). */
export const COLOR = ["accent", "principale", "clair", "sombre", "texte-clair", "texte-sombre"] as const;
/** Pareil, avec « auto » : la couleur suit la surface (texte sombre sur surface claire, et l'inverse). */
const AUTO = ["auto", ...COLOR] as const;
const color = (key: string, label: string, defaut: string, auto = false): ParamSpec => ({ key, label, kind: "choix", options: auto ? AUTO : COLOR, defaut });
const TEXT = color("couleur_texte", "Couleur du texte", "auto", true);
const DOT = color("couleur_point", "Couleur du point d'en-tête", "accent");

const OWN: Record<ElementType, ParamSpec[]> = {
  liste: [
    ...SURFACE,
    { key: "coche", label: "Coche", kind: "choix", options: ["rond", "carre", "trait"], defaut: "rond" },
    { key: "avatars", label: "Avatars", kind: "choix", options: ["initiales", "silhouette", "photos", "aucun"], defaut: "initiales", aide: "« photos » : les visages déposés dans Médias publicitaires (nature « Visage ») ; sans visage déposé, la silhouette." },
    color("couleur_coche", "Couleur des coches", "accent"),
    color("couleur_avatar", "Couleur des avatars", "accent"),
    color("couleur_action", "Couleur du bouton final", "accent"),
    TEXT,
    DOT,
    { key: "cadence", label: "Cadence des lignes", kind: "nombre", min: 0.5, max: 2, defaut: 1, aide: "Multiplie l'écart entre deux lignes." },
    { key: "en_tete", label: "En-tête", kind: "oui-non", defaut: true },
  ],
  notification: [
    ...SURFACE,
    { key: "icone", label: "Icône", kind: "choix", options: ["app", "logo", "aucune"], defaut: "app" },
    { key: "heure", label: "« maintenant »", kind: "oui-non", defaut: true },
    { key: "coche", label: "Coche de confirmation", kind: "oui-non", defaut: true },
    color("couleur_icone", "Couleur de l'icône", "principale"),
    color("couleur_coche", "Couleur de la coche", "accent"),
    TEXT,
  ],
  bouton: [
    { key: "couleur", label: "Couleur du bouton", kind: "choix", options: COLOR, defaut: "accent" },
    { key: "coins", label: "Coins", kind: "choix", options: ["style", "carres", "arrondis", "pilule"], defaut: "style" },
    { key: "onde", label: "Onde au toucher", kind: "oui-non", defaut: true },
    { key: "confirmation", label: "Confirmation", kind: "choix", options: ["carte", "badge"], defaut: "carte" },
    color("couleur_texte", "Couleur du texte du bouton", "auto", true),
    color("couleur_onde", "Couleur de l'onde", "clair"),
    color("couleur_coche", "Couleur de la coche", "accent"),
  ],
  planning: [
    ...SURFACE,
    { key: "remplissage", label: "Remplissage", kind: "choix", options: ["blocs", "barres"], defaut: "blocs" },
    { key: "cadence", label: "Cadence", kind: "nombre", min: 0.5, max: 2, defaut: 1 },
    color("couleur_1", "Couleur de la 1re ligne (et 4e)", "accent"),
    color("couleur_2", "Couleur de la 2e ligne (et 5e)", "principale"),
    color("couleur_3", "Couleur de la 3e ligne", "sombre"),
    TEXT,
    DOT,
  ],
  fiche: [...SURFACE, { key: "puce", label: "Puce", kind: "choix", options: ["rond", "trait", "coche"], defaut: "rond" }, color("couleur_puce", "Couleur des puces", "accent"), TEXT, DOT],
  champ: [
    ...SURFACE,
    { key: "curseur", label: "Curseur clignotant", kind: "oui-non", defaut: true },
    { key: "frappe", label: "Vitesse de frappe", kind: "nombre", min: 0.5, max: 3, defaut: 1 },
    color("couleur_trait", "Couleur du trait et du curseur", "accent"),
    TEXT,
  ],
  badge: [
    { key: "couleur", label: "Couleur", kind: "choix", options: COLOR, defaut: "accent" },
    { key: "icone", label: "Icône", kind: "choix", options: ["coche", "etoile", "aucune"], defaut: "coche" },
    { key: "ombre", label: "Ombre", kind: "choix", options: ["aucune", "douce", "forte"], defaut: "forte" },
    color("couleur_texte", "Couleur du texte et de l'icône", "auto", true),
  ],
  tap: [{ key: "doigt", label: "Doigt", kind: "choix", options: ["disque", "anneau"], defaut: "disque" }, { key: "onde_couleur", label: "Couleur de l'onde", kind: "choix", options: COLOR, defaut: "accent" }, color("couleur_doigt", "Couleur du doigt", "texte-clair")],
  surbrillance: [
    { key: "assombrir", label: "Assombrir le reste", kind: "nombre", min: 0, max: 0.8, defaut: 0.45 },
    { key: "epaisseur", label: "Épaisseur du trait", kind: "nombre", min: 2, max: 14, defaut: 6 },
    { key: "couleur", label: "Couleur du trait", kind: "choix", options: COLOR, defaut: "accent" },
  ],
  fleche: [
    { key: "epaisseur", label: "Épaisseur", kind: "nombre", min: 4, max: 20, defaut: 10 },
    { key: "courbure", label: "Courbure", kind: "nombre", min: -1, max: 1, defaut: 0.4 },
    { key: "couleur", label: "Couleur", kind: "choix", options: COLOR, defaut: "accent" },
  ],
  soulignement: [
    { key: "epaisseur", label: "Épaisseur", kind: "nombre", min: 4, max: 30, defaut: 14 },
    { key: "forme", label: "Forme", kind: "choix", options: ["droit", "main-levee"], defaut: "droit" },
    { key: "couleur", label: "Couleur", kind: "choix", options: COLOR, defaut: "accent" },
  ],
  titre: [
    { key: "graisse", label: "Graisse", kind: "nombre", min: 400, max: 900, defaut: 900 },
    { key: "casse", label: "Casse", kind: "choix", options: ["style", "majuscules", "normale"], defaut: "style" },
    color("couleur_texte", "Couleur du texte", "auto", true),
    { key: "mot_fort_couleur", label: "Couleur du mot fort", kind: "choix", options: COLOR, defaut: "accent" },
    color("couleur_barre", "Couleur de la barre (barré-remplacé)", "accent"),
    { key: "contour", label: "Contour des lettres", kind: "oui-non", defaut: false },
    { key: "ombre_texte", label: "Ombre du texte", kind: "oui-non", defaut: false, aide: "Utile sur un rush." },
    { key: "alignement", label: "Alignement", kind: "choix", options: ["gauche", "centre"], defaut: "gauche" },
  ],
  etiquette: [...SURFACE, color("couleur_pastille", "Couleur de la pastille", "accent"), TEXT],
  bulle: [...SURFACE, { key: "pointe", label: "Pointe", kind: "choix", options: ["bas-gauche", "bas-droite", "aucune"], defaut: "bas-gauche" }, TEXT],
  compteur: [
    { key: "couleur", label: "Couleur du chiffre", kind: "choix", options: COLOR, defaut: "accent" },
    { key: "source", label: "Afficher la source", kind: "oui-non", defaut: true },
    color("couleur_libelle", "Couleur du libellé et de la source", "auto", true),
  ],
  logo: [],
  cta: [
    { key: "couleur", label: "Couleur", kind: "choix", options: COLOR, defaut: "accent" },
    { key: "coins", label: "Coins", kind: "choix", options: ["style", "carres", "arrondis", "pilule"], defaut: "style" },
    { key: "pulsation", label: "Pulsation", kind: "oui-non", defaut: false },
    color("couleur_texte", "Couleur du texte", "auto", true),
  ],
  pastilles: [{ key: "couleur", label: "Couleur", kind: "choix", options: COLOR, defaut: "accent" }],
  confettis: [{ key: "quantite", label: "Quantité", kind: "nombre", min: 8, max: 40, defaut: 18 }, { key: "couleurs", label: "Couleurs", kind: "choix", options: ["marque", "accent"], defaut: "marque" }],
};

/** Tous les réglages d'un type d'élément : les siens, puis les communs. Pure. */
export const paramSpecs = (type: ElementType): ParamSpec[] => [...(OWN[type] ?? []), ...COMMON];

/** Les valeurs par défaut d'un type. Pure. */
export function defaultParams(type: ElementType): Record<string, string | number | boolean> {
  return Object.fromEntries(paramSpecs(type).map((s) => [s.key, s.defaut]));
}

/**
 * Des réglages reçus (de l'atelier, d'une proposition de l'IA) remis au
 * contrat : les clés inconnues sont refusées, les valeurs hors contrat aussi,
 * avec la raison. `params` contient les valeurs acceptées, complétées par les
 * défauts. Pure.
 */
export function checkParams(type: ElementType, raw: unknown): { params: Record<string, string | number | boolean>; errors: string[] } {
  const specs = new Map(paramSpecs(type).map((s) => [s.key, s]));
  const params = defaultParams(type);
  const errors: string[] = [];
  const given = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(given)) {
    const s = specs.get(k);
    if (!s) {
      errors.push(`Réglage « ${k} » inconnu pour « ${type} ».`);
      continue;
    }
    if (s.kind === "choix") {
      if (typeof v === "string" && s.options.includes(v)) params[k] = v;
      else errors.push(`${s.label} : « ${String(v)} » n'est pas un choix possible (${s.options.join(", ")}).`);
    } else if (s.kind === "nombre") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n >= s.min && n <= s.max) params[k] = n;
      else errors.push(`${s.label} : ${String(v)} hors de la plage ${s.min} à ${s.max}.`);
    } else if (typeof v === "boolean") params[k] = v;
    else errors.push(`${s.label} : oui ou non attendu.`);
  }
  return { params, errors };
}

/** Les réglages d'un type, décrits pour l'IA (ce qu'elle peut proposer). Pure. */
export function describeParams(type: ElementType): string {
  return paramSpecs(type)
    .map((s) => `- ${s.key} (${s.label}) : ${s.kind === "choix" ? s.options.join(" | ") : s.kind === "nombre" ? `${s.min} à ${s.max}` : "oui | non"} ; défaut ${String(s.defaut)}${s.aide ? ` — ${s.aide}` : ""}`)
    .join("\n");
}
