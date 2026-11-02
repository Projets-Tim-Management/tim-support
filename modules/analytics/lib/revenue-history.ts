import { round2 } from "@/modules/partner/lib/format";
import { AXONAUT_LAST_MONTH } from "@/modules/analytics/lib/axonaut";
import { expensesByMonth, type Expense } from "@/modules/analytics/lib/expenses";

/**
 * Le CA facturé, mois par mois et client par client, depuis la première
 * facture (septembre 2021) :
 * Axonaut jusqu'en septembre 2026, Pennylane ensuite. Une seule source par
 * mois — la bascule tranche, rien n'est compté deux fois.
 *
 * Axonaut distingue le récurrent (licences) des prestations ponctuelles ;
 * Pennylane non : ses factures comptent comme récurrent. Une facture qui
 * couvre plusieurs mois (trimestrielle : trois) est lissée sur ces mois, comme
 * un revenu mensuel récurrent ; un mois pas encore arrivé n'est pas montré.
 *
 * Les dépenses (relevés Pennylane, voir expenses.ts) se posent à côté, mois
 * par mois, à partir du premier mois où on les connaît ; avant, elles valent
 * null — jamais zéro, sinon 2025 paraîtrait sans dépense. Les mouvements
 * (nouveaux clients, départs, hausses, baisses) se lisent sur le récurrent
 * seul — une mise en place n'est pas un client qui grandit.
 *
 * Pur : l'écran passe les factures, reçoit des chiffres prêts à afficher.
 */

/** Plancher : la première facture de TIM. L'historique commence à la première facture connue, jamais avant. */
export const HISTORY_START = "2021-09";

export type LegacyInvoice = {
  month: string; // « AAAA-MM »
  client: number | string | null;
  clientName: string;
  recurringHT: number;
  servicesHT: number;
  /** Part des prestations en mise en place / formation ; le reste est du développement. */
  setupHT?: number;
};

export type PennylaneInvoice = {
  date: string; // ISO jour
  amountHT: number;
  client: number | string;
  clientName: string;
  /** Mois couverts par la facture (trimestrielle : 3) ; 1 à défaut. */
  months?: number;
};

