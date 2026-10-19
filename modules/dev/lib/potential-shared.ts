import { STATUS_BASE } from "@/modules/partner/lib/signature-score";

/**
 * La part PURE du potentiel d'un développement (voir potential.ts) — partagée
 * avec l'écran, qui la recalcule en direct.
 */

export type Requester = { id: number; company: string; status: string; score: number; explanation: string };
export type PotentialDetail = { requesters: Requester[] };

/** Le plus chaud d'abord : le %, puis le statut, puis le nom. Pure. */
export function rankRequesters(list: Requester[]): Requester[] {
  return [...list].sort(
    (a, b) =>
      b.score - a.score ||
      (STATUS_BASE[b.status] ?? 0) - (STATUS_BASE[a.status] ?? 0) ||
      a.company.localeCompare(b.company, "fr"),
  );
}

/** Ce qu'on stocke sur le développement. Sans demandeur : rien. Pure. */
export function potentialOf(requesters: Requester[]): { potential: number | null; potentialDetail: PotentialDetail | null } {
  if (!requesters.length) return { potential: null, potentialDetail: null };
  const ranked = rankRequesters(requesters);
  return { potential: ranked[0].score, potentialDetail: { requesters: ranked } };
}

/** Id d'une relation, qu'elle arrive peuplée ou réduite à son identifiant. */
export const relId = (ref: unknown): number | null => {
  const raw = ref != null && typeof ref === "object" ? (ref as { id?: unknown }).id : ref;
  const n = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(n) ? n : null;
};
