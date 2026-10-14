import { checkForbidden, checkNumbers, checkTestimonial } from "@/modules/ads/lib/copy/guardrails";

/**
 * Les scènes de motion design (plan Publicité, §9 sexies, M2) : l'interface de
 * TIM recréée en vectoriel et animée, aux couleurs et polices du style — une
 * liste qui se coche sur les temps, une notification qui glisse, un planning
 * qui se remplit… Dessinées une fois pour toutes (remotion/scenes.tsx) ; l'IA
 * les CHOISIT et les REMPLIT, elle ne dessine pas.
 *
 * Ce fichier est le contrat : les types, les données de chacun, les longueurs,
 * et ce que le code vérifie avant tout rendu. Les textes « de pub » (titres,
 * accroches, confirmations) passent les garde-fous comme tout texte ; les
 * données d'interface (noms de compagnons, horaires, équipes) sont fictives et
 * ne passent que le filtre des mentions interdites.
 */

export const SCENE_TYPES = ["liste", "notification", "planning", "compteur", "avant-apres", "bouton", "carte", "texte"] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

/** Une grande phrase au-dessus de la scène (facultative) : elle porte le message, dans la police du style. */
export type SceneCommon = { legende?: string };

export type SceneData = {
  liste: { titre: string; elements: { nom: string; detail: string }[]; action: string };
  notification: { app: string; titre: string; texte: string };
  planning: { titre: string; lignes: string[]; jours: number };
  compteur: { fact: number; libelle: string };
  "avant-apres": { avant: string; apres: string };
  bouton: { titre: string; bouton: string; confirmation: string };
  carte: { lieu: string; lignes: string[] };
  texte: { avant: string; apres: string };
};

/** Ce que chaque scène montre, pour l'agent (et la planche). Toutes acceptent aussi « legende » : une grande phrase au-dessus (60 caractères au plus). */
export const SCENE_GUIDE: Record<SceneType, string> = {
  liste: "Un écran de l'app : une liste (compagnons, tâches) qui se coche élément par élément sur les temps, puis un bouton d'action. Données : titre, elements [{nom, detail}] (3 à 6), action.",
  notification: "Une notification de l'app glisse sur l'écran et se confirme. Données : app, titre, texte.",
  planning: "Une semaine de planning dont les cases se remplissent, équipe par équipe. Données : titre, lignes (2 à 5 équipes ou personnes), jours (5 à 7).",
  compteur: "Un chiffre SOURCÉ qui défile jusqu'à sa valeur, avec sa source. Données : fact (identifiant d'un fait du brief), libelle.",
  "avant-apres": "Une feuille papier qui se froisse et laisse place à l'écran propre. Données : avant (le problème), apres (la solution).",
  bouton: "Un doigt tape le bouton de l'app, qui s'enfonce, puis la confirmation apparaît. Données : titre (l'écran), bouton, confirmation.",
  carte: "Une épingle tombe sur une carte, une fiche chantier s'ouvre. Données : lieu, lignes (1 à 3 infos).",
  texte: "Texte cinétique : une phrase barrée, remplacée par la bonne. Données : avant, apres.",
};

const MAX = { legende: 60, titre: 40, nom: 28, detail: 24, action: 28, app: 20, texte: 80, ligne: 32, libelle: 50, court: 40, bouton: 24, confirmation: 50 } as const;

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Les données reçues d'un modèle, remises en forme pour leur type (champs inconnus ignorés). Pure. */
export function parseSceneData(scene: SceneType, raw: unknown): SceneData[SceneType] & SceneCommon {
  const d = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const legende = str(d.legende);
  return { ...parseOwn(scene, d), ...(legende ? { legende } : {}) };
}

function parseOwn(scene: SceneType, d: Raw): SceneData[SceneType] {
  switch (scene) {
    case "liste":
      return {
        titre: str(d.titre),
        elements: (Array.isArray(d.elements) ? d.elements : []).map((e) => ({ nom: str((e as Raw)?.nom), detail: str((e as Raw)?.detail) })).filter((e) => e.nom),
        action: str(d.action),
      };
    case "notification":
      return { app: str(d.app) || "TIM", titre: str(d.titre), texte: str(d.texte) };
    case "planning":
      return { titre: str(d.titre), lignes: strs(d.lignes), jours: Number.isFinite(Number(d.jours)) ? Math.round(Number(d.jours)) : 5 };
    case "compteur":
      return { fact: Number(d.fact), libelle: str(d.libelle) };
    case "avant-apres":
    case "texte":
      return { avant: str(d.avant), apres: str(d.apres) };
    case "bouton":
      return { titre: str(d.titre), bouton: str(d.bouton), confirmation: str(d.confirmation) };
    default:
      return { lieu: str(d.lieu), lignes: strs(d.lignes) };
  }
}

