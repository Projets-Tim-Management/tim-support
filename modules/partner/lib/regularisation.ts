import { dayKey, frDate } from "@/core/lib/dates";

import { round2 } from "./format";
import { effectiveUnitPrice, licenceLinesOf, PROFILS, type ProfilKey } from "./pricing";

/**
 * La régularisation des licences d'un client facturé sur PLUSIEURS mois
 * (trimestre, semestre, année), payé d'avance en début de période.
 *
 * La facture de début de trimestre couvre les licences de ce jour-là. Une
 * licence ajoutée ensuite sert pendant des mois déjà facturés sans elle :
 * c'est ce complément qu'on régularise, sur la facture SUIVANTE. Les règles
 * (Charlie, 05/11/2026) :
 *   - tout mois commencé est dû : une licence présente un seul jour d'un mois
 *     de la période compte pour ce mois entier ;
 *   - pas d'avoir : une licence retirée en cours de période reste due jusqu'à
 *     la fin de la période déjà payée, elle disparaît de la facture suivante ;
 *   - les « mois » sont ceux de la PÉRIODE (de date de facture en date de
 *     facture), pas les mois du calendrier.
 *
 * Mois par mois de la période, on prend le plus grand nombre de licences
 * utilisées ce mois-là, moins ce qui a été facturé au départ ; jamais moins
 * que zéro. Les mois à venir de la période comptent avec les licences
 * d'aujourd'hui : le montant est ce qui sera dû si rien ne bouge d'ici là.
 *
 * Les mouvements viennent de la fiche (champ « Mouvements de licences »),
 * notés à chaque enregistrement qui change une quantité, à la date du jour
 * — corrigeable si le changement a pris effet un autre jour.
 *
 * Pur : entrées → régularisation, sans base ni Pennylane.
 */

/** Un changement de quantité d'une licence, à plat : l'unité du calcul. */
export type LicenceMove = {
  /** Date d'effet (ISO). */
  at: string;
  profile: string;
  before: number;
  after: number;
  /** Prix unitaire effectif (remise déduite) au moment du changement. */
  price: number | null;
};

/**
 * Une licence d'un mouvement, telle qu'on la saisit : vide tant qu'elle
 * n'est pas remplie (une ligne neuve du tableau).
 */
export type MoveLine = { profile: string; before: number | null; after: number | null; price: number | null };

/**
 * Un mouvement tel qu'il est enregistré sur la fiche (champ JSON
 * `licenceMoves`) : UN JOUR, et les licences qui ont bougé ce jour-là.
 */
export type LicenceMoveDay = { at: string; lines: MoveLine[] };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Les mouvements à plat (un par licence), pour le calcul. Une ligne
 * incomplète (licence, avant ou après manquant) est écartée : compter un
 * « avant » vide pour 0 inventerait une régularisation.
 */
export const flattenMoves = (days: unknown): LicenceMove[] =>
  (Array.isArray(days) ? (days as Partial<LicenceMoveDay>[]) : []).flatMap((d) =>
    typeof d?.at === "string" && Array.isArray(d.lines)
      ? d.lines
          .filter((l) => l && typeof l.profile === "string" && l.profile && isNum(l.before) && isNum(l.after))
          .map((l) => ({ at: d.at as string, profile: l.profile, before: l.before as number, after: l.after as number, price: isNum(l.price) ? l.price : null }))
      : [],
  );

/**
 * Les mouvements après un enregistrement : les licences dont la quantité
 * change rejoignent le mouvement DU JOUR (créé s'il n'existe pas) — un
 * mouvement par jour. Une licence déjà présente ce jour-là garde son
 * « avant » d'origine et prend le nouvel « après » ; revenue à son point de
 * départ, elle sort du mouvement (et un mouvement vide disparaît). Les 200
 * derniers jours suffisent.
 */
