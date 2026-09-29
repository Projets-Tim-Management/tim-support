import { REFUSAL_REASONS } from "@/modules/ads/collections/AdCreatives";
import { publishable } from "@/modules/ads/lib/copy/generate";
import { FORMAT_KEYS } from "@/modules/ads/lib/render/formats";

/**
 * Valider ou refuser une créa — les deux seuls gestes qui changent son statut.
 *
 * Le clic EST l'action : pas de case à cocher puis enregistrer. Chaque décision
 * garde qui l'a prise et quand. On ne valide qu'une créa complète — un texte
 * principal et un titre passés, un visuel dans chacun des trois formats — : une
 * créa validée doit pouvoir partir telle quelle. On ne refuse qu'avec un motif :
 * il servira à la génération suivante.
 */

export type Decision = { decision: "validee" } | { decision: "refusee"; reason: string; detail?: string | null };

type Creative = {
  status?: string | null;
  texts?: { kind: string; status: string }[] | null;
  assets?: { format: string; type: string }[] | null;
};

/** La raison de refuser le geste, ou `null` s'il est permis. Pure. */
export function decisionError(c: Creative, d: Decision): string | null {
  if (c.status !== "a-valider") return "Cette créa n'est pas en attente de validation.";
  if (d.decision === "refusee") {
    return REFUSAL_REASONS.some((r) => r.value === d.reason) ? null : "Choisissez un motif de refus.";
  }
  if (!publishable(c.texts ?? [])) return "Il faut au moins un texte principal et un titre passés par les garde-fous.";
  const formats = new Set((c.assets ?? []).filter((a) => a.type === "image").map((a) => a.format));
  const missing = FORMAT_KEYS.filter((f) => !formats.has(f));
  return missing.length ? `Visuel manquant : ${missing.join(", ")}.` : null;
}

/** Ce que le geste écrit sur la créa. Pure. */
export const decisionData = (d: Decision, userId: number | string, now: Date) => ({
  status: d.decision,
  decidedBy: userId,
  decidedAt: now.toISOString(),
  refusalReason: d.decision === "refusee" ? d.reason : null,
  refusalDetail: d.decision === "refusee" ? (d.detail?.trim() || null) : null,
});