export type HistoryMonth = {
  /** 1er du mois, ISO (pour les graphiques). */
  month: string;
  key: string;
  source: "axonaut" | "pennylane";
  recurring: number;
  services: number;
  /** Dont mise en place / formation ; le reste des prestations est du développement. */
  setup: number;
  dev: number;
  total: number;
  /** Dépenses avant impôts, impôts, et CA moins dépenses ; null avant les relevés. */
  expenses: number | null;
  taxes: number | null;
  profit: number | null;
  /** Les dépenses par poste (Google Ads, SEO…). */
  byPoste: Record<string, number>;
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
  /** Premier mois de l'historique (« AAAA-MM ») : la première facture connue. */
  start: string;
  months: HistoryMonth[];
  /** Premier mois dont on connaît les dépenses (null : aucune). */
  expensesFrom: string | null;
  /** Les postes de dépenses, du plus gros au plus petit. */
  postes: string[];
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

export function buildRevenueHistory(legacy: LegacyInvoice[], pennylane: PennylaneInvoice[], now: Date, expenses: Expense[] = []): RevenueHistory {
  // Le premier mois facturé (Axonaut, sinon Pennylane), jamais avant le plancher.
  const firstMonth = [...legacy.map((i) => i.month), ...pennylane.map((i) => i.date.slice(0, 7))].filter((k) => k >= HISTORY_START).sort()[0];
  const start = firstMonth ?? HISTORY_START;
  const keys = monthKeys(start, now);
  const spent = expensesByMonth(expenses);
  const expensesFrom = expenses.length ? expenses.reduce((min, e) => (e.month < min ? e.month : min), expenses[0].month) : null;
  // client → mois → { récurrent, prestations, dont mise en place / formation }
  const acc = new Map<string, { clientId: number | string | null; name: string; byMonth: Map<string, { r: number; s: number; f: number }> }>();
  const add = (id: string, clientId: number | string | null, name: string, month: string, r: number, s: number, f = 0) => {
    const c = acc.get(id) ?? { clientId, name, byMonth: new Map() };
    const m = c.byMonth.get(month) ?? { r: 0, s: 0, f: 0 };
    m.r += r;
    m.s += s;
    m.f += f;
    c.byMonth.set(month, m);
    acc.set(id, c);
  };

  for (const i of legacy) {
    if (i.month > AXONAUT_LAST_MONTH || i.month < start) continue;
    add(i.client != null ? String(i.client) : `nom:${i.clientName}`, i.client, i.clientName, i.month, i.recurringHT, i.servicesHT, i.setupHT ?? 0);
  }
  for (const i of pennylane) {
    const month = i.date.slice(0, 7);
    if (month <= AXONAUT_LAST_MONTH) continue;
    // Un tiers par mois pour une trimestrielle ; le dernier mois prend l'arrondi.
    const n = Math.max(1, Math.round(i.months ?? 1));
    const share = round2(i.amountHT / n);
    for (let j = 0; j < n; j++) add(String(i.client), i.client, i.clientName, shiftMonth(month, j), j === n - 1 ? round2(i.amountHT - share * (n - 1)) : share, 0);
  }

  const months: HistoryMonth[] = [];
  let prev = new Map<string, number>();
  for (const k of keys) {
    const cur = new Map<string, number>();
    let recurring = 0;
    let services = 0;
    let setup = 0;
    for (const [id, c] of acc) {
      const m = c.byMonth.get(k);
      if (!m) continue;
      recurring += m.r;
      services += m.s;
      setup += m.f;
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
    const known = expensesFrom != null && k >= expensesFrom;
    const spentK = spent.get(k);
    const total = round2(recurring + services);
    months.push({
      month: keyToIso(k),
      key: k,
      source: k <= AXONAUT_LAST_MONTH ? "axonaut" : "pennylane",
      recurring: round2(recurring),
      services: round2(services),
      setup: round2(setup),
      dev: round2(services - setup),
      total,
      expenses: known ? (spentK?.expenses ?? 0) : null,
      taxes: known ? (spentK?.taxes ?? 0) : null,
      profit: known ? round2(total - (spentK?.expenses ?? 0)) : null,
      byPoste: spentK?.byPoste ?? {},
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

  const posteTotals = new Map<string, number>();
  for (const m of months) for (const [p, v] of Object.entries(m.byPoste)) posteTotals.set(p, (posteTotals.get(p) ?? 0) + v);
  const postes = [...posteTotals].sort((a, b) => b[1] - a[1]).map(([p]) => p);

  return { start, months, expensesFrom, postes, clients, years };
}

/* ─── Vues : par mois, trimestre, semestre, année — et comparaison ─────────
   Comme les outils d'analyse (Stripe, ChartMogul, Google Analytics) : on
   choisit une maille, chaque période en est une colonne ; on la compare à la
   précédente, à la même un an avant ou à une plage choisie. On analyse les
   mois d'un début à une fin ; la vue découpe cette plage en colonnes. */

export const HISTORY_VIEWS = [
  { value: "mois", label: "Mois", months: 1 },
  { value: "trimestre", label: "Trimestre", months: 3 },
  { value: "semestre", label: "Semestre", months: 6 },
  { value: "annee", label: "Année", months: 12 },
] as const;
export type HistoryView = (typeof HISTORY_VIEWS)[number]["value"];

export const HISTORY_COMPARES = [
  { value: "prec", label: "Période précédente" },
  { value: "n1", label: "Un an avant" },
  { value: "perso", label: "Période personnalisée" },
  { value: "aucune", label: "Aucune comparaison" },
] as const;
export type HistoryCompare = (typeof HISTORY_COMPARES)[number]["value"];

/** Ce que montrent la courbe et le tableau des périodes. */
export const HISTORY_MEASURES = [
  { value: "tout", label: "Tout" },
  { value: "licences", label: "Licences (mensualités)" },
  { value: "formation", label: "Mise en place / formation" },
  { value: "developpement", label: "Développements" },
  { value: "depenses", label: "Dépenses" },
  { value: "benefice", label: "Bénéfice (avant impôts)" },
] as const;
export type HistoryMeasure = (typeof HISTORY_MEASURES)[number]["value"];

/** « AAAA-MM » décalé de `n` mois. */
export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const monthLong = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" });

const viewMonths = (view: HistoryView) => HISTORY_VIEWS.find((v) => v.value === view)!.months;

/** Le 1er mois de la période (de la vue) qui contient `key` : c'est son identifiant. */
export function bucketStart(key: string, view: HistoryView): string {
  const [y, m] = key.split("-").map(Number);
  const len = viewMonths(view);
  return `${y}-${String(Math.floor((m - 1) / len) * len + 1).padStart(2, "0")}`;
}

/** « oct. 2026 », « T3 2026 », « S2 2026 », « 2026 ». */
export function bucketLabel(start: string, view: HistoryView): string {
  const [y, m] = start.split("-").map(Number);
  if (view === "mois") return monthLong(start);
  if (view === "trimestre") return `T${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (view === "semestre") return `S${m <= 6 ? 1 : 2} ${y}`;
  return String(y);
}

export type PeriodSummary = {
  label: string;
  keys: string[];
  /** Mois couverts par l'historique (rien avant la première facture). */
  covered: number;
  recurring: number;
  services: number;
  setup: number;
  dev: number;
  total: number;
  avgMonthly: number;
  /** Licences du dernier mois : le récurrent avec lequel la période se termine. */
  endRecurring: number;
  /** Clients facturés en licences au moins un mois. */
  clients: number;
  /** Mois dont on connaît les dépenses ; les trois montants suivants portent sur eux seuls (null : aucun). */
  expenseMonths: number;
  expenses: number | null;
  taxes: number | null;
  profit: number | null;
  byPoste: Record<string, number>;
  /** Arrivées et départs mois après mois (un client parti puis revenu compte dans les deux). */
  gained: string[];
  lost: string[];
};

function summarize(h: RevenueHistory, keys: string[], label: string): PeriodSummary {
  const inHistory = new Map(h.months.map((m) => [m.key, m]));
  const ms = keys.map((k) => inHistory.get(k)).filter((m): m is HistoryMonth => m != null);
  const recurring = round2(ms.reduce((s, m) => s + m.recurring, 0));
  const services = round2(ms.reduce((s, m) => s + m.services, 0));
  const setup = round2(ms.reduce((s, m) => s + m.setup, 0));
  const spentMs = ms.filter((m) => m.expenses != null);
  const byPoste: Record<string, number> = {};
  for (const m of spentMs) for (const [p, v] of Object.entries(m.byPoste)) byPoste[p] = round2((byPoste[p] ?? 0) + v);
  const sumOf = (pick: (m: HistoryMonth) => number | null) => (spentMs.length ? round2(spentMs.reduce((s, m) => s + (pick(m) ?? 0), 0)) : null);
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
    label,
    keys,
    covered: ms.length,
    recurring,
    services,
    setup,
    dev: round2(services - setup),
    total: round2(recurring + services),
    avgMonthly: ms.length ? round2((recurring + services) / ms.length) : 0,
    endRecurring: inHistory.get(keys.at(-1)!)?.recurring ?? 0,
    expenseMonths: spentMs.length,
    expenses: sumOf((m) => m.expenses),
    taxes: sumOf((m) => m.taxes),
    profit: sumOf((m) => m.profit),
    byPoste,
    clients: h.clients.filter((c) => keys.some((k) => has(c, k))).length,
    gained: [...new Set(gained)],
    lost: [...new Set(lost)],
  };
}

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

const sumOver = (by: Record<string, number>, keys: string[]) => round2(keys.reduce((s, k) => s + (by[k] ?? 0), 0));

function compareClients(h: RevenueHistory, a: PeriodSummary, b: PeriodSummary | null): ClientComparison[] {
  return h.clients
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
}

/** Une colonne : la période de la vue (bornée par la plage choisie) et sa comparaison. */
export type HistoryBucket = {
  id: string;
  label: string;
  summary: PeriodSummary;
  compare: PeriodSummary | null;
  /** Le montant affiché (selon `measure`), le sien et celui de son vis-à-vis. */
  value: number | null;
  compareValue: number | null;
  /** Son évolution face au vis-à-vis (null : rien de comparable). */
  pct: number | null;
};

/** Le montant d'une période pour ce qu'on affiche (null : dépenses inconnues sur cette période). */
export const measureOf = (p: PeriodSummary, m: HistoryMeasure): number | null => {
  if (m === "depenses" || m === "benefice") return p.expenseMonths === p.covered ? (m === "depenses" ? p.expenses : p.profit) : null;
  return m === "licences" ? p.recurring : m === "formation" ? p.setup : m === "developpement" ? p.dev : p.total;
};

export type HistoryAnalysis = {
  view: HistoryView;
  measure: HistoryMeasure;
  compareMode: HistoryCompare;
  start: string;
  end: string;
  /** La comparaison : précédente, un an avant, ou la plage choisie. */
  bStart: string | null;
  bEnd: string | null;
  a: PeriodSummary;
  b: PeriodSummary | null;
  buckets: HistoryBucket[];
  clients: ClientComparison[];
  /**
   * Une courbe par année, mois par mois (janvier → décembre), sur tout
   * l'historique quelle que soit la plage : deux années l'une sur l'autre.
   * `y2025`… vaut null après le dernier mois facturé, ou quand le montant
   * n'est pas connu (dépenses avant les relevés).
   */
  yearLines: { years: string[]; rows: ({ label: string; month: number } & Record<string, number | string | null>)[] };
  /** Les mois qu'on peut choisir (première facture → dernier mois facturé), du plus récent au plus ancien. */
  monthOptions: { value: string; label: string }[];
  /** Les comparaisons possibles, avec la plage qu'elles désignent. */
  compareOptions: { value: HistoryCompare; label: string }[];
};

/** Nombre de mois de `from` à `to` inclus. */
const span = (from: string, to: string) => {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};

const range = (from: string, to: string) => Array.from({ length: Math.max(0, span(from, to)) }, (_, i) => shiftMonth(from, i));

/** « oct. 2026 », « août – oct. 2026 », « nov. 2025 – oct. 2026 ». */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return monthLong(from);
  const short = (k: string, year: boolean) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  return `${short(from, from.slice(0, 4) !== to.slice(0, 4))} – ${short(to, true)}`;
}

/**
 * Lit le choix de l'écran dans l'URL et calcule tout :
 *  - `hv` la vue (mois, trimestre, semestre, année) : la maille des colonnes ;
 *  - `hm` ce qu'on montre : tout, les licences, la mise en place / formation, les développements ;
 *  - `hd` / `hf` les mois de début et de fin analysés ;
 *  - `hc` la comparaison : « prec » (même durée juste avant), « n1 » (un an
 *    avant), « perso » (`hcd` / `hcf`), « aucune ».
 * Par défaut : les 12 derniers mois facturés par mois, tout l'historique dans
 * les autres vues ; chaque colonne face à celle d'avant.
 * Les tuiles comparent la plage entière à la plage d'avant de même durée (ou
 * un an avant, ou choisie) ; les colonnes, chacune à son vis-à-vis.
 */
export function analyzeHistory(h: RevenueHistory, sp: Record<string, string | string[] | undefined> | undefined): HistoryAnalysis {
  const one = (k: string) => {
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const view: HistoryView = HISTORY_VIEWS.find((v) => v.value === one("hv"))?.value ?? "mois";
  const measure: HistoryMeasure = HISTORY_MEASURES.find((m) => m.value === one("hm"))?.value ?? "tout";
  // Par défaut, face aux mêmes mois de l'an d'avant : la comparaison que tout le monde lit sans explication.
  const compareMode: HistoryCompare = HISTORY_COMPARES.find((c) => c.value === one("hc"))?.value ?? "n1";

  // Les données s'arrêtent au dernier mois facturé : le mois en cours ne l'est pas les premiers jours.
  const dataEnd = [...h.months].reverse().find((m) => m.total > 0)?.key ?? h.months.at(-1)!.key;
  const months = h.months.map((m) => m.key).filter((k) => k <= dataEnd);
  const valid = (k: string | undefined) => (k && months.includes(k) ? k : null);
  // Sans choix : l'année en cours (janvier → dernier mois facturé) ; la vue « Année », tout l'historique.
  let start = valid(one("hd")) ?? (view === "annee" ? months[0] : (valid(`${dataEnd.slice(0, 4)}-01`) ?? months[0]));
  let end = valid(one("hf")) ?? dataEnd;
  if (start > end) [start, end] = [end, start];
  const len = span(start, end);

  let bStart: string | null = null;
  let bEnd: string | null = null;
  if (compareMode === "prec") [bStart, bEnd] = [shiftMonth(start, -len), shiftMonth(start, -1)];
  else if (compareMode === "n1") [bStart, bEnd] = [shiftMonth(start, -12), shiftMonth(end, -12)];
  else if (compareMode === "perso") {
    bStart = valid(one("hcd")) ?? shiftMonth(start, -len);
    bEnd = valid(one("hcf")) ?? shiftMonth(start, -1);
    if (bStart > bEnd) [bStart, bEnd] = [bEnd, bStart];
    // Une plage choisie reste dans ce qu'on peut choisir.
    if (bStart < h.start) bStart = h.start;
  }
  // Une comparaison entièrement avant la première facture n'apprend rien.
  if (bEnd != null && bEnd < h.start) [bStart, bEnd] = [null, null];

  const aKeys = range(start, end);
  const a = summarize(h, aKeys, rangeLabel(start, end));
  const b = bStart && bEnd ? summarize(h, range(bStart, bEnd), rangeLabel(bStart, bEnd)) : null;
  const offset = bStart ? span(start, bStart) - 1 : 0;
  const pctOf = (x: PeriodSummary, y: PeriodSummary | null) => {
    if (y == null || y.covered !== x.covered) return null;
    const [vx, vy] = [measureOf(x, measure), measureOf(y, measure)];
    return vx != null && vy != null && vy > 0 ? round2(((vx - vy) / vy) * 100) : null;
  };

  const len1 = viewMonths(view);
  const starts = [...new Set(aKeys.map((k) => bucketStart(k, view)))];
  const buckets: HistoryBucket[] = starts.map((bs) => {
    const own = aKeys.filter((k) => bucketStart(k, view) === bs);
    // Une colonne coupée par la plage le dit : « T1 2026 (2 mois) ».
    const label = bucketLabel(bs, view) + (own.length < len1 ? ` (${own.length} mois)` : "");
    const summary = summarize(h, own, label);
    // Chaque colonne face à son vis-à-vis, à mois égaux (une colonne entamée se compare à date) :
    // la colonne d'avant (« prec » : 2026 face à 2025, T3 face à T2), la même un an avant,
    // ou, pour une plage choisie, le mois de même rang.
    let cKeys: string[] = [];
    if (compareMode === "prec") cKeys = own.map((k) => shiftMonth(k, -len1));
    else if (compareMode === "n1") cKeys = own.map((k) => shiftMonth(k, -12));
    else if (compareMode === "perso" && bEnd) cKeys = own.map((k) => shiftMonth(k, offset)).filter((k) => k <= bEnd!);
    let compare: PeriodSummary | null = null;
    if (cKeys.length && cKeys.some((k) => k >= h.start)) {
      // Un vis-à-vis qui tombe pile sur une période de la vue en prend le nom : « T1 2025 ».
      const whole = cKeys.length === len1 && bucketStart(cKeys[0], view) === cKeys[0];
      compare = summarize(h, cKeys, whole ? bucketLabel(cKeys[0], view) : rangeLabel(cKeys[0], cKeys.at(-1)!));
    }
    return { id: bs, label, summary, compare, value: measureOf(summary, measure), compareValue: compare ? measureOf(compare, measure) : null, pct: pctOf(summary, compare) };
  });

  const years = [...new Set(months.map((k) => k.slice(0, 4)))];
  const byKey = new Map(h.months.map((m) => [m.key, m]));
  const monthValue = (k: string) => {
    const m = byKey.get(k);
    if (!m || k > dataEnd) return null;
    if (measure === "depenses") return m.expenses;
    if (measure === "benefice") return m.profit;
    return measure === "licences" ? m.recurring : measure === "formation" ? m.setup : measure === "developpement" ? m.dev : m.total;
  };
  const yearLines = {
    years,
    rows: Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      return {
        label: new Date(`2025-${mm}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }),
        month: i + 1,
        ...Object.fromEntries(years.map((y) => [`y${y}`, monthValue(`${y}-${mm}`)])),
      };
    }),
  };

  return {
    view,
    measure,
    yearLines,
    compareMode,
    start,
    end,
    bStart,
    bEnd,
    a,
    b,
    buckets,
    clients: compareClients(h, a, b),
    monthOptions: [...months].reverse().map((k) => ({ value: k, label: monthLong(k) })),
    compareOptions: HISTORY_COMPARES.map((c) => ({ value: c.value, label: c.label })),
  };
}

