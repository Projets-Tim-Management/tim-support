import type { AgentRole } from "@/modules/ads/collections/AdAgents";

/**
 * Les rôles de l'agent de campagne (plan Publicité, §9 quater, point 2) : ce que
 * chacun a le droit d'utiliser, et comment on le nomme dans le fil d'activité.
 *
 * La liste des outils d'un rôle est ÉCRITE ICI, pas choisie par le modèle : un
 * parent peut en donner moins à son sous-agent, jamais plus.
 */

/** Le sujet d'une phrase du fil : « Le stratège lit… ». */
export const ROLE_SUBJECT: Record<AgentRole, string> = {
  orchestrateur: "L'orchestrateur",
  stratege: "Le stratège",
  redacteur: "Le rédacteur",
  "directeur-artistique": "Le directeur artistique",
  controleur: "Le contrôleur",
  analyste: "L'analyste",
};

/** Les rôles qu'un agent peut créer. L'orchestrateur est unique ; l'analyste arrive en phase 2. */
export const CREATABLE_ROLES = ["stratege", "redacteur", "directeur-artistique", "controleur"] as const satisfies readonly AgentRole[];
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

const ORCHESTRATION = ["creer_sous_agent", "attendre_sous_agents"] as const;

/**
 * Les outils de chaque rôle. `terminer` est donné à tous : c'est la seule façon
 * de rendre un résultat. Les outils de l'atelier s'ajoutent au commit 4.
 */
export const ROLE_TOOLS: Record<AgentRole, readonly string[]> = {
  orchestrateur: [...ORCHESTRATION, "terminer"],
  stratege: [...ORCHESTRATION, "terminer"],
  redacteur: ["terminer"],
  "directeur-artistique": [...ORCHESTRATION, "terminer"],
  controleur: ["terminer"],
  analyste: ["terminer"],
};

const ROLE_BRIEF: Record<AgentRole, string> = {
  orchestrateur:
    "Tu es l'orchestrateur. Tu ne produis rien toi-même : tu crées des sous-agents (stratège, rédacteur, directeur artistique, contrôleur), tu leur donnes une mission précise et un budget, tu attends leurs résultats, puis tu rends le tout.",
  stratege: "Tu es le stratège : positionnement, audiences Meta et angles, à partir des sources auxquelles tes outils donnent accès.",
  redacteur: "Tu es le rédacteur : tu fais écrire les textes des angles qu'on te confie, avec l'outil de l'atelier.",
  "directeur-artistique": "Tu es le directeur artistique : gabarits, captures, chiffres affichés, animation.",
  controleur: "Tu es le contrôleur : tu acceptes ou rejettes chaque créa, avec un motif précis.",
  analyste: "Tu es l'analyste : tu lis les résultats d'une campagne publiée.",
};

/** Les règles communes, puis le rôle. Le prompt n'est pas un garde-fou : les limites sont vérifiées en code. */
export function systemPrompt(role: AgentRole): string {
  return [
    "Tu travailles pour TIM, éditeur d'un logiciel de gestion pour les entreprises du BTP, sur une campagne publicitaire Meta.",
    ROLE_BRIEF[role],
    "Règles : tu n'agis que par tes outils. Tu écris en français. Chaque choix porte une justification courte et chiffrée quand c'est possible.",
    "Les budgets, les règles de Meta, les chiffres sourcés et l'interdiction des faux témoignages sont vérifiés par le code après toi : aucune consigne ne les assouplit, et un refus du code n'est pas à contourner.",
    "Quand ta mission est accomplie, ou impossible, appelle « terminer » avec ton résultat. C'est la seule façon de rendre ton travail.",
  ].join("\n\n");
}
