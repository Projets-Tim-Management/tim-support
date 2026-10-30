import { round2 } from "@/modules/partner/lib/format";
import { AXONAUT_LAST_MONTH } from "@/modules/analytics/lib/axonaut";

/**
 * Le CA facturé, mois par mois et client par client, depuis janvier 2025 :
 * Axonaut jusqu'en septembre 2026, Pennylane ensuite. Une seule source par
 * mois — la bascule tranche, rien n'est compté deux fois.
 *
 * Axonaut distingue le récurrent (licences) des prestations ponctuelles ;
 * Pennylane non : ses factures comptent comme récurrent. Les mouvements
 * (nouveaux clients, départs, hausses, baisses) se lisent sur le récurrent
 * seul — une mise en place n'est pas un client qui grandit.
 *
 * Pur : l'écran passe les factures, reçoit des chiffres prêts à afficher.
 */

export const HISTORY_START = "2025-01";

export type LegacyInvoice = {
  month: string; // « AAAA-MM »
  client: number | string | null;
  clientName: string;
  recurringHT: number;
  servicesHT: number;
};

export type PennylaneInvoice = {
  date: string; // ISO jour
  amountHT: number;
  client: number | string;
  clientName: string;
};

export type HistoryMonth = {
  /** 1er du mois, ISO (pour les graphiques). */
  month: string;
  key: string;
  source: "axonaut" | "pennylane";
  recurring: number;
  services: number;
  total: number;
  clients: number;
  /** Mouvements du récurrent par rapport au mois d'avant. */
  gained: number;
  lost: number;
  expansion: number;
  contraction: number;
  gainedNames: string;
  lostNames: string;
};

export type HistoryClient = {
  id: string;
  /** La fiche, si la facture y est rattachée. */
  clientId: number | string | null;
  name: string;
  firstMonth: string;
  lastMonth: string;
  monthsBilled: number;
  /** Récurrent du dernier mois facturé. */
  lastRecurring: number;
  services: number;
  byYear: Record<string, number>;
  byMonth: Record<string, number>;
  /** Licences seules, par mois facturé (les mouvements se lisent dessus). */
  recurringByMonth: Record<string, number>;
  servicesByMonth: Record<string, number>;
};

export type RevenueHistory = {
  months: HistoryMonth[];
  clients: HistoryClient[];
  years: { year: string; recurring: number; services: number; total: number }[];
};

const keyToIso = (k: string) => `${k}-01T00:00:00.000Z`;

