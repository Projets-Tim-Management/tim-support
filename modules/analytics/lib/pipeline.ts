import { average, countByMonth, daysBetween, delta, median, periodBounds, tally, type Delta } from "@/modules/analytics/lib/growth";
import { CLIENT_STATUSES, clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { round2 } from "@/modules/partner/lib/format";
import { LOSS_REASONS } from "@/modules/partner/lib/lossReason";
import { computeClientCA, licenceLinesOf } from "@/modules/partner/lib/pricing";

/**
 * Analyse du pipeline commercial : d'où viennent les opportunités, jusqu'où
 * elles vont, combien de temps elles restent à chaque étape, pourquoi elles
 * se perdent — et ce que ça donne, source par source, partenaire par partenaire.
 *
 * La matière première : les fiches, et le journal (« Étape : A → B », daté),
 * qui dit quand chaque fiche a changé d'étape. Pur, testé.
 */

/* ─── Entrées ─────────────────────────────────────────────────────────────── */

export type PipelineClient = {
  id: number | string;
  companyName?: string | null;
  clientStatus?: string | null;
  createdAt?: string | null;
  source?: string | null;
  partner?: number | string | { id: number | string } | null;
  lossReason?: string | null;
  signatureDate?: string | null;
  contractStartDate?: string | null;
  resiliationDate?: string | null;
  headcount?: number | null;
  licences?: Record<string, number | null | undefined> | null;
};

export type Activity = {
  client?: number | string | { id: number | string } | null;
  occurredAt?: string | null;
  title?: string | null;
};

export type PartnerName = { id: number | string; displayName?: string | null };

/* ─── Sorties ─────────────────────────────────────────────────────────────── */

export type FunnelStep = {
  key: string;
  label: string;
  color: string;
  /** Fiches arrivées AU MOINS jusqu'ici. */
  reached: number;
  /** Part de l'étape précédente qui a continué (null pour la première). */
  fromPrevious: number | null;
  /** Part du total de départ. */
  fromStart: number;
};

export type StageStat = {
  key: string;
  label: string;
  color: string;
  /** Passages terminés par cette étape (on en est sorti). */
  passed: number;
  avgDays: number | null;
  medianDays: number | null;
  /** Fiches actuellement à cette étape, et leur ancienneté moyenne dedans. */
  openNow: number;
  openAvgDays: number | null;
};

export type FlowLink = { from: string; to: string; count: number };
export type FlowNode = { key: string; label: string; color: string };

export type SegmentStat = {
  key: string;
  label: string;
  total: number;
  won: number;
  lost: number;
  open: number;
  conversion: number | null;
  /** Délai moyen création → gagnée, en jours. */
  avgDaysToWin: number | null;
};

export type OpenRow = {
  id: number | string;
  name: string;
  status: string;
  statusLabel: string;
  source: string;
  partner: string | null;
  createdAt: string | null;
  ageDays: number;
  stageDays: number;
  licences: number;
  caHT: number;
};

export type PipelineAnalytics = {
  period: { months: number };
  kpis: {
    open: number;
    created: Delta;
    won: Delta;
    lost: Delta;
    conversion: number | null;
    avgDaysToWin: number | null;
    medianDaysToWin: number | null;
    churned: Delta;
    activeClients: number;
  };
  funnel: FunnelStep[];
  stages: StageStat[];
  /** Le Sankey : les passages vers l'AVANT ; `backward` = les retours en arrière, comptés mais non tracés. */
  flow: { nodes: FlowNode[]; links: FlowLink[]; backward: number };
  monthly: { month: string; created: number; won: number; lost: number }[];
  bySource: SegmentStat[];
  byPartner: SegmentStat[];
  lossReasons: { key: string; label: string; count: number }[];
  churnReasons: { key: string; label: string; count: number }[];
  open: OpenRow[];
};

/* ─── Étapes ──────────────────────────────────────────────────────────────── */

/** L'entonnoir, dans l'ordre du parcours. « En attente longue » est un parking, pas une étape. */
export const FUNNEL = ["nouvelle", "en-qualification", "demo-programmee", "attente-engagement", "en-test", "actif"] as const;
const FUNNEL_INDEX = new Map<string, number>(FUNNEL.map((k, i) => [k, i]));

const SOURCE_LABELS: Record<string, string> = {
  manuelle: "Saisie manuelle",
  "site-vitrine-seo": "Site vitrine — SEO",
  "google-ads-sea": "Google Ads — SEA",
  "chatgpt-ads-sea": "ChatGPT Ads — SEA",
  "site-vitrine": "Site vitrine (import Brevo)",
  brevo: "Import Brevo",
  partenaire: "Partenaire",
};
const sourceLabel = (k: string) => SOURCE_LABELS[k] ?? (k ? k : "Non renseignée");
const lossLabel = (k: string) => LOSS_REASONS.find((r) => r.value === k)?.label ?? (k ? k : "Sans motif");
const labelToStatus = new Map(CLIENT_STATUSES.map((s) => [s.label, s.value]));

const relId = (v: PipelineClient["partner"]): string | null =>
  v == null ? null : typeof v === "object" ? String(v.id) : String(v);

/** « Étape : Nouvelle → Démo programmée » → { from: "nouvelle", to: "demo-programmee" }. */
export function parseTransition(title?: string | null): { from: string; to: string } | null {
  const m = /^Étape\s*:\s*(.+?)\s*→\s*(.+)$/u.exec(title ?? "");
  if (!m) return null;
  const from = labelToStatus.get(m[1].trim());
  const to = labelToStatus.get(m[2].trim());
  return from && to ? { from, to } : null;
}

type Segment = { status: string; enteredAt: number; leftAt: number | null };

/**
 * La chronologie d'une fiche : où elle était, de quand à quand. Le journal
 * donne les passages ; la création ouvre la première étape (celle d'où part
 * la première transition, ou l'étape actuelle s'il n'y en a jamais eu).
 */
export function timelineOf(client: PipelineClient, transitions: { at: number; from: string; to: string }[], now: number): Segment[] {
  const sorted = [...transitions].sort((a, b) => a.at - b.at);
  const created = client.createdAt ? Date.parse(client.createdAt) : (sorted[0]?.at ?? now);
  const first = sorted[0]?.from ?? client.clientStatus ?? "nouvelle";
  const segments: Segment[] = [{ status: first, enteredAt: created, leftAt: null }];
  for (const t of sorted) {
    const last = segments[segments.length - 1];
    last.leftAt = t.at;
    segments.push({ status: t.to, enteredAt: t.at, leftAt: null });
  }
  return segments;
}

/* ─── Calcul ──────────────────────────────────────────────────────────────── */

export function buildPipelineAnalytics(
  clients: PipelineClient[],
  activities: Activity[],
  partners: PartnerName[],
  months: number,
  now: Date,
): PipelineAnalytics {
  const nowMs = now.getTime();
  const { from } = periodBounds(months, now);
  const partnerName = new Map(partners.map((p) => [String(p.id), p.displayName ?? `Partenaire #${p.id}`]));

  // Transitions par fiche, depuis le journal.
  const transitionsByClient = new Map<string, { at: number; from: string; to: string }[]>();
  for (const a of activities) {
    const t = parseTransition(a.title);
    const cid = relId(a.client as PipelineClient["partner"]);
    if (!t || !cid || !a.occurredAt) continue;
    const list = transitionsByClient.get(cid) ?? [];
    list.push({ at: Date.parse(a.occurredAt), ...t });
    transitionsByClient.set(cid, list);
  }

  type Enriched = {
    c: PipelineClient;
    timeline: Segment[];
    maxStage: number;
    wonAt: number | null;
    lostAt: number | null;
    churnedAt: number | null;
  };
  const rows: Enriched[] = clients.map((c) => {
    const timeline = timelineOf(c, transitionsByClient.get(String(c.id)) ?? [], nowMs);
    const seen = new Set(timeline.map((s) => s.status));
    // Une fiche gagnée puis résiliée a bien atteint « Gagnée ».
    if (c.clientStatus === "resilie" || c.clientStatus === "archive") seen.add("actif");
    // Toute fiche est au moins entrée dans l'entonnoir : une affaire perdue
    // ou parquée sans passage enregistré compte à la première étape.
    let maxStage = 0;
    for (const s of seen) {
      const i = FUNNEL_INDEX.get(s);
      if (i != null && i > maxStage) maxStage = i;
    }
    const enteredActif = timeline.find((s) => s.status === "actif")?.enteredAt ?? null;
    const wonAt =
      enteredActif ??
      (seen.has("actif") ? (c.contractStartDate ? Date.parse(c.contractStartDate) : c.signatureDate ? Date.parse(c.signatureDate) : null) : null);
    const lostAt = c.clientStatus === "perdue" ? (timeline.find((s) => s.status === "perdue")?.enteredAt ?? null) : null;
    const churnedAt =
      c.clientStatus === "resilie" || c.clientStatus === "archive"
        ? c.resiliationDate
          ? Date.parse(c.resiliationDate)
          : (timeline.find((s) => s.status === c.clientStatus)?.enteredAt ?? null)
        : null;
    return { c, timeline, maxStage, wonAt, lostAt, churnedAt };
  });

  const createdMs = (r: Enriched) => (r.c.createdAt ? Date.parse(r.c.createdAt) : r.timeline[0].enteredAt);
  const inPeriod = rows.filter((r) => createdMs(r) >= from);

  /* ── Entonnoir : les fiches créées sur la période ── */
  const start = inPeriod.length;
  const funnel: FunnelStep[] = FUNNEL.map((key, i) => {
    const meta = clientStatusMeta(key);
    const reached = inPeriod.filter((r) => r.maxStage >= i).length;
    const prev = i === 0 ? null : inPeriod.filter((r) => r.maxStage >= i - 1).length;
    return {
      key,
      label: key === "actif" ? "Gagnée" : (meta?.label ?? key),
      color: meta?.color ?? "var(--tim-gray)",
      reached,
      fromPrevious: prev ? round2((reached / prev) * 100) : null,
      fromStart: start ? round2((reached / start) * 100) : 0,
    };
  });

  /* ── Temps par étape (toutes fiches) ── */
  const stageKeys = [...FUNNEL.slice(0, -1), "attente-longue"];
  const stages: StageStat[] = stageKeys.map((key) => {
    const meta = clientStatusMeta(key);
    const passed: number[] = [];
    const openAges: number[] = [];
    for (const r of rows) {
      for (const s of r.timeline) {
        if (s.status !== key) continue;
        if (s.leftAt != null) passed.push(daysBetween(s.enteredAt, s.leftAt));
        else if (r.c.clientStatus === key) openAges.push(daysBetween(s.enteredAt, nowMs));
      }
    }
    return {
      key,
      label: meta?.label ?? key,
      color: meta?.color ?? "var(--tim-gray)",
      passed: passed.length,
      avgDays: average(passed),
      medianDays: median(passed),
      openNow: openAges.length,
      openAvgDays: average(openAges),
    };
  });

  /* ── Flux (Sankey) : chaque passage d'étape compté ──
   *
   * Vers l'AVANT seulement. Un Sankey est un graphe sans cycle : une fiche
   * revenue en arrière (Démo → Attente, puis Attente → Démo) ferait un lien
   * dans chaque sens, et le calcul de profondeur des nœuds boucle sans fin —
   * c'est ce qui plantait la page (updateDepthOfTargets, pile dépassée). Les
   * retours sont comptés à part et dits sous le diagramme. */
  const order = new Map<string, number>(CLIENT_STATUSES.map((st, i) => [st.value, i]));
  const linkCounts = new Map<string, number>();
  let backward = 0;
  for (const list of transitionsByClient.values()) {
    for (const t of list) {
      if ((order.get(t.to) ?? -1) <= (order.get(t.from) ?? -1)) {
        backward += 1;
        continue;
      }
      const k = `${t.from}|${t.to}`;
      linkCounts.set(k, (linkCounts.get(k) ?? 0) + 1);
    }
  }
  const links: FlowLink[] = [...linkCounts.entries()]
    .map(([k, count]) => {
      const [f, t] = k.split("|");
      return { from: f, to: t, count };
    })
    .sort((a, b) => b.count - a.count);
  const nodeKeys = new Set<string>();
  for (const l of links) {
    nodeKeys.add(l.from);
    nodeKeys.add(l.to);
  }
  const nodes: FlowNode[] = CLIENT_STATUSES.filter((s) => nodeKeys.has(s.value)).map((s) => ({
    key: s.value,
    label: s.value === "actif" ? "Gagnée" : s.label,
    color: s.color,
  }));

  /* ── Mensuel ── */
  const createdSeries = countByMonth(rows, (r) => r.c.createdAt, months, now);
  const wonSeries = countByMonth(rows, (r) => (r.wonAt ? new Date(r.wonAt).toISOString() : null), months, now);
  const lostSeries = countByMonth(rows, (r) => (r.lostAt ? new Date(r.lostAt).toISOString() : null), months, now);
  const monthly = createdSeries.map((p, i) => ({ month: p.month, created: p.count, won: wonSeries[i].count, lost: lostSeries[i].count }));

  /* ── Segments : source, partenaire ── */
  const segment = (keyOf: (r: Enriched) => string, labelOf: (k: string) => string): SegmentStat[] => {
    const groups = new Map<string, Enriched[]>();
    for (const r of inPeriod) {
      const k = keyOf(r);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()]
      .map(([key, list]) => {
        const won = list.filter((r) => r.maxStage === FUNNEL.length - 1);
        const lost = list.filter((r) => r.c.clientStatus === "perdue").length;
        return {
          key,
          label: labelOf(key),
          total: list.length,
          won: won.length,
          lost,
          open: list.length - won.length - lost,
          conversion: list.length ? round2((won.length / list.length) * 100) : null,
          avgDaysToWin: average(won.filter((r) => r.wonAt).map((r) => daysBetween(createdMs(r), r.wonAt!))),
        };
      })
      .sort((a, b) => b.total - a.total);
  };
  const bySource = segment((r) => r.c.source ?? "", sourceLabel);
  const byPartner = segment(
    (r) => relId(r.c.partner) ?? "",
    (k) => (k ? (partnerName.get(k) ?? `Partenaire #${k}`) : "Sans partenaire"),
  );

  /* ── Motifs ── */
  const lossReasons = tally(rows.filter((r) => r.c.clientStatus === "perdue" && createdMs(r) >= from), (r) => r.c.lossReason, lossLabel);
  const churnReasons = tally(rows.filter((r) => r.churnedAt != null), (r) => r.c.lossReason, lossLabel);

  /* ── En cours ── */
  const isOpen = (r: Enriched) => {
    const phase = clientStatusMeta(r.c.clientStatus)?.phase;
    return phase === "pipeline" || phase === "test";
  };
  const open: OpenRow[] = rows
    .filter(isOpen)
    .map((r) => {
      const current = r.timeline[r.timeline.length - 1];
      const lines = licenceLinesOf(r.c.licences);
      const { totalLicences, caHT } = computeClientCA(lines);
      return {
        id: r.c.id,
        name: r.c.companyName ?? "—",
        status: r.c.clientStatus ?? "",
        statusLabel: clientStatusMeta(r.c.clientStatus)?.label ?? r.c.clientStatus ?? "—",
        source: sourceLabel(r.c.source ?? ""),
        partner: relId(r.c.partner) ? (partnerName.get(relId(r.c.partner)!) ?? null) : null,
        createdAt: r.c.createdAt ?? null,
        ageDays: round2(daysBetween(createdMs(r), nowMs)),
        stageDays: round2(daysBetween(current.enteredAt, nowMs)),
        licences: totalLicences,
        caHT,
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);

  /* ── KPI ── */
  const wonAll = rows.filter((r) => r.wonAt != null);
  const daysToWin = wonAll.map((r) => daysBetween(createdMs(r), r.wonAt!)).filter((d) => d >= 0);
  const wonInPeriod = inPeriod.filter((r) => r.maxStage === FUNNEL.length - 1).length;

  return {
    period: { months },
    kpis: {
      open: open.length,
      created: periodDeltaOf(rows.map(createdMs), months, now),
      won: periodDeltaOf(rows.map((r) => r.wonAt), months, now),
      lost: periodDeltaOf(rows.map((r) => r.lostAt), months, now),
      conversion: inPeriod.length ? round2((wonInPeriod / inPeriod.length) * 100) : null,
      avgDaysToWin: average(daysToWin),
      medianDaysToWin: median(daysToWin),
      churned: periodDeltaOf(rows.map((r) => r.churnedAt), months, now),
      activeClients: rows.filter((r) => r.c.clientStatus === "actif").length,
    },
    funnel,
    stages,
    flow: { nodes, links, backward },
    monthly,
    bySource,
    byPartner,
    lossReasons,
    churnReasons,
    open,
  };
}

/** Variation période / période précédente d'une liste d'instants (ms, ou null si l'événement n'a pas eu lieu). */
function periodDeltaOf(times: (number | null)[], months: number, now: Date): Delta {
  const { from, prevFrom } = periodBounds(months, now);
  let cur = 0;
  let prev = 0;
  for (const t of times) {
    if (t == null) continue;
    if (t >= from) cur += 1;
    else if (t >= prevFrom) prev += 1;
  }
  return delta(cur, prev);
}
