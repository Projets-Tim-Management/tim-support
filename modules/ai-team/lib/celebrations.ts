import type { Payload } from "payload";

import { idOf } from "@/core/lib/relations";
import { DAY_MS } from "@/modules/ai-team/lib/format";
import { indicatorOf } from "@/modules/ai-team/lib/indicators-meta";
import { closeGoals } from "@/modules/ai-team/lib/roadmap";
import { OFFICES } from "@/modules/ai-team/lib/veille-domains";

/**
 * LE FEU D'ARTIFICE (16/11/2026) : les objectifs atteints ces 60 derniers jours que la direction n'a pas encore vus.
 * Chacun avec ce qu'il faut pour féliciter : le chiffre atteint face à la cible, l'avance sur l'échéance, et qui
 * proposera le suivant.
 */

type Raw = Record<string, unknown>;

export type Celebration = {
  id: string;
  title: string;
  kind: "chiffre" | "jalon";
  indicator: string | null;
  unit: string | null;
  value: number | null;
  target: number | null;
  baseline: number | null;
  reachedAt: string;
  dueDate: string;
  /** Les jours d'avance sur l'échéance (0 : pile à temps). */
  daysEarly: number;
  /** La cheffe ou le chef qui proposera le suivant ; null : les chefs (objectif de toute l'entreprise). */
  nextBy: string | null;
  review: string | null;
};

export async function loadCelebrations(payload: Payload, now = new Date()): Promise<Celebration[]> {
  // Les mesures gardées seulement : la relecture en direct (Search Console, GA4…) est faite par le réveil, tous les
  // quarts d'heure — pas à chaque page ouverte par la direction (relecture du 16/11/2026).
  await closeGoals(payload, now).catch(() => []);
  const [goals, chiefs] = await Promise.all([
    payload
      .find({ collection: "ai-team-goals", where: { and: [{ status: { equals: "atteint" } }, { celebratedAt: { exists: false } }, { reachedAt: { greater_than_equal: new Date(now.getTime() - 60 * DAY_MS).toISOString() } }] }, sort: "reachedAt", limit: 5, depth: 0, overrideAccess: true })
      .then((r) => r.docs as unknown as Raw[]),
    payload
      .find({ collection: "ai-team-members", where: { key: { in: Object.values(OFFICES).map((o) => o.chief) } }, pagination: false, depth: 0, overrideAccess: true, select: { key: true, name: true } as never })
      .then((r) => r.docs as unknown as Raw[]),
  ]);
  const nameOf = new Map(chiefs.map((c) => [String(c.key), String(c.name)]));
  const nameById = new Map(chiefs.map((c) => [String(c.id), String(c.name)]));
  return goals.map((g) => {
    const meta = g.kind === "jalon" ? undefined : indicatorOf(String(g.metric));
    const measures = (Array.isArray(g.measures) ? (g.measures as { value?: unknown }[]) : []).filter((m) => typeof m.value === "number");
    const team = String(g.team ?? "tous") as keyof typeof OFFICES | "tous";
    const reachedAt = String(g.reachedAt);
    return {
      id: String(g.id),
      title: String(g.title ?? ""),
      kind: g.kind === "jalon" ? "jalon" : "chiffre",
      indicator: meta?.label ?? null,
      unit: meta?.unit ?? null,
      value: (measures.at(-1)?.value as number | undefined) ?? null,
      target: typeof g.target === "number" ? g.target : null,
      baseline: typeof g.baseline === "number" ? g.baseline : null,
      reachedAt,
      dueDate: String(g.dueDate ?? ""),
      daysEarly: Math.max(0, Math.floor((Date.parse(String(g.dueDate ?? reachedAt)) - Date.parse(reachedAt)) / DAY_MS)),
      nextBy: team in OFFICES ? (nameOf.get(OFFICES[team as keyof typeof OFFICES].chief) ?? null) : g.member != null ? (nameById.get(String(idOf(g.member))) ?? null) : null,
      review: (g.review as string | null) ?? null,
    };
  });
}