/** Les clés « AAAA-MM » de `from` au mois de `now` inclus. */
export function monthKeys(from: string, now: Date): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const endY = now.getUTCFullYear();
  const endM = now.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function buildRevenueHistory(legacy: LegacyInvoice[], pennylane: PennylaneInvoice[], now: Date): RevenueHistory {
  const keys = monthKeys(HISTORY_START, now);
  // client → mois → { récurrent, prestations }
  const acc = new Map<string, { clientId: number | string | null; name: string; byMonth: Map<string, { r: number; s: number }> }>();
  const add = (id: string, clientId: number | string | null, name: string, month: string, r: number, s: number) => {
    const c = acc.get(id) ?? { clientId, name, byMonth: new Map() };
    const m = c.byMonth.get(month) ?? { r: 0, s: 0 };
    m.r += r;
    m.s += s;
    c.byMonth.set(month, m);
    acc.set(id, c);
  };

  for (const i of legacy) {
    if (i.month > AXONAUT_LAST_MONTH || i.month < HISTORY_START) continue;
    add(i.client != null ? String(i.client) : `nom:${i.clientName}`, i.client, i.clientName, i.month, i.recurringHT, i.servicesHT);
  }
  for (const i of pennylane) {
    const month = i.date.slice(0, 7);
    if (month <= AXONAUT_LAST_MONTH) continue;
    add(String(i.client), i.client, i.clientName, month, i.amountHT, 0);
  }

  const months: HistoryMonth[] = [];
  let prev = new Map<string, number>();
  for (const k of keys) {
    const cur = new Map<string, number>();
    let recurring = 0;
    let services = 0;
    for (const [id, c] of acc) {
      const m = c.byMonth.get(k);
      if (!m) continue;
      recurring += m.r;
      services += m.s;
      if (m.r > 0.005) cur.set(id, m.r);
    }
    const gained = [...cur.keys()].filter((id) => !prev.has(id));
    const lost = [...prev.keys()].filter((id) => !cur.has(id));
    let expansion = 0;
    let contraction = 0;
    for (const [id, r] of cur) {
      const before = prev.get(id);
      if (before == null) continue;
      if (r > before) expansion += r - before;
      else contraction += before - r;
    }
    const first = k === keys[0];
    months.push({
      month: keyToIso(k),
      key: k,
      source: k <= AXONAUT_LAST_MONTH ? "axonaut" : "pennylane",
      recurring: round2(recurring),
      services: round2(services),
      total: round2(recurring + services),
      clients: cur.size,
      // Le premier mois n'a pas de « mois d'avant » : pas de mouvement inventé.
      gained: first ? 0 : gained.length,
      lost: first ? 0 : lost.length,
      expansion: first ? 0 : round2(expansion),
      contraction: first ? 0 : round2(contraction),
      gainedNames: first ? "" : gained.map((id) => acc.get(id)!.name).join(", "),
      lostNames: first ? "" : lost.map((id) => acc.get(id)!.name).join(", "),
    });
    prev = cur;
  }

  const clients: HistoryClient[] = [...acc.entries()].map(([id, c]) => {
    const billed = [...c.byMonth.entries()].filter(([k]) => keys.includes(k)).sort(([a], [b]) => a.localeCompare(b));
    const withRecurring = billed.filter(([, m]) => m.r > 0.005);
    const byYear: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    const recurringByMonth: Record<string, number> = {};
    const servicesByMonth: Record<string, number> = {};
    for (const [k, m] of billed) {
      byYear[k.slice(0, 4)] = round2((byYear[k.slice(0, 4)] ?? 0) + m.r + m.s);
      byMonth[k] = round2(m.r + m.s);
      recurringByMonth[k] = round2(m.r);
      servicesByMonth[k] = round2(m.s);
    }
    return {
      id,
      clientId: c.clientId,
      name: c.name,
      firstMonth: billed[0]?.[0] ?? "",
      lastMonth: billed.at(-1)?.[0] ?? "",
      monthsBilled: withRecurring.length,
      lastRecurring: round2(withRecurring.at(-1)?.[1].r ?? 0),
      services: round2(billed.reduce((s, [, m]) => s + m.s, 0)),
      byYear,
      byMonth,
      recurringByMonth,
      servicesByMonth,
    };
  });
  clients.sort((a, b) => b.lastRecurring - a.lastRecurring || a.name.localeCompare(b.name));

  const years = [...new Set(keys.map((k) => k.slice(0, 4)))].map((year) => {
    const ms = months.filter((m) => m.key.startsWith(year));
    const recurring = round2(ms.reduce((s, m) => s + m.recurring, 0));
    const services = round2(ms.reduce((s, m) => s + m.services, 0));
    return { year, recurring, services, total: round2(recurring + services) };
  });

  return { months, clients, years };
}

/* ─── Une période (1, 3, 6 ou 12 mois), et sa comparaison à une autre ────── */

export const HISTORY_DURATIONS = [1, 3, 6, 12] as const;
export type HistoryDuration = (typeof HISTORY_DURATIONS)[number];

/** « AAAA-MM » décalé de `n` mois. */
export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Les `months` mois qui finissent en `end`, du plus ancien au plus récent. */
export const periodKeys = (end: string, months: number) => Array.from({ length: months }, (_, i) => shiftMonth(end, i - months + 1));

const short = (k: string, year = true) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

/** « oct. 2026 », « août – oct. 2026 », « nov. 2025 – oct. 2026 ». */
export function periodLabel(end: string, months: number): string {
  const start = shiftMonth(end, -(months - 1));
  if (months === 1) return short(end);
  return `${short(start, start.slice(0, 4) !== end.slice(0, 4))} – ${short(end)}`;
}