export const isSceneType = (v: unknown): v is SceneType => (SCENE_TYPES as readonly unknown[]).includes(v);

/**
 * Ce qui empêche de rendre une scène ; vide si elle est bonne. `allowed` : les
 * chiffres permis (faits et offre). Pure.
 */
export function sceneProblems(scene: SceneType, data: SceneData[SceneType] & SceneCommon, ctx: { facts: Set<number>; allowed: Set<number>; forbidden: string[] }): string[] {
  const out: string[] = [];
  const len = (label: string, v: string, max: number, required = true) => {
    if (required && !v) out.push(`${label} vide.`);
    else if (v.length > max) out.push(`${label} : ${v.length} caractères, ${max} au plus.`);
  };
  // Les textes « de pub » : tous les garde-fous. Les données d'interface (fictives) : les mentions interdites seulement.
  const pub: string[] = [data.legende ?? ""];
  const ui: string[] = [];
  if ((data.legende ?? "").length > MAX.legende) out.push(`Légende : ${(data.legende ?? "").length} caractères, ${MAX.legende} au plus.`);
  switch (scene) {
    case "liste": {
      const d = data as SceneData["liste"];
      len("Titre", d.titre, MAX.titre);
      len("Action", d.action, MAX.action);
      if (d.elements.length < 3 || d.elements.length > 6) out.push("Une liste a 3 à 6 éléments.");
      d.elements.forEach((e, i) => {
        len(`Élément ${i + 1}`, e.nom, MAX.nom);
        len(`Détail ${i + 1}`, e.detail, MAX.detail, false);
        ui.push(e.nom, e.detail);
      });
      pub.push(d.titre, d.action);
      break;
    }
    case "notification": {
      const d = data as SceneData["notification"];
      len("Application", d.app, MAX.app);
      len("Titre", d.titre, MAX.titre);
      len("Texte", d.texte, MAX.texte);
      pub.push(d.titre, d.texte);
      ui.push(d.app);
      break;
    }
    case "planning": {
      const d = data as SceneData["planning"];
      len("Titre", d.titre, MAX.titre);
      if (d.lignes.length < 2 || d.lignes.length > 5) out.push("Un planning a 2 à 5 lignes.");
      if (d.jours < 5 || d.jours > 7) out.push("Un planning montre 5 à 7 jours.");
      d.lignes.forEach((l, i) => len(`Ligne ${i + 1}`, l, 18));
      pub.push(d.titre);
      ui.push(...d.lignes);
      break;
    }
    case "compteur": {
      const d = data as SceneData["compteur"];
      if (!ctx.facts.has(d.fact)) out.push(`Fait ${d.fact} introuvable — un compteur montre toujours un fait sourcé.`);
      len("Libellé", d.libelle, MAX.libelle, false);
      pub.push(d.libelle);
      break;
    }
    case "avant-apres":
    case "texte": {
      const d = data as SceneData["texte"];
      len("Avant", d.avant, MAX.court);
      len("Après", d.apres, MAX.court);
      pub.push(d.avant, d.apres);
      break;
    }
    case "bouton": {
      const d = data as SceneData["bouton"];
      len("Titre", d.titre, MAX.titre);
      len("Bouton", d.bouton, MAX.bouton);
      len("Confirmation", d.confirmation, MAX.confirmation);
      pub.push(d.titre, d.bouton, d.confirmation);
      break;
    }
    case "carte": {
      const d = data as SceneData["carte"];
      len("Lieu", d.lieu, MAX.ligne);
      if (d.lignes.length < 1 || d.lignes.length > 3) out.push("Une fiche a 1 à 3 lignes.");
      d.lignes.forEach((l, i) => len(`Ligne ${i + 1}`, l, MAX.ligne));
      // La fiche d'un chantier fictif : ses lignes sont des données d'interface (« 2 équipes sur place »), pas des promesses.
      ui.push(d.lieu, ...d.lignes);
      break;
    }
  }
  for (const t of pub.filter(Boolean)) {
    const p = checkNumbers(t, ctx.allowed) ?? checkForbidden(t, ctx.forbidden) ?? checkTestimonial(t);
    if (p) out.push(p);
  }
  for (const t of ui.filter(Boolean)) {
    const p = checkForbidden(t, ctx.forbidden);
    if (p) out.push(p);
  }
  return out;
}