export function nextLicenceMoves(
  prev: LicenceMoveDay[],
  before: Record<string, number | null | undefined>,
  after: Record<string, number | null | undefined>,
  now: Date,
): LicenceMoveDay[] {
  const old = new Map(licenceLinesOf(before).map((l) => [l.key, l.qty]));
  const changed = licenceLinesOf(after).filter((l) => (old.get(l.key) ?? 0) !== l.qty);
  if (!changed.length) return prev;
  const today = dayKey(now);
  // Une valeur abîmée (JSON saisi ailleurs) ne doit pas faire échouer l'enregistrement de la fiche.
  const days = prev.filter((d) => d && typeof d.at === "string" && Array.isArray(d.lines)).map((d) => ({ ...d, lines: [...d.lines] }));
  let day = days.find((d) => d.at && dayKey(d.at) === today);
  if (!day) {
    day = { at: now.toISOString(), lines: [] };
    days.push(day);
  }
  for (const l of changed) {
    const price = effectiveUnitPrice(l);
    const i = day.lines.findIndex((x) => x.profile === l.key);
    if (i === -1) day.lines.push({ profile: l.key, before: old.get(l.key) ?? 0, after: l.qty, price });
    else if (day.lines[i].before === l.qty) day.lines.splice(i, 1);
    else day.lines[i] = { ...day.lines[i], after: l.qty, price };
  }
  return days.filter((d) => d.lines.length > 0).slice(-200);
}

export type RegulLine = {
  profile: ProfilKey;
  label: string;
  /** Licences en plus, mois par mois de la période (0 quand rien). */
  perMonth: number[];
  /** Somme des licences en plus sur la période : la quantité à facturer. */
  licenceMonths: number;
  unitPrice: number;
  amountHT: number;
};

export type RegulState =
  /** Période en cours : à ajouter sur la prochaine facture. */
  | "a-facturer"
  /** Période en cours : déjà posée sur l'abonnement Pennylane (ligne « Régularisation »). */
  | "prevue"
  /** Période écoulée : retrouvée sur une facture. */
  | "facturee"
  /** Période écoulée : aucune facture ne la porte. */
  | "manquante";

export type Regularisation = {
  /** Début de la période (date de la facture d'avance), ISO jour. */
  periodStart: string;
  /** Dernier jour couvert par la période, ISO jour. */
  lastDay: string;
  /** Fin de la période = date de la facture suivante, ISO jour. */
  periodEnd: string;
  months: number;
  lines: RegulLine[];
  amountHT: number;
  state: RegulState;
  /** Les libellés de lignes à recopier dans Pennylane. */
  pennylaneLines: { label: string; qty: number; unitPrice: number }[];
};

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `day` + k mois, même quantième (borné à la fin du mois), en UTC. */
export function addMonths(day: string, k: number): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + k;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

