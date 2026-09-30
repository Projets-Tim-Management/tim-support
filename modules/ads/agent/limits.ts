/**
 * Les bornes de l'agent de campagne, en code (plan Publicité, §9 quater).
 *
 * Ce qui est ici ne se règle pas depuis l'admin : une borne qu'on peut
 * desserrer d'un clic n'en est pas une. Les réglages par campagne (part IA,
 * plancher Meta) se choisissent À L'INTÉRIEUR de ces bornes.
 */

// ─── L'arbre d'agents (valeurs validées le 29/09/2026) ──────────────────────

/** Profondeur de création : orchestrateur (0) → sous-agent (1) → sous-sous-agent (2). */
export const MAX_DEPTH = 2;
/** Sous-agents en cours en même temps ; les suivants attendent leur tour (le pooler Supabase fait 15 connexions). */
export const MAX_CONCURRENT = 3;
/** Sous-agents créés au plus par passage. */
export const MAX_AGENTS_PER_RUN = 12;
/** Rejets du contrôleur par angle : au-delà, la créa part « À valider » marquée rejetée, avec les motifs. */
export const MAX_REJECTIONS = 2;
/** Tours de modèle au plus par agent : un agent qui tourne en rond s'arrête. */
export const MAX_TURNS = 25;
/** Échecs d'appel consécutifs (réseau, API) avant d'abandonner l'agent. */
export const MAX_CALL_FAILURES = 2;
/** Durée du verrou d'un passage : au-delà, la fonction est tenue pour morte et le cron reprend. */
export const LEASE_MS = 5 * 60_000;
/**
 * Durée maximale d'une étape (un appel au modèle, délai de l'API compris). Une
 * étape ne démarre que s'il reste au moins ce temps avant la fin de la fonction :
 * un appel coupé en vol serait facturé sans être compté. Inférieure au verrou,
 * qui est prolongé après chaque étape.
 */
export const STEP_MAX_MS = 150_000;
/** Étapes au plus par exécution : une borne, au cas où le temps ne suffirait pas à arrêter la boucle. */
export const MAX_STEPS_PER_TICK = 200;

// ─── Le budget d'une campagne ───────────────────────────────────────────────

/** Part IA maximale d'un budget quotidien : réglable par campagne entre 0 et ce plafond. */
export const AI_SHARE_MAX_PCT = 50;

export const DEFAULT_AI_SHARE_PCT = 15;
export const DEFAULT_META_FLOOR_EUR = 5;

/**
 * Le budget Meta minimal que laisse la part IA maximale : total × (1 − part IA
 * max). Le plancher Meta doit y tenir, sinon la campagne ne peut respecter les
 * deux à la fois.
 */
export const metaRoomEur = (totalDailyEur: number, maxAiSharePct: number): number => totalDailyEur * (1 - maxAiSharePct / 100);

/** Validation des bornes d'une campagne ; `true` ou le message à afficher. */
export function validateAgentBudget(b: { totalDailyEur?: number | null; maxAiSharePct?: number | null; metaFloorEur?: number | null }): true | string {
  const { totalDailyEur: total, maxAiSharePct: share, metaFloorEur: floor } = b;
  if (total == null) return true; // pas encore de budget : l'agent ne se lance pas, rien à vérifier
  if (!(total > 0)) return "Le budget quotidien total doit être positif.";
  if (share == null || share < 0 || share > AI_SHARE_MAX_PCT) return `La part IA maximale va de 0 à ${AI_SHARE_MAX_PCT} %.`;
  if (floor == null || floor < 0) return "Le plancher Meta ne peut pas être négatif.";
  const room = metaRoomEur(total, share);
  if (floor > room + 1e-9) return `Avec ${share} % de part IA, il reste ${room.toFixed(2)} € pour Meta : le plancher de ${floor} € n'y tient pas.`;
  return true;
}