/* ─── Seuil d'équilibre : rentrées et dépenses moyennes, sur 12 mois glissants ─
   Un mois isolé ment (une grosse facture, un mois creux) : la moyenne des 12
   derniers mois dit ce que TIM gagne et dépense « en régime ». Tant qu'on ne
   connaît pas 12 mois de dépenses, la moyenne porte sur ceux qu'on a. */

export type RollingPoint = {
  key: string;
  label: string;
  /** Mois pris dans la moyenne (12 au plus). */
  window: number;
  revenue: number;
  expenses: number;
  /** Sans les dépenses ponctuelles (développement sous-traité). */
  expensesCore: number;
};

export type BreakEven = {
  /** Le mois de fin et la fenêtre de la moyenne. */
  end: string;
  window: number;
  from: string;
  revenue: number;
  expenses: number;
  expensesCore: number;
  /** Rentrées moins dépenses, par mois (négatif : il manque). */
  gap: number;
  gapCore: number;
  /** Licences moyennes d'un client facturé au dernier mois. */
  basket: number | null;
  /** Clients à ajouter, au panier moyen, pour couvrir les dépenses (0 si déjà couvert). */
  clientsNeeded: number | null;
  clientsNeededCore: number | null;
  rolling: RollingPoint[];
};

export function breakEven(h: RevenueHistory, end: string, oneOffPostes: string[], windowMax = 12): BreakEven | null {
  const known = h.months.filter((m) => m.expenses != null && m.key <= end);
  if (!known.length) return null;
  const core = (m: HistoryMonth) => (m.expenses ?? 0) - oneOffPostes.reduce((s, p) => s + (m.byPoste[p] ?? 0), 0);
  const avg = (ms: HistoryMonth[], pick: (m: HistoryMonth) => number) => round2(ms.reduce((s, m) => s + pick(m), 0) / ms.length);
  const rolling: RollingPoint[] = known.map((m, i) => {
    const win = known.slice(Math.max(0, i - windowMax + 1), i + 1);
    return { key: m.key, label: monthLong(m.key), window: win.length, revenue: avg(win, (x) => x.total), expenses: avg(win, (x) => x.expenses ?? 0), expensesCore: avg(win, core) };
  });
  const last = rolling.at(-1)!;
  const endMonth = known.at(-1)!.key;
  const payers = h.clients.filter((c) => (c.recurringByMonth[endMonth] ?? 0) > 0.005);
  const basket = payers.length ? round2(payers.reduce((s, c) => s + c.recurringByMonth[endMonth], 0) / payers.length) : null;
  const need = (gap: number) => (basket ? Math.max(0, Math.ceil(-gap / basket)) : null);
  const gap = round2(last.revenue - last.expenses);
  const gapCore = round2(last.revenue - last.expensesCore);
  return {
    end: endMonth,
    window: last.window,
    from: known[Math.max(0, known.length - windowMax)].key,
    revenue: last.revenue,
    expenses: last.expenses,
    expensesCore: last.expensesCore,
    gap,
    gapCore,
    basket,
    clientsNeeded: need(gap),
    clientsNeededCore: need(gapCore),
    rolling,
  };
}

