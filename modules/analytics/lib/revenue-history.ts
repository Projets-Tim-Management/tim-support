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
    for (const [k, m] of billed) {
      byYear[k.slice(0, 4)] = round2((byYear[k.slice(0, 4)] ?? 0) + m.r + m.s);
      byMonth[k] = round2(m.r + m.s);
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
