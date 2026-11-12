import type { AgentRole } from "@/modules/ads/collections/AdAgents";
import type { PortraitKey } from "@/modules/ai-team/lib/portraits";

/**
 * L'équipe d'agents IA telle qu'on la présente à la direction : des PERSONNES
 * (un nom, un visage, un métier, un chef) posées sur les rôles techniques du
 * moteur d'agents.
 *
 * La règle d'organisation (décision du 12/11/2026) :
 *  - la direction ne parle qu'aux CHEFS, un par domaine (SEA aujourd'hui) ;
 *  - un sous-agent ne répond qu'à son chef : il en reçoit ses missions et lui
 *    rend son travail — c'est déjà le fonctionnement du moteur (un agent rend
 *    son résultat à son parent, jamais à l'humain).
 *
 * Organisation SEA (décision du 12/11/2026, « la meilleure agence du monde ») :
 * Margaux, DIRECTRICE SEA, est la seule interlocutrice de la direction. Elle
 * encadre les chefs de canal (Meta, Google, ChatGPT), la mesure, et le studio
 * créatif partagé. Elle garde la préparation des campagnes (orchestratrice) ;
 * les suivis Meta passent à Camille, cheffe Meta Ads (analyste). Google Ads,
 * ChatGPT Ads et la mesure n'ont pas encore de rôle dans le moteur : leurs
 * fiches existent, leur travail arrive aux étapes suivantes.
 *
 * Ce fichier est le jeu de DÉPART (semé une fois, base vide) : noms, métiers et
 * visages se modifient ensuite sur les fiches. Le lien au moteur
 * (`key`, `engineRoles`) est du code, pas du contenu : il ne se modifie pas.
 */

export const TEAM_DOMAINS = [{ label: "Publicité payante (SEA)", value: "sea" }] as const;
export type TeamDomain = (typeof TEAM_DOMAINS)[number]["value"];

export const TEAM_LEVELS = [
  { label: "Chef — parle à la direction", value: "chef" },
  { label: "Sous-agent — répond à son chef", value: "sous-agent" },
] as const;
export type TeamLevel = (typeof TEAM_LEVELS)[number]["value"];

/** Les rangées de l'organigramme sous un chef. */
export const TEAM_GROUPS = [
  { value: "canal", label: "Chefs de canal" },
  { value: "mesure", label: "Mesure & data" },
  { value: "studio", label: "Studio créatif" },
] as const;
export type TeamGroup = (typeof TEAM_GROUPS)[number]["value"] | "direction";

export type TeamSeed = {
  /** La rangée de l'organigramme (code, pas contenu). */
  group: TeamGroup;
  /** Identifiant stable, lien avec le moteur : ne change jamais. */
  key: string;
  name: string;
  jobTitle: string;
  domain: TeamDomain;
  level: TeamLevel;
  /** Le chef, par sa `key` (sous-agents seulement). */
  chiefKey?: string;
  /** Les rôles du moteur que cette personne incarne. */
  engineRoles: AgentRole[];
  portrait: PortraitKey;
  specialty: string;
  personality: string;
};