const msOf = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
const frMonth = (day: string) => new Date(msOf(day)).toLocaleDateString("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Le complément dû pour UNE période [periodStart, periodStart + months),
 * vu à la date `now` (les mois pas encore commencés comptent avec les
 * licences actuelles).
 */
export function regulLines(args: {
  moves: LicenceMove[];
  licences: Record<string, number | null | undefined> | null | undefined;
  periodStart: string;
  months: number;
  now: Date;
}): RegulLine[] {
  const startMs = msOf(args.periodStart);
  const nowMs = args.now.getTime();
  const current = new Map(licenceLinesOf(args.licences).map((l) => [l.key, { qty: l.qty, price: effectiveUnitPrice(l) }]));
  const slices = Array.from({ length: args.months }, (_, i) => ({
    from: msOf(addMonths(args.periodStart, i)),
    to: msOf(addMonths(args.periodStart, i + 1)),
  }));

  const out: RegulLine[] = [];
  for (const p of PROFILS) {
    const moves = args.moves
      .filter((m) => m.profile === p.key && Number.isFinite(Date.parse(m.at)))
      .map((m) => ({ ...m, ms: Date.parse(m.at) }))
      .filter((m) => m.ms <= nowMs)
      .sort((a, b) => a.ms - b.ms);
    // Rien n'a bougé pendant ou après le début de la période : rien à régulariser.
    if (!moves.some((m) => m.ms >= startMs)) continue;
    const cur = current.get(p.key);
    const nowQty = cur?.qty ?? 0;
    const latest = [...moves].reverse();
    /** Licences en service juste avant l'instant `t` (un mouvement du jour même compte après). */
    const qtyBefore = (t: number) => latest.find((m) => m.ms < t)?.after ?? moves[0].before;
    const billed = qtyBefore(startMs);
    const perMonth = slices.map((s) => {
      // Un mois pas encore commencé : les licences d'aujourd'hui.
      if (s.from > nowMs) return Math.max(0, nowQty - billed);
      const inside = moves.filter((m) => m.ms >= s.from && m.ms < s.to).map((m) => m.after);
      return Math.max(0, Math.max(qtyBefore(s.from), ...inside) - billed);
    });
    const licenceMonths = perMonth.reduce((a, n) => a + n, 0);
    if (licenceMonths <= 0) continue;
    // Le prix d'aujourd'hui tant que la licence est sur la fiche ; retirée, celui de son dernier mouvement.
    const unitPrice = round2(cur?.qty ? cur.price : (latest.find((m) => m.price != null && m.price > 0)?.price ?? cur?.price ?? 0));
    out.push({ profile: p.key, label: p.label, perMonth, licenceMonths, unitPrice, amountHT: round2(licenceMonths * unitPrice) });
  }
  return out;
}

/** Ce qu'on recopie dans Pennylane : une ligne par profil, le mot « Régularisation » en tête (c'est lui qu'on retrouve). */
const pennylaneLinesOf = (lines: RegulLine[], periodStart: string, lastDay: string) =>
  lines.map((l) => ({
    label: `Régularisation ${l.label} du ${frDate(periodStart)} au ${frDate(lastDay)}`,
    qty: l.licenceMonths,
    unitPrice: l.unitPrice,
  }));

/** « nov. 2026 +2 · déc. 2026 +2 » : le détail lisible d'une ligne. */
export const perMonthText = (line: RegulLine, periodStart: string): string =>
  line.perMonth
    .map((n, i) => (n ? `${frMonth(addMonths(periodStart, i))} +${n}` : null))
    .filter(Boolean)
    .join(" · ");

/** Une facture telle que le contrôle la connaît. */
export type RegulInvoice = { date: string; label: string; amountHT: number; fromSubscription: boolean; cancelled?: boolean };

const REGUL_RE = /r[ée]gul/i;
export const isRegulLabel = (label?: string | null) => REGUL_RE.test(label ?? "");

/**
 * Les régularisations d'un client : celle de la période EN COURS (à mettre
 * sur la prochaine facture) et celle de la période ÉCOULÉE (qui devait
 * figurer sur la dernière facture : l'a-t-elle été ?).
 *
 * La période se lit sur l'abonnement Pennylane : `nextOccurrence` est la
 * fin de la période en cours, `months` sa longueur.
 *
 * Une période écoulée est « facturée » si, autour de la facture qui
 * l'ouvrait (de 5 jours avant à 45 jours après) :
 *   - une facture porte « Régularisation » dans son libellé, ou
 *   - une facture hors abonnement vaut le montant (à 1 € près), ou
 *   - la facture de l'abonnement dépasse son montant habituel d'au moins
 *     le montant (la ligne a été ajoutée dessus).
 */
export function clientRegularisations(args: {
  moves: LicenceMove[];
  licences: Record<string, number | null | undefined> | null | undefined;
  nextOccurrence: string | null;
  months: number | null;
  now: Date;
  invoices: RegulInvoice[];
  /** Montant HT habituel d'une facture de l'abonnement. */
  subscriptionHT: number;
  /** L'abonnement porte déjà une ligne « Régularisation » (montant HT), s'il y en a une. */
  plannedHT: number | null;
  /** Début de l'abonnement : pas de période écoulée à contrôler avant lui. */
  subscriptionStart?: string | null;
}): { current: Regularisation | null; previous: Regularisation | null } {
  const months = args.months ?? 1;
  if (months <= 1 || !args.nextOccurrence || !args.moves.length) return { current: null, previous: null };
  const end = args.nextOccurrence.slice(0, 10);
  const start = addMonths(end, -months);
  if (msOf(start) > args.now.getTime()) return { current: null, previous: null };

  const build = (periodStart: string, now: Date, state: (amount: number) => RegulState): Regularisation | null => {
    const lines = regulLines({ moves: args.moves, licences: args.licences, periodStart, months, now });
    const amountHT = round2(lines.reduce((a, l) => a + l.amountHT, 0));
    if (amountHT <= 0) return null;
    const periodEnd = addMonths(periodStart, months);
    const lastDay = iso(msOf(periodEnd) - DAY);
    return { periodStart, lastDay, periodEnd, months, lines, amountHT, state: state(amountHT), pennylaneLines: pennylaneLinesOf(lines, periodStart, lastDay) };
  };

  const current = build(start, args.now, (amount) =>
    args.plannedHT != null && args.plannedHT >= amount - 1 ? "prevue" : "a-facturer",
  );

  const prevStart = addMonths(start, -months);
  const prevBilled = !args.subscriptionStart || args.subscriptionStart.slice(0, 10) <= prevStart;
  if (!prevBilled) return { current, previous: null };
  // Fin de la période écoulée : la facture du jour `start`, vue « à la fin » (tous ses mois passés).
  const previous = build(prevStart, new Date(msOf(start) - 1), (amount) => {
    const from = msOf(start) - 5 * DAY;
    const to = msOf(start) + 45 * DAY;
    const around = args.invoices.filter((i) => !i.cancelled && Date.parse(i.date) >= from && Date.parse(i.date) <= to);
    const found = around.some(
      (i) =>
        isRegulLabel(i.label) ||
        (!i.fromSubscription && Math.abs(i.amountHT - amount) <= 1) ||
        (i.fromSubscription && args.subscriptionHT > 0 && i.amountHT - args.subscriptionHT >= amount - 1),
    );
    return found ? "facturee" : "manquante";
  });

  return { current, previous };
}

/**
 * Préremplissage d'une licence ajoutée À LA MAIN dans un mouvement (un
 * changement passé, d'avant le suivi automatique), avec ce que la fiche
 * sait déjà :
 *   - Avant : la licence au mouvement précédent, sinon l'historique mensuel
 *     du mois d'avant, sinon la quantité actuelle ;
 *   - Après : son « avant » au mouvement suivant, sinon l'historique du mois
 *     du changement, sinon la quantité actuelle ;
 *   - Prix : le prix effectif actuel (remise déduite).
 */
export function suggestMoveLine(args: {
  days: LicenceMoveDay[];
  /** Le mouvement (jour) où l'on ajoute la licence : exclu de la recherche. */
  dayIndex: number;
  profile: string;
  at: string;
  history: { at?: string | null; detail?: unknown }[];
  licences: Record<string, number | null | undefined> | null | undefined;
}): { before: number; after: number; price: number | null } {
  const t = Date.parse(args.at);
  const line = licenceLinesOf(args.licences).find((l) => l.key === args.profile);
  const current = line?.qty ?? 0;
  const others = args.days
    .flatMap((d, i) => (i === args.dayIndex ? [] : d.lines.filter((l) => l.profile === args.profile).map((l) => ({ ...l, ms: Date.parse(d.at) }))))
    .filter((m) => Number.isFinite(m.ms))
    .sort((a, b) => a.ms - b.ms);
  const prev = [...others].reverse().find((m) => m.ms <= t);
  const next = others.find((m) => m.ms > t);
  const month = args.at.slice(0, 7);
  const hist = args.history.filter((e) => e.at).sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));
  const qtyIn = (e?: (typeof hist)[number]) => {
    const d = Array.isArray(e?.detail) ? (e.detail as { key?: string; qty?: number }[]).find((x) => x.key === args.profile) : undefined;
    return d ? Number(d.qty ?? 0) : null;
  };
  const before = prev?.after ?? qtyIn([...hist].reverse().find((e) => e.at!.slice(0, 7) < month)) ?? current;
  const after = next?.before ?? qtyIn(hist.find((e) => e.at!.slice(0, 7) === month)) ?? current;
  return { before, after, price: line ? effectiveUnitPrice(line) : null };
}
