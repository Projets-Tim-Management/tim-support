import { MAX_INSTRUCTION_CHARS } from "@/modules/ads/lib/refusal-instruction";

/**
 * Les gestes de « À valider » sur ce que l'agent lira (plan Publicité,
 * §9 quinquies, commit 4 ter). Le clic EST l'action : « En faire une
 * consigne » l'active avec le texte tel qu'il est dans le champ ; « Non »
 * l'écarte. Pour le carnet : « Valider pour toutes les campagnes » ou « Garder
 * pour cette campagne ».
 *
 * Pures : la route lit la ligne, demande ici ce qu'il faut écrire, et écrit.
 */

export type InstructionGesture = { action: "activer"; text: string; scope: "campagne" | "global" } | { action: "ecarter" };
export type LearningGesture = { action: "promouvoir" } | { action: "garder" };

type Row = { status?: string | null; campaign?: unknown };

export function instructionGesture(row: Row, g: InstructionGesture): { error: string } | { data: Record<string, unknown> } {
  if (row.status !== "proposee") return { error: "Cette consigne n'attend plus de décision." };
  if (g.action === "ecarter") return { data: { status: "ecartee" } };
  const text = g.text.replace(/\s+/g, " ").trim();
  if (!text) return { error: "Écrivez la consigne." };
  if (text.length > MAX_INSTRUCTION_CHARS * 2.5) return { error: "Une consigne tient en une phrase." };
  if (g.scope === "campagne" && !row.campaign) return { error: "Cette consigne n'a pas de campagne : choisissez « toutes les campagnes »." };
  return { data: { status: "active", text, scope: g.scope } };
}

export function learningGesture(row: Row & { scope?: string | null }, g: LearningGesture): { error: string } | { data: Record<string, unknown> } {
  if (row.status !== "global-propose") return { error: "Cet apprentissage n'attend plus de décision." };
  if (g.action === "promouvoir") return { data: { status: "actif", scope: "global" } };
  if (!row.campaign) return { error: "Cet apprentissage n'a pas de campagne où rester." };
  return { data: { status: "actif", scope: "campagne" } };
}

/** Lit le corps d'une requête en geste ; `null` s'il n'en est pas un. */
export function parseInstructionGesture(body: Record<string, unknown>): InstructionGesture | null {
  if (body.action === "ecarter") return { action: "ecarter" };
  if (body.action === "activer") return { action: "activer", text: String(body.text ?? ""), scope: body.scope === "global" ? "global" : "campagne" };
  return null;
}

export function parseLearningGesture(body: Record<string, unknown>): LearningGesture | null {
  return body.action === "promouvoir" || body.action === "garder" ? { action: body.action } : null;
}