export const AI_TEAM_SEED: TeamSeed[] = [
  {
    key: "chef-sea",
    group: "direction",
    name: "Margaux",
    jobTitle: "Directrice SEA",
    domain: "sea",
    level: "chef",
    engineRoles: ["orchestrateur"],
    portrait: "chef-sea",
    specialty:
      "Tient le plan multi-canal (Meta, Google Ads, ChatGPT Ads) : lit les chiffres de chaque canal jusqu'au lead qualifié et au client signé, recommande à la direction où déplacer le budget et quoi tester, commande les créas au studio, prépare les campagnes.",
    personality: "Directe et chiffrée. Commence par ce qui demande une décision, dit ce qu'elle ne sait pas, ne promet rien qu'elle n'a pas vérifié.",
  },
  {
    key: "sea-meta",
    group: "canal",
    name: "Camille",
    jobTitle: "Cheffe Meta Ads",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["analyste"],
    portrait: "meta-ads",
    specialty: "Suit les campagnes Meta en ligne : tous les deux jours elle lit et prévient, chaque lundi et au bilan du mois elle ajuste budgets, pauses et tests dans les garde-fous, et rend sa fiche à Margaux.",
    personality: "Réactive, précise sur les chiffres de diffusion.",
  },
  {
    key: "sea-google",
    group: "canal",
    name: "Thomas",
    jobTitle: "Chef Google Ads",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: [],
    portrait: "google-ads",
    specialty: "Gérera le Search Google : mots-clés, termes de recherche, mots-clés négatifs, annonces et enchères. En attendant son connecteur, il analysera les chiffres et proposera.",
    personality: "Méthodique, obsédé par l'intention de recherche.",
  },
  {
    key: "sea-chatgpt",
    group: "canal",
    name: "Sarah",
    jobTitle: "Cheffe ChatGPT Ads",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: [],
    portrait: "chatgpt-ads",
    specialty: "Gérera les annonces dans ChatGPT : les sujets de conversation où TIM doit apparaître, les annonces et leur budget. En attendant son connecteur, elle analysera les chiffres et proposera.",
    personality: "Curieuse, attentive aux questions que se posent les prospects.",
  },
  {
    key: "sea-mesure",
    group: "mesure",
    name: "Yanis",
    jobTitle: "Mesure & data",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: [],
    portrait: "mesure",
    specialty: "Confronte les chiffres des régies au CRM : leads, leads qualifiés (démo programmée), clients signés, coût de chacun par canal. Signale un suivi cassé. C'est sa fiche chiffrée qui fonde les recommandations de Margaux.",
    personality: "Rigoureux, ne croit qu'aux chiffres rapprochés.",
  },
  {
    key: "sea-stratege",
    group: "studio",
    name: "Hugo",
    jobTitle: "Stratège",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["stratege"],
    portrait: "stratege",
    specialty: "Lit le site, les chiffres d'acquisition et les publicités des concurrents ; propose les angles et les cibles, pour tous les canaux.",
    personality: "Méthodique, appuie chaque idée sur une source.",
  },
  {
    key: "sea-redacteur",
    group: "studio",
    name: "Léa",
    jobTitle: "Rédactrice",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["redacteur"],
    portrait: "redacteur",
    specialty: "Écrit les textes des annonces (accroches, textes, titres) dans le ton de la marque et sous ses interdits, pour chaque canal.",
    personality: "Concise, attentive au mot juste.",
  },
  {
    key: "sea-directeur-artistique",
    group: "studio",
    name: "Noé",
    jobTitle: "Directeur artistique",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["directeur-artistique"],
    portrait: "directeur-artistique",
    specialty: "Compose les visuels des créas à partir du kit de marque et des rushes.",
    personality: "Exigeant sur la lisibilité et la cohérence visuelle.",
  },
  {
    key: "sea-controleur",
    group: "studio",
    name: "Inès",
    jobTitle: "Contrôleuse",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["controleur"],
    portrait: "controleur",
    specialty: "Relit tout avant que ça remonte : promesses vérifiables, règles de chaque régie, consignes et interdits de la marque.",
    personality: "Rigoureuse, ne laisse rien passer sans preuve.",
  },
];

/** La rangée de l'organigramme d'un membre, par son identifiant (code). */
export const groupOf = (key: string): TeamGroup => AI_TEAM_SEED.find((m) => m.key === key)?.group ?? "studio";

/**
 * Ce que la première version de l'équipe avait semé pour Margaux : si la fiche
 * porte encore ces textes, la mise à jour de l'organisation les remplace ; si
 * la direction les a réécrits, on n'y touche pas.
 */
export const PREVIOUS_DEFAULTS: Record<string, { jobTitle?: string; specialty?: string }> = {
  "chef-sea": {
    jobTitle: "Cheffe de la publicité payante (SEA)",
    specialty:
      "Prépare les campagnes Meta et Google à partir d'un brief, répartit le budget, coordonne son équipe ; suit les campagnes en ligne (tous les deux jours, chaque lundi, chaque mois) et propose ce qu'il faut changer.",
  },
};


/** Le chef d'un domaine et les rôles du moteur : qui est qui. */
export const engineRoleOwner = (role: AgentRole): TeamSeed | undefined => AI_TEAM_SEED.find((m) => m.engineRoles.includes(role));
