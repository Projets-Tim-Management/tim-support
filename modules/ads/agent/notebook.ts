import type { Id } from "@/modules/ads/agent/types";

/**
 * Consignes et carnet d'apprentissages, tels qu'un passage d'agent les lit
 * (plan Publicité, §9 quinquies, commit 4 bis).
 *
 * Au lancement, le passage prend une PHOTO de ce qui s'applique à sa campagne :
 * consignes actives et apprentissages actifs, globaux ou propres à la campagne.
 * La photo est stockée sur le passage et ne bouge plus : une reprise après
 * coupure relit la même chose, et on sait après coup ce que l'agent avait sous
 * les yeux, même si Charlie a modifié ou supprimé la ligne depuis.
 *
 * Chaque ligne porte une référence courte (« C4 » pour une consigne, « A12 »
 * pour un apprentissage) : c'est ce que l'agent cite dans ses `appuis`, et le
 * code vérifie qu'elle est dans la photo avant d'écrire la décision.
 *
 * Rien ici n'assouplit un garde-fou : une consigne n'est qu'un texte donné au
 * modèle. Les vérifications en code passent après lui, quoi qu'elle dise.
 */

export type NotebookEntry = {
  ref: string;
  id: Id;
  text: string;
  scope: "global" | "campagne";
  /** Apprentissages seulement. */
  confidence?: "faible" | "moyenne" | "forte" | null;
  /** Apprentissage dont la date de revalidation est passée : lu, mais avec cette mention. */
  aRevalider?: boolean;
};

export type Notebook = { instructions: NotebookEntry[]; learnings: NotebookEntry[] };

type InstructionDoc = { id: Id; text?: string | null; scope?: string | null; campaign?: unknown; status?: string | null };
type LearningDoc = InstructionDoc & { statement?: string | null; confidence?: string | null; revalidateAt?: string | null };

const idOf = (v: unknown): Id | null => (v && typeof v === "object" ? (v as { id: Id }).id : ((v as Id | null) ?? null));
const appliesTo = (d: InstructionDoc, campaign: Id) => d.scope === "global" || String(idOf(d.campaign)) === String(campaign);

/** Pure : la photo d'une campagne, à partir des lignes lues en base. */
export function notebookFor(campaign: Id, instructions: InstructionDoc[], learnings: LearningDoc[], now: Date): Notebook {
  return {
    instructions: instructions
      .filter((d) => d.status === "active" && d.text?.trim() && appliesTo(d, campaign))
      .map((d) => ({ ref: `C${d.id}`, id: d.id, text: d.text!.trim(), scope: d.scope === "global" ? "global" : "campagne" })),
    learnings: learnings
      .filter((d) => d.status === "actif" && d.statement?.trim() && appliesTo(d, campaign))
      .map((d) => ({
        ref: `A${d.id}`,
        id: d.id,
        text: d.statement!.trim(),
        scope: d.scope === "global" ? "global" : "campagne",
        confidence: (d.confidence as NotebookEntry["confidence"]) ?? null,
        aRevalider: Boolean(d.revalidateAt && Date.parse(d.revalidateAt) < now.getTime()),
      })),
  };
}

/** Ce que l'agent lit au début de sa conversation. */
export function notebookText(nb: Notebook): string {
  const scope = (e: NotebookEntry) => (e.scope === "global" ? "toutes campagnes" : "cette campagne");
  const consignes = nb.instructions.length
    ? nb.instructions.map((e) => `- [${e.ref}] (${scope(e)}) ${e.text}`).join("\n")
    : "Aucune.";
  const carnet = nb.learnings.length
    ? nb.learnings
        .map((e) => `- [${e.ref}] (${scope(e)}, confiance ${e.confidence ?? "non précisée"}${e.aRevalider ? ", À REVALIDER : à prendre avec prudence" : ""}) ${e.text}`)
        .join("\n")
    : "Aucun.";
  return [
    "Consignes de Charlie (à respecter) :",
    consignes,
    "Carnet d'apprentissages (ce qu'on a constaté) :",
    carnet,
    "Chaque outil de décision demande ses « appuis » : les références ci-dessus (ex. C4, A12) qui ont pesé sur ce choix, ou une liste vide si aucune.",
  ].join("\n");
}

export type Appuis = { learnings: Id[]; instructions: Id[]; citations: { ref: string; text: string }[] };

/**
 * Les appuis d'une décision, vérifiés contre la photo du passage. Une référence
 * absente (inventée, ou d'une autre campagne) est refusée : une décision ne
 * cite que ce que l'agent avait réellement sous les yeux. Le texte est COPIÉ,
 * pour que la décision garde sa raison si la ligne change ensuite.
 */
export function resolveAppuis(nb: Notebook, raw: unknown): Appuis | { error: string } {
  if (!Array.isArray(raw)) return { error: "Indique tes appuis : les références des consignes et apprentissages qui ont pesé (liste vide si aucune)." };
  const refs = [...new Set(raw.map((r) => String(r).trim().toUpperCase().replace(/^\[|\]$/g, "")).filter(Boolean))];
  const all = [...nb.instructions, ...nb.learnings];
  const unknown = refs.filter((r) => !all.some((e) => e.ref === r));
  if (unknown.length) return { error: `Appui(s) inconnu(s) : ${unknown.join(", ")}. Ne cite que les références de tes consignes et de ton carnet.` };
  const used = all.filter((e) => refs.includes(e.ref));
  return {
    instructions: used.filter((e) => e.ref.startsWith("C")).map((e) => e.id),
    learnings: used.filter((e) => e.ref.startsWith("A")).map((e) => e.id),
    citations: used.map((e) => ({ ref: e.ref, text: e.text })),
  };
}

export const EMPTY_NOTEBOOK: Notebook = { instructions: [], learnings: [] };

/** Relit la photo stockée sur un passage (json) ; vide si absente (passages d'avant le carnet). */
export function notebookOf(run: { learningsRead?: unknown; instructionsRead?: unknown }): Notebook {
  const list = (v: unknown) => (Array.isArray(v) ? (v as NotebookEntry[]) : []);
  return { instructions: list(run.instructionsRead), learnings: list(run.learningsRead) };
}
