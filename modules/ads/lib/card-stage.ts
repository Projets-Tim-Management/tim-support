/**
 * Où en est une créa dans « À valider », en un mot : c'est ce qui dit quoi
 * faire maintenant (créer dans Claude Design, compléter les fichiers, valider).
 * Pure.
 */
export type CardStage = "creer" | "importer" | "valider" | "validee" | "refusee" | "sans-brief";

export function stageOf(c: { status: string; brief: unknown; files: unknown[]; missing: string[] }): CardStage {
  if (c.status === "validee" || c.status === "en-ligne") return "validee";
  if (c.status === "refusee") return "refusee";
  if (!c.brief) return "sans-brief";
  if (!c.files.length) return "creer";
  return c.missing.length ? "importer" : "valider";
}
