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

const COLOR = ["accent", "principale", "clair", "sombre"] as const;

const OWN: Record<ElementType, ParamSpec[]> = {
  liste: [
    ...SURFACE,
    { key: "coche", label: "Coche", kind: "choix", options: ["rond", "carre", "trait"], defaut: "rond" },
    { key: "avatars", label: "Initiales en pastille", kind: "oui-non", defaut: true },
    { key: "cadence", label: "Cadence des lignes", kind: "nombre", min: 0.5, max: 2, defaut: 1, aide: "Multiplie l'écart entre deux lignes." },
    { key: "en_tete", label: "En-tête", kind: "oui-non", defaut: true },
  ],
  notification: [
    ...SURFACE,
    { key: "icone", label: "Icône", kind: "choix", options: ["app", "logo", "aucune"], defaut: "app" },
    { key: "heure", label: "« maintenant »", kind: "oui-non", defaut: true },
    { key: "coche", label: "Coche de confirmation", kind: "oui-non", defaut: true },
  ],
  bouton: [
    { key: "couleur", label: "Couleur du bouton", kind: "choix", options: COLOR, defaut: "accent" },
    { key: "coins", label: "Coins", kind: "choix", options: ["style", "carres", "arrondis", "pilule"], defaut: "style" },
    { key: "onde", label: "Onde au toucher", kind: "oui-non", defaut: true },
    { key: "confirmation", label: "Confirmation", kind: "choix", options: ["carte", "badge"], defaut: "carte" },
  ],
  planning: [...SURFACE, { key: "remplissage", label: "Remplissage", kind: "choix", options: ["blocs", "barres"], defaut: "blocs" }, { key: "cadence", label: "Cadence", kind: "nombre", min: 0.5, max: 2, defaut: 1 }],
  fiche: [...SURFACE, { key: "puce", label: "Puce", kind: "choix", options: ["rond", "trait", "coche"], defaut: "rond" }],
  champ: [...SURFACE, { key: "curseur", label: "Curseur clignotant", kind: "oui-non", defaut: true }, { key: "frappe", label: "Vitesse de frappe", kind: "nombre", min: 0.5, max: 3, defaut: 1 }],
  badge: [
    { key: "couleur", label: "Couleur", kind: "choix", options: COLOR, defaut: "accent" },
    { key: "icone", label: "Icône", kind: "choix", options: ["coche", "etoile", "aucune"], defaut: "coche" },
    { key: "ombre", label: "Ombre", kind: "choix", options: ["aucune", "douce", "forte"], defaut: "forte" },
  ],
  tap: [{ key: "doigt", label: "Doigt", kind: "choix", options: ["disque", "anneau"], defaut: "disque" }, { key: "onde_couleur", label: "Couleur de l'onde", kind: "choix", options: COLOR, defaut: "accent" }],
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
    { key: "mot_fort_couleur", label: "Couleur du mot fort", kind: "choix", options: COLOR, defaut: "accent" },
    { key: "contour", label: "Contour des lettres", kind: "oui-non", defaut: false },
    { key: "ombre_texte", label: "Ombre du texte", kind: "oui-non", defaut: false, aide: "Utile sur un rush." },
    { key: "alignement", label: "Alignement", kind: "choix", options: ["gauche", "centre"], defaut: "gauche" },
  ],
  etiquette: [...SURFACE],
  bulle: [...SURFACE, { key: "pointe", label: "Pointe", kind: "choix", options: ["bas-gauche", "bas-droite", "aucune"], defaut: "bas-gauche" }],
  compteur: [{ key: "couleur", label: "Couleur du chiffre", kind: "choix", options: COLOR, defaut: "accent" }, { key: "source", label: "Afficher la source", kind: "oui-non", defaut: true }],
  logo: [],
  cta: [
    { key: "couleur", label: "Couleur", kind: "choix", options: COLOR, defaut: "accent" },
    { key: "coins", label: "Coins", kind: "choix", options: ["style", "carres", "arrondis", "pilule"], defaut: "style" },
    { key: "pulsation", label: "Pulsation", kind: "oui-non", defaut: false },
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