/* ─── Depuis le début : le CA cumulé, et ce que chaque client a rapporté ───
   Toute l'histoire de TIM, sans plage : la somme qui monte mois après mois, et
   par client son total, son total par année, et s'il est encore là. */

export type LifetimeClient = {
  id: string;
  clientId: number | string | null;
  name: string;
  firstMonth: string;
  lastMonth: string;
  /** Facturé en licences au dernier mois facturé (ou celui d'avant) ; sinon perdu. */
  active: boolean;
  monthsBilled: number;
  total: number;
  byYear: Record<string, number>;
  /** Licences par mois au dernier mois facturé (0 s'il est perdu). */
  currentRecurring: number;
};

export type Lifetime = {
  start: string;
  end: string;
  total: number;
  years: string[];
  /** CA cumulé, mois après mois (1er du mois en ISO, pour les graphiques). */
  cumulative: { month: string; key: string; cumul: number }[];
  clients: LifetimeClient[];
};

export function lifetime(h: RevenueHistory, end: string): Lifetime {
  const months = h.months.filter((m) => m.key <= end);
  let running = 0;
  const cumulative = months.map((m) => {
    running = round2(running + m.total);
    return { month: m.month, key: m.key, cumul: running };
  });
  // Un client facturé le dernier mois, ou celui d'avant (une facture en retard), est encore là.
  const recent = shiftMonth(end, -1);
  const clients = h.clients
    .map((c): LifetimeClient => {
      const keys = Object.keys(c.byMonth).filter((k) => k <= end);
      const lastRecurringMonth = Object.keys(c.recurringByMonth)
        .filter((k) => k <= end && c.recurringByMonth[k] > 0.005)
        .sort()
        .at(-1);
      const active = lastRecurringMonth != null && lastRecurringMonth >= recent;
      return {
        id: c.id,
        clientId: c.clientId,
        name: c.name,
        firstMonth: c.firstMonth,
        lastMonth: keys.sort().at(-1) ?? c.lastMonth,
        active,
        monthsBilled: c.monthsBilled,
        total: round2(keys.reduce((s, k) => s + c.byMonth[k], 0)),
        byYear: c.byYear,
        currentRecurring: active ? round2(c.recurringByMonth[end] ?? c.recurringByMonth[recent] ?? 0) : 0,
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  return { start: h.start, end, total: running, years: h.years.map((y) => y.year), cumulative, clients };
}
