import { CHANNELS, PLACEMENTS } from "@/modules/forms/lib/form-schema";
import { CHANNEL_SOURCES } from "@/modules/forms/lib/channel";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { lossReasonLabel } from "@/modules/partner/lib/lossReason";

/**
 * Agrégats de l'écran Acquisition — partie PURE, testable sans base.
 *
 * Ce que Brevo ne savait pas dire : d'où viennent les leads, et lesquels
 * aboutissent. Le comptage se fait ici, côté serveur, ce qui en fait la source
 * de vérité — un bloqueur de publicité fait taire GA4, pas une ligne en base.
 */

export interface SubmissionRow {
  channel?: string | null;
  channelSource?: string | null;
  placement?: string | null;
  sourcePagePath?: string | null;
  utmCampaign?: string | null;
  lpVariant?: string | null;
}

export interface ClientRow {
  clientStatus?: string | null;
  lossReason?: string | null;
  channel?: string | null;
}

export interface Row {
  label: string;
  value: number;
  /** Valeur technique, quand l'affichage a besoin de la couleur associée. */
  key?: string;
}

const labelFrom = (list: readonly { label: string; value: string }[], v?: string | null) =>
  list.find((x) => x.value === v)?.label ?? v ?? "—";

/** Comptage par clé, trié du plus grand au plus petit. */
function tally(values: (string | null | undefined)[], fallback = "—"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const key = raw?.trim() || fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map([...counts].sort((a, b) => b[1] - a[1]));
}

/**
 * Les `limit` premières lignes, le reste regroupé.
 *
 * Sans ce regroupement, une longue traîne de pages à un lead chacune occuperait
 * tout l'écran et masquerait les trois qui comptent.
 */
export function topRows(counts: Map<string, number>, limit = 8): Row[] {
  const all = [...counts];
  const head = all.slice(0, limit).map(([label, value]) => ({ label, value }));
  const tail = all.slice(limit);
  if (tail.length) {
    head.push({
      label: `${tail.length} autre${tail.length > 1 ? "s" : ""}`,
      value: tail.reduce((n, [, v]) => n + v, 0),
    });
  }
  return head;
}

export interface Stats {
  total: number;
  /** Leads par canal d'acquisition. */
  parCanal: Row[];
  /** Sur quoi le canal a été décidé — mesure la fiabilité de l'attribution. */
  parPreuve: Row[];
  /** Part des leads SEA attribués par un clic réellement constaté (0 à 1). */
  fiabiliteSea: number | null;
  parEmplacement: Row[];
  parPage: Row[];
  parCampagne: Row[];
  /** Variantes de landing page — l'A/B test, enfin mesurable. */
  parVariante: Row[];
  /** Devenir des opportunités nées d'un formulaire. */
  parStatut: Row[];
  /** Motifs de perte de ces mêmes opportunités. */
  parMotif: Row[];
  gagnees: number;
  perdues: number;
}

export function buildStats(subs: SubmissionRow[], clients: ClientRow[]): Stats {
  const sea = subs.filter((s) => s.channel === "sea");
  const clicsConstates = sea.filter((s) => s.channelSource === "clic-payant").length;

  const statuts = tally(clients.map((c) => c.clientStatus));
  const perdus = clients.filter((c) => c.clientStatus === "perdue");

  return {
    total: subs.length,
    parCanal: [...tally(subs.map((s) => s.channel), "inconnu")].map(([v, value]) => ({
      label: labelFrom(CHANNELS, v),
      value,
      key: v,
    })),
    parPreuve: [...tally(subs.map((s) => s.channelSource), "inconnu")].map(([v, value]) => ({
      label: labelFrom(CHANNEL_SOURCES, v),
      value,
      key: v,
    })),
    fiabiliteSea: sea.length ? clicsConstates / sea.length : null,
    parEmplacement: [...tally(subs.map((s) => s.placement), "inconnu")].map(([v, value]) => ({
      label: labelFrom(PLACEMENTS, v),
      value,
      key: v,
    })),
    parPage: topRows(tally(subs.map((s) => s.sourcePagePath), "page inconnue")),
    parCampagne: topRows(tally(subs.map((s) => s.utmCampaign), "sans campagne")),
    parVariante: [...tally(subs.map((s) => s.lpVariant), "hors landing page")].map(([v, value]) => ({
      label: v,
      value,
    })),
    parStatut: [...statuts].map(([v, value]) => ({
      label: clientStatusMeta(v)?.label ?? v,
      value,
      key: v,
    })),
    parMotif: [...tally(perdus.map((c) => c.lossReason), "sans motif")].map(([v, value]) => ({
      label: lossReasonLabel(v) ?? v,
      value,
      key: v,
    })),
    gagnees: statuts.get("actif") ?? 0,
    perdues: perdus.length,
  };
}