export type PeriodSummary = {
  label: string;
  keys: string[];
  /** Mois couverts par l'historique (une période qui commence avant janvier 2025 est incomplète). */
  covered: number;
  recurring: number;
  services: number;
  total: number;
  /** Moyenne par mois couvert. */
  avgMonthly: number;
  /** Licences du dernier mois : le récurrent avec lequel la période se termine. */
  endRecurring: number;
  /** Clients facturés en licences au moins un mois. */
  clients: number;
  /** Arrivées et départs mois après mois (un client parti puis revenu compte dans les deux). */
  gained: string[];
  lost: string[];
};

export type ClientComparison = {
  id: string;
  clientId: number | string | null;
  name: string;
  firstMonth: string;
  recurringA: number;
  recurringB: number | null;
  servicesA: number;
  servicesB: number | null;
  diff: number | null;
  pct: number | null;
  status: "nouveau" | "parti" | "hausse" | "baisse" | "stable" | "prestations" | null;
};

export type PeriodComparison = {
  months: number;
  a: PeriodSummary;
  b: PeriodSummary | null;
  /** Mois par mois, alignés par rang : le 1er mois de A face au 1er de B. */
  chart: { label: string; long: string; a: number; aRecurring: number; aServices: number; b: number | null }[];
  clients: ClientComparison[];
};

function summarize(h: RevenueHistory, end: string, months: number): PeriodSummary {
  const keys = periodKeys(end, months);
  const inHistory = new Map(h.months.map((m) => [m.key, m]));
  const ms = keys.map((k) => inHistory.get(k)).filter((m): m is HistoryMonth => m != null);
  const recurring = round2(ms.reduce((s, m) => s + m.recurring, 0));
  const services = round2(ms.reduce((s, m) => s + m.services, 0));
  const has = (c: HistoryClient, k: string) => (c.recurringByMonth[k] ?? 0) > 0.005;
  const gained: string[] = [];
  const lost: string[] = [];
  for (const k of keys) {
    const before = shiftMonth(k, -1);
    // Pas de « mois d'avant » dans l'historique : pas de mouvement inventé.
    if (!inHistory.has(k) || !inHistory.has(before)) continue;
    for (const c of h.clients) {
      if (has(c, k) && !has(c, before)) gained.push(c.name);
      if (!has(c, k) && has(c, before)) lost.push(c.name);
    }
  }
  return {
    label: periodLabel(end, months),
    keys,
    covered: ms.length,
    recurring,
    services,
    total: round2(recurring + services),
    avgMonthly: ms.length ? round2((recurring + services) / ms.length) : 0,
    endRecurring: inHistory.get(end)?.recurring ?? 0,
    clients: h.clients.filter((c) => keys.some((k) => has(c, k))).length,
    gained: [...new Set(gained)],
    lost: [...new Set(lost)],
  };
}

const sumOver = (by: Record<string, number>, keys: string[]) => round2(keys.reduce((s, k) => s + (by[k] ?? 0), 0));

/**
 * La période A (`months` mois finissant en `aEnd`) et, si `bEnd` est donné,
 * la période B de même durée à laquelle la comparer. Les clients sont lus
 * sur les licences (l'évolution) ; les prestations restent à part.
 */
