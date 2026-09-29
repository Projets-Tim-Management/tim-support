/**
 * Les bornes de l'agent de campagne, en code (plan Publicité, §9 quater).
 *
 * Ce qui est ici ne se règle pas depuis l'admin : une borne qu'on peut
 * desserrer d'un clic n'en est pas une. Les réglages par campagne (part IA,
 * plancher Meta) se choisissent À L'INTÉRIEUR de ces bornes.
 */

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
