import type { ClaudeModel } from "@/core/lib/ai-pricing";

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