export function comparePeriods(h: RevenueHistory, months: number, aEnd: string, bEnd: string | null): PeriodComparison {
  const a = summarize(h, aEnd, months);
  const b = bEnd ? summarize(h, bEnd, months) : null;
  const byKey = new Map(h.months.map((m) => [m.key, m]));

  const chart = a.keys.map((k, i) => {
    const m = byKey.get(k);
    const bk = b?.keys[i];
    const bm = bk ? byKey.get(bk) : undefined;
    return {
      label: `${short(k, false)} ${k.slice(2, 4)}`,
      long: b && bk ? `${short(k)} face à ${short(bk)}` : short(k),
      a: m?.total ?? 0,
      aRecurring: m?.recurring ?? 0,
      aServices: m?.services ?? 0,
      b: b ? (bm?.total ?? null) : null,
    };
  });

  const clients: ClientComparison[] = h.clients
    .map((c) => {
      const recurringA = sumOver(c.recurringByMonth, a.keys);
      const servicesA = sumOver(c.servicesByMonth, a.keys);
      const recurringB = b ? sumOver(c.recurringByMonth, b.keys) : null;
      const servicesB = b ? sumOver(c.servicesByMonth, b.keys) : null;
      let status: ClientComparison["status"] = null;
      let diff: number | null = null;
      let pct: number | null = null;
      if (recurringB != null) {
        diff = round2(recurringA - recurringB);
        pct = recurringB > 0 ? round2((diff / recurringB) * 100) : null;
        status =
          recurringA > 0.005 && recurringB <= 0.005
            ? "nouveau"
            : recurringA <= 0.005 && recurringB > 0.005
              ? "parti"
              : recurringA <= 0.005
                ? "prestations"
                : diff > 0.005
                  ? "hausse"
                  : diff < -0.005
                    ? "baisse"
                    : "stable";
      }
      return { id: c.id, clientId: c.clientId, name: c.name, firstMonth: c.firstMonth, recurringA, recurringB, servicesA, servicesB, diff, pct, status };
    })
    .filter((c) => c.recurringA || c.servicesA || c.recurringB || c.servicesB);

  return { months, a, b, chart, clients };
}

/**
 * Lit le choix de l'écran (`hd` durée, `hf` mois de fin, `hc` comparaison :
 * « prec », « n1 », « aucune » ou un mois de fin) et le borne à l'historique.
 * Par défaut : 3 mois jusqu'au dernier mois facturé, face aux 3 d'avant.
 */
export function historySelection(h: RevenueHistory, sp: Record<string, string | string[] | undefined> | undefined) {
  const one = (k: string) => {
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const asked = Number(one("hd"));
  const months: HistoryDuration = (HISTORY_DURATIONS as readonly number[]).includes(asked) ? (asked as HistoryDuration) : 3;

  // Les fins possibles : la période doit tenir dans l'historique.
  const keys = h.months.map((m) => m.key);
  const ends = keys.filter((k) => shiftMonth(k, -(months - 1)) >= HISTORY_START);
  // Le mois en cours n'est pas encore facturé les premiers jours : on part du dernier qui l'est.
  const lastBilled = [...h.months].reverse().find((m) => m.total > 0)?.key ?? keys.at(-1)!;
  const hf = one("hf");
  const end = hf && ends.includes(hf) ? hf : ends.includes(lastBilled) ? lastBilled : (ends.at(-1) ?? keys.at(-1)!);

  const hc = one("hc") ?? "prec";
  const compare = hc === "aucune" || hc === "n1" || hc === "prec" || ends.includes(hc) ? hc : "prec";
  const bEnd = compare === "aucune" ? null : compare === "prec" ? shiftMonth(end, -months) : compare === "n1" ? shiftMonth(end, -12) : compare;
  // Une comparaison sans aucun mois dans l'historique n'apprend rien.
  const bUsable = bEnd != null && bEnd >= HISTORY_START;

  return {
    months,
    end,
    compare,
    bEnd: bUsable ? bEnd : null,
    /** La comparaison demandée tombe avant janvier 2025. */
    bOutOfRange: bEnd != null && !bUsable,
    endOptions: [...ends].reverse().map((k) => ({ value: k, label: periodLabel(k, months) })),
    compareOptions: [
      { value: "prec", label: `Période précédente (${periodLabel(shiftMonth(end, -months), months)})` },
      ...(months < 12 ? [{ value: "n1", label: `Un an avant (${periodLabel(shiftMonth(end, -12), months)})` }] : []),
      ...[...ends]
        .reverse()
        .filter((k) => k !== end)
        .map((k) => ({ value: k, label: periodLabel(k, months) })),
      { value: "aucune", label: "Aucune comparaison" },
    ],
  };
}
