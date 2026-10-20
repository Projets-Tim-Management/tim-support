import { REFUSAL_REASONS } from "@/modules/ads/lib/creative-options";
import { publishable } from "@/modules/ads/lib/copy/generate";
import { missingFiles, type CreativeFile } from "@/modules/ads/lib/creative-files";

/**
 * Valider ou refuser une créa — les deux seuls gestes qui changent son statut.
 *
 * Le clic EST l'action : pas de case à cocher puis enregistrer. Chaque décision
 * garde qui l'a prise et quand. On ne valide qu'une créa complète — un texte
 * principal et un titre passés, et les fichiers finis que son brief attend
 * (formats et nature), importés depuis Claude Design — : une créa validée doit
 * pouvoir partir telle quelle. On ne refuse qu'avec un motif :
 * il servira à la génération suivante.
 */

export type Decision = { decision: "validee" } | { decision: "refusee"; reason: string; detail?: string | null } | { decision: "rouvrir" };

type Creative = {
  status?: string | null;
  copy?: { kind: string; status: string }[] | null;
  brief?: { kind?: string | null; formats?: string[] | null } | null;
  files?: CreativeFile[] | null;
};

/** La raison de refuser le geste, ou `null` s'il est permis. Pure. */
export function decisionError(c: Creative, d: Decision, published = false): string | null {
  // Rouvrir une créa validée (pour changer ses fichiers) : seulement tant qu'elle n'est pas partie chez Meta.
  if (d.decision === "rouvrir") {
    if (c.status !== "validee") return "Seule une créa validée se rouvre.";
    return published ? "Cette créa est déjà publiée chez Meta : elle ne se rouvre plus." : null;
  }
  if (c.status !== "a-valider") return "Cette créa n'est pas en attente de validation.";
  if (d.decision === "refusee") {
    return REFUSAL_REASONS.some((r) => r.value === d.reason) ? null : "Choisissez un motif de refus.";
  }
  if (!publishable(c.copy ?? [])) return "Il faut au moins un texte principal et un titre passés par les garde-fous.";
  const missing = missingFiles(c);
  return missing.length ? `Fichier manquant : ${missing.join(", ")}. Importez-le depuis Claude Design.` : null;
}

/** Ce que le geste écrit sur la créa. Pure. */
export const decisionData = (d: Decision, userId: number | string, now: Date) =>
  d.decision === "rouvrir"
    ? { status: "a-valider", decidedBy: null, decidedAt: null, refusalReason: null, refusalDetail: null }
    : {
  status: d.decision,
  decidedBy: userId,
  decidedAt: now.toISOString(),
  refusalReason: d.decision === "refusee" ? d.reason : null,
  refusalDetail: d.decision === "refusee" ? (d.detail?.trim() || null) : null,
};
