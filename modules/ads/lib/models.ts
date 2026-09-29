import type { ClaudeModel } from "@/core/lib/ai-pricing";
import type { AgentRole } from "@/modules/ads/collections/AdAgents";

/**
 * Le modèle qui écrit les textes publicitaires — déclaré ICI et nulle part
 * ailleurs (décision du 29/09/2026 : « l'Opus le plus récent, à un seul
 * endroit »).
 *
 * `claude-opus-5-5` vérifié le 29/09/2026 auprès de l'API Models d'Anthropic
 * (« Claude Opus 5.5 », publié le 21/09/2026). Changer de modèle, c'est changer
 * cette ligne — et ajouter son tarif dans core/lib/ai-pricing si besoin : le
 * type l'exige, un modèle sans tarif ne compile pas.
 */
export const ADS_TEXT_MODEL = "claude-opus-5-5" as const satisfies ClaudeModel;

/** Sortie maximale d'une génération (réflexion comprise) : c'est elle qui fixe le coût maximal vérifié avant l'appel. */
export const ADS_TEXT_MAX_TOKENS = 16_000;

/**
 * Les modèles de l'agent de campagne, par rôle (plan, §9 quater ; identifiants
 * vérifiés sur l'API Models le 29/09/2026 — `claude-sonnet-5-5` publié le
 * 28/09). Opus décide (orchestrateur, stratège) ; Sonnet exécute. Les textes
 * eux-mêmes restent écrits par `ADS_TEXT_MODEL`, via l'outil de l'atelier.
 */
export const ADS_AGENT_MODELS = {
  orchestrateur: "claude-opus-5-5",
  stratege: "claude-opus-5-5",
  redacteur: "claude-sonnet-5-5",
  "directeur-artistique": "claude-sonnet-5-5",
  controleur: "claude-sonnet-5-5",
  analyste: "claude-sonnet-5-5",
} as const satisfies Record<AgentRole, ClaudeModel>;

/** Sortie maximale d'un tour d'agent (réflexion comprise) : elle fixe le coût maximal vérifié avant chaque appel. */
export const ADS_AGENT_MAX_TOKENS = 12_000;
