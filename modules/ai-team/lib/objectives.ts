import type { Payload } from "payload";

import { DAY_MS, r2, safeHttpsUrl } from "@/modules/ai-team/lib/format";
import type { Figures } from "@/modules/ai-team/lib/scorecard";

/**
 * LES MESURES DE RÉSULTAT de l'équipe IA, lues par le score de maîtrise
 * (ai-team/lib/mastery) :
 *
 *  - le coût par lead qualifié d'un canal, ou de toute la publicité payante
 *    (SEO exclu), face au REPÈRE DU MARCHÉ que rapporte la veille (sourcé) ;
 *  - la part des leads au canal connu (Yanis).
 *
 * Une cible fixée par la direction a été essayée le 12/11/2026 puis remplacée
 * par le score de maîtrise : la cible est 100 pour tous, à eux de s'en
 * approcher.
 */

export type Tracking = { leads: number; known: number };
export type Benchmark = { valeur: number; unite: string; libelle: string; source: string };

const PAID = new Set(["meta", "google", "chatgpt"]);

/** Le coût par lead qualifié d'un canal, ou de toute la publicité payante (`null`). Null : aucun lead qualifié. Pure (testée). */
export function costPerQualified(rows: { key: string; now: Figures }[], channel: string | null): number | null {
  if (channel) return rows.find((r) => r.key === channel)?.now.costPerQualified ?? null;
  const paid = rows.filter((r) => PAID.has(r.key));
  const qualified = paid.reduce((n, r) => n + r.now.qualified, 0);
  return qualified ? r2(paid.reduce((s, r) => s + r.now.spend, 0) / qualified) : null;
}

/** La part des leads au canal connu, en % ; null sans lead. Pure. */
export const trackingPct = (t: Tracking | null): number | null => (t && t.leads ? Math.round((t.known / t.leads) * 1000) / 10 : null);

/** Les leads des 30 derniers jours, et combien ont un canal connu. */
export async function loadTracking(payload: Payload, now = new Date()): Promise<Tracking> {
  const since = { greater_than_equal: new Date(now.getTime() - 30 * DAY_MS).toISOString() };
  const [all, known] = await Promise.all([
    payload.count({ collection: "form-submissions", where: { createdAt: since }, overrideAccess: true }),
    payload.count({ collection: "form-submissions", where: { and: [{ createdAt: since }, { channel: { exists: true } }] }, overrideAccess: true }),
  ]);
  return { leads: all.totalDocs, known: known.totalDocs };
}

/** Un repère du marché tel que la veille le rend, vérifié. Pure (testée). */
export function parseBenchmark(raw: unknown): Benchmark | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const valeur = typeof b.valeur === "number" ? b.valeur : Number(b.valeur);
  const source = safeHttpsUrl(b.source);
  if (!Number.isFinite(valeur) || valeur <= 0 || !source) return null;
  return { valeur: r2(valeur), unite: String(b.unite ?? "").slice(0, 10), libelle: String(b.libelle ?? "").slice(0, 200), source };
}
