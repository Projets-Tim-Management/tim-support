/**
 * Les tarifs des IA payantes du support — UNE source, lue par tous les
 * compteurs (assistant, atelier de créas).
 *
 * En dollars, comme les factures. Les plafonds, eux, sont en euros : la
 * conversion est indicative et volontairement prudente.
 *
 * Tarifs relevés le 29/09/2026 (Anthropic : API Models et grille publique ;
 * Google : tarifs de l'API Gemini). À revoir quand un fournisseur change sa
 * grille — un tarif périmé fait un plafond qui ment.
 */

/** Conversion indicative : le plafond est en euros, la facture en dollars. */
export const USD_PER_EUR = 1.1;

export type TokenPrices = { input: number; output: number; cacheWrite: number; cacheRead: number };

/** Claude, en dollars par million de tokens. */
export const CLAUDE_PRICES = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
} as const satisfies Record<string, TokenPrices>;

export type ClaudeModel = keyof typeof CLAUDE_PRICES;

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export function claudeCostUsd(model: ClaudeModel, u: Usage): number {
  const p = CLAUDE_PRICES[model];
  return (u.input * p.input + u.output * p.output + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead) / 1_000_000;
}

/**
 * Le coût MAXIMAL d'un appel Claude avant de le lancer : l'entrée estimée, et
 * toute la sortie autorisée (`max_tokens`, réflexion comprise) au tarif de
 * sortie. C'est ce montant qui doit tenir dans le budget restant — pas une
 * moyenne, qu'un appel qui s'emballe dépasserait.
 */
export const claudeMaxCostUsd = (model: ClaudeModel, inputTokens: number, maxTokens: number): number =>
  claudeCostUsd(model, { input: inputTokens, output: maxTokens, cacheRead: 0, cacheWrite: 0 });

/** Images et vidéo, en dollars par unité (image, ou seconde de vidéo). */
export const UNIT_PRICES = {
  "imagen-4-fast": 0.02,
  "imagen-4": 0.04,
  "imagen-4-ultra": 0.06,
  "veo-3.1-lite-1080p": 0.08,
  "veo-3.1-fast-1080p": 0.12,
  "veo-3.1-1080p": 0.4,
} as const;

export type UnitModel = keyof typeof UNIT_PRICES;

export const unitCostUsd = (model: UnitModel, units: number): number => UNIT_PRICES[model] * units;

export const usdToEur = (usd: number): number => usd / USD_PER_EUR;
