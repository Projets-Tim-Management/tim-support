import { billingPeriodMonths, monthsLabel, pennylaneMonths } from "./billing-period";
import { round2 } from "./format";
import { monthKey, monthStart } from "./month";
import type { PennylaneSnapshot, PlCustomer, PlInvoice, PlInvoiceLine, PlProduct, PlSubscriptionFull } from "./pennylane";
import { effectiveUnitPrice, licenceLinesOf, PROFILS, type ProfilKey } from "./pricing";

/**
 * Contrôle de facturation : ce que dit la fiche client du support (les
 * licences saisies à la main) face à ce que Pennylane facture réellement
 * (les lignes de l'abonnement).
 *
 * Aucune décision automatique ici : on CONSTATE, ligne par ligne, et on laisse
 * corriger d'un côté ou de l'autre. Le but est de ne rater ni un client jamais
 * facturé, ni une licence facturée en trop ou en moins, ni un prix qui a dérivé.
 *
 * Tout est pur (entrées → rapport) pour être testable sans réseau.
 */

/** Ce qu'il faut d'une fiche client du support pour la comparer. */
export type SupportClientFacts = {
  id: number | string;
  name: string;
  siren?: string | null;
  raisonSociale?: string | null;
  clientStatus?: string | null;
  paymentMethod?: string | null;
  paymentTerms?: string | null;
  /** Périodicité de facturation de la fiche (mensuelle à défaut). */
  billingPeriod?: string | null;
  licences?: Record<string, number | null | undefined> | null;
};

/** Référence produit Pennylane de chaque profil (catalogue TIM). */
const PENNYLANE_PRODUCT_REFS: Record<ProfilKey, string> = {
  admin: "LA-Tim",
  conducteur: "LCT-Tim",
  chefChantier: "LCC-Tim",
  chefEquipe: "LCE-Tim",
  compagnon: "LC-Tim",
};

/**
 * Filet si une référence manque : on reconnaît le profil au libellé. Les
 * libellés sont ceux du catalogue (« Licence TIM — Chef de chantier »).
 */
const LABEL_HINTS: Record<ProfilKey, RegExp> = {
  admin: /admin/i,
  conducteur: /conducteur/i,
  chefChantier: /chef\s*de\s*chantier/i,
  chefEquipe: /chef\s*d['’]\s*[ée]quipe/i,
  compagnon: /compagnon/i,
};

export type IssueCode =
  | "siren-mismatch"
  | "no-subscription"
  | "subscription-stopped"
  | "subscription-draft"
  | "not-active-but-billed"
  | "multiple-subscriptions"
  | "qty"
  | "price"
  | "duplicate-lines"
  | "extra-lines"
  | "payment-method"
  | "payment-terms"
  | "billing-period"
  | "uneven-months"
  | "late-payment"
  | "missing-invoice";

export type Severity = "error" | "warn";

export type Issue = { code: IssueCode; severity: Severity; label: string };

export type ProfileRow = {
  key: ProfilKey;
  label: string;
  supportQty: number;
  /** Prix unitaire de la fiche, remise de ligne DÉDUITE : ce qui doit être facturé. */
  supportPrice: number;
  /** Prix saisi avant remise, et la remise posée sur la ligne (0 si aucune). */
  supportListPrice: number;
  supportDiscountPct: number;
  supportDiscountAmount: number;
  /** Somme des quantités Pennylane pour ce profil (plusieurs lignes possibles). */
  plQty: number;
  /**
   * Le détail quand Pennylane a PLUSIEURS lignes pour ce profil — un groupe
   * facturé par entité (« Maçonnerie », « Échafaudage »). Vide sinon.
   */
  plLines: { qty: number; note: string }[];
  /** Prix unitaire Pennylane remise déduite — null sans ligne, `mixed` si les lignes divergent. */
  plPrice: number | null;
  /** Prix catalogue Pennylane avant remise (null sans ligne). */
  plListPrice: number | null;
  mixedPrices: boolean;
  qtyDiff: number;
  priceMismatch: boolean;
};

/** Une ligne d'abonnement qui n'est pas une licence (forfait, développement…). */
export type ExtraLine = { label: string; qty: number; unitPrice: number; amountHT: number };

export type Verdict = "ok" | "ecart" | "sans-abonnement" | "non-rapproche";

/** État de paiement d'une facture, tel qu'on le montre. */
export type PaymentState = "payee" | "partielle" | "retard" | "a-echoir" | "annulee" | "autre";

export type InvoiceSummary = {
  id: number;
  number: string;
  /** ISO jour. */
  date: string;
  deadline: string | null;
  amountTTC: number;
  amountHT: number;
  remaining: number;
  state: PaymentState;
  /** Jours de retard sur l'échéance (0 si à jour). */
  lateDays: number;
  url: string | null;
};

/** Un mois attendu de facturation, et ce qu'on y a trouvé. */
export type MonthCheck = {
  /** 1er du mois, ISO. */
  month: string;
  invoices: InvoiceSummary[];
  /** Rien d'émis alors qu'une facture était attendue ce mois-là. */
  missing: boolean;
};

export type ClientCheck = {
  client: {
    id: number | string;
    name: string;
    siren: string | null;
    clientStatus: string | null;
    paymentMethod: string | null;
    paymentTerms: string | null;
  };
  /** Comment la fiche a été reliée au client Pennylane. */
  match: "siren" | "name" | "none";
  pennylane: {
    customerId: number;
    customerName: string;
    regNo: string | null;
    subscriptionId: number | null;
    subscriptionLabel: string | null;
    status: string | null;
    start: string | null;
    nextOccurrence: string | null;
    paymentMethod: string | null;
    paymentConditions: string | null;
    /** Montant HT d'UNE facture (qui peut couvrir plusieurs mois). */
    amountHT: number;
    /** Mois couverts par une facture (null si la récurrence n'est pas mensuelle/annuelle). */
    months: number | null;
  } | null;
  rows: ProfileRow[];
  extraLines: ExtraLine[];
  /** Tout est PAR MOIS, des deux côtés — Pennylane ramené au mois si la facture en couvre plusieurs. */
  totals: { supportQty: number; supportHT: number; plQty: number; plHT: number };
  issues: Issue[];
  verdict: Verdict;
  /** Factures émises pour ce client, les plus récentes d'abord. */
  invoices: InvoiceSummary[];
  /** Les factures en retard de paiement (sous-ensemble de `invoices`). */
  latePayments: InvoiceSummary[];
  /** Mois par mois depuis le début de la facturation : facture(s) du mois ou manque. */
  months: MonthCheck[];
};

/** Un abonnement Pennylane dont le client n'existe pas (ou plus) dans le support. */
export type OrphanSubscription = {
  subscriptionId: number;
  customerId: number | null;
  customerName: string;
  regNo: string | null;
  status: string;
  amountHT: number;
  label: string | null;
};

export type BillingReport = {
  fetchedAt: string;
  checks: ClientCheck[];
  orphans: OrphanSubscription[];
  summary: {
    total: number;
    ok: number;
    ecart: number;
    sansAbonnement: number;
    nonRapproche: number;
    orphans: number;
    /** Factures en retard, tous clients confondus. */
    latePayments: number;
    lateAmount: number;
  };
};

/* ─── Normalisation ───────────────────────────────────────────────────────── */

export const normalizeSiren = (v?: string | null): string | null => {
  const digits = (v ?? "").replace(/\D/g, "");
  if (digits.length === 9) return digits;
  if (digits.length === 14) return digits.slice(0, 9); // un SIRET saisi à la place
  return digits.length ? digits : null;
};

/** Nom d'entreprise comparable : majuscules, sans accents, sans ponctuation ni forme juridique. */
export const normalizeName = (v?: string | null): string =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(SARL|SAS|SASU|SA|EURL|SCOP|GROUPE|STE|SOCIETE)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Prix dans un constat : « 17,1 € », sans zéros inutiles. */
const fmtPrice = (n: number) => `${String(round2(n)).replace(".", ",")} €`;

/** Statuts Pennylane qui facturent (ou vont facturer). */
const LIVE_STATUSES = new Set(["in_progress", "not_started", "pending"]);

const PL_STATUS_LABELS: Record<string, string> = {
  in_progress: "En cours",
  not_started: "À venir",
  pending: "En attente",
  draft: "Brouillon",
  stopped: "Arrêté",
  finished: "Terminé",
};

const PL_PAYMENT_LABELS: Record<string, string> = {
  gocardless_direct_debit: "Prélèvement GoCardless",
  offline: "Virement",
  pennylane_direct_debit: "Prélèvement Pennylane",
};

/** Mode de paiement du support → ce qu'on attend côté Pennylane. */
const PAYMENT_METHOD_MAP: Record<string, string[]> = {
  "prelevement-gocardless": ["gocardless_direct_debit"],
  virement: ["offline"],
};

/** Conditions de paiement du support → code Pennylane. `1er-du-mois` n'a pas d'équivalent. */
const PAYMENT_TERMS_MAP: Record<string, string> = {
  "7j": "7_days",
  "15j": "15_days",
  "30j": "30_days",
  "45j": "45_days",
  "60j": "60_days",
};

export const plPaymentLabel = (v?: string | null): string =>
  v ? (PL_PAYMENT_LABELS[v] ?? v) : "—";

export const plStatusLabel = (v?: string | null): string => (v ? (PL_STATUS_LABELS[v] ?? v) : "—");

/* ─── Description d'une ligne Pennylane ───────────────────────────────────── */

/** Mentions génériques d'accès, présentes sur toutes les lignes : pas distinctives. */
const GENERIC_NOTE = /^acc[èe]s\b/i;

/**
 * La description d'une ligne est un texte riche sérialisé (paragraphes JSON).
 * On en garde les paragraphes qui DISTINGUENT la ligne — « Maçonnerie »,
 * « Échafaudage » — et on écarte « Accès web + mobile », qui est sur toutes.
 */
function lineDescriptionText(raw?: string | null): string {
  if (!raw) return "";
  let paragraphs: string[] = [];
  try {
    const nodes = JSON.parse(raw) as { children?: { text?: string }[] }[];
    paragraphs = Array.isArray(nodes)
      ? nodes.map((n) => (n.children ?? []).map((c) => c.text ?? "").join("").trim()).filter(Boolean)
      : [];
  } catch {
    paragraphs = raw.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  }
  return paragraphs.filter((t) => !GENERIC_NOTE.test(t)).join(" · ");
}

/* ─── Factures et paiements ───────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/** Ce qui n'est pas une facture de vente à encaisser (avoirs, devis, bons…). */
const NOT_A_SALE = new Set(["credit_note", "proforma", "shipping_order", "purchasing_order", "estimate_pending", "estimate_accepted", "estimate_invoiced", "estimate_denied", "draft", "archived"]);

function summarizeInvoice(inv: PlInvoice, now: Date): InvoiceSummary {
  const remaining = round2(num(inv.remaining_amount_with_tax));
  const deadline = inv.deadline ?? null;
  const overdueDays = deadline ? Math.floor((now.getTime() - Date.parse(deadline)) / DAY_MS) : 0;
  let state: PaymentState;
  if (inv.status === "cancelled" || inv.status === "partially_cancelled") state = "annulee";
  else if (inv.paid || inv.status === "paid") state = "payee";
  else if (inv.status === "late" || (deadline && overdueDays > 0)) state = "retard";
  else if (inv.status === "partially_paid") state = "partielle";
  else if (inv.status === "upcoming" || inv.status === "incomplete") state = "a-echoir";
  else state = "autre";
  return {
    id: inv.id,
    number: inv.invoice_number || inv.label || `#${inv.id}`,
    date: inv.date ?? "",
    deadline,
    amountTTC: round2(num(inv.amount)),
    amountHT: round2(num(inv.currency_amount_before_tax)),
    remaining,
    state,
    lateDays: state === "retard" ? Math.max(1, overdueDays) : 0,
    url: inv.public_file_url ?? null,
  };
}

/**
 * Les mois où une facture était attendue depuis le début de l'abonnement
 * (tous les `months` mois, à partir de `start`), jusqu'à aujourd'hui — et ce
 * qu'on y trouve. Un mois attendu sans facture est un manque à signaler :
 * c'est exactement le paiement qu'on risquait de ne pas voir.
 */
function expectedMonths(start: string | null, months: number, invoices: InvoiceSummary[], now: Date): MonthCheck[] {
  const out: MonthCheck[] = [];
  if (!start) return out;
  const byMonth = new Map<string, InvoiceSummary[]>();
  for (const inv of invoices) {
    if (!inv.date || inv.state === "annulee") continue;
    const k = monthKey(inv.date);
    byMonth.set(k, [...(byMonth.get(k) ?? []), inv]);
  }
  const d = new Date(start);
  const step = Math.max(1, months);
  // Cinq ans d'échéances au plus : au-delà, l'historique n'a plus de lecteur.
  for (let i = 0; i < 60; i++) {
    const due = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i * step, d.getUTCDate()));
    if (due.getTime() > now.getTime()) break;
    const found = byMonth.get(monthKey(due)) ?? [];
    out.push({ month: monthStart(due), invoices: found, missing: found.length === 0 });
  }
  return out;
}

/* ─── Rapprochement des produits ──────────────────────────────────────────── */

function profileOfLine(line: PlInvoiceLine, products: Map<number, PlProduct>): ProfilKey | null {
  const product = line.product?.id != null ? products.get(line.product.id) : undefined;
  const ref = product?.reference?.trim();
  if (ref) {
    const byRef = (Object.keys(PENNYLANE_PRODUCT_REFS) as ProfilKey[]).find(
      (k) => PENNYLANE_PRODUCT_REFS[k].toLowerCase() === ref.toLowerCase(),
    );
    if (byRef) return byRef;
  }
  const label = product?.label || line.label || "";
  for (const p of PROFILS) if (LABEL_HINTS[p.key].test(label)) return p.key;
  return null;
}

/* ─── Rapport ─────────────────────────────────────────────────────────────── */

export function buildBillingReport(clients: SupportClientFacts[], snap: PennylaneSnapshot): BillingReport {
  const products = new Map<number, PlProduct>(snap.products.map((p) => [p.id, p]));
  const customersById = new Map<number, PlCustomer>(snap.customers.map((c) => [c.id, c]));
  // « Aujourd'hui » = la date de lecture de l'instantané : le rapport est
  // reproductible, et un cache d'une heure ne déplace pas une échéance.
  const now = new Date(snap.fetchedAt);

  const invoicesByCustomer = new Map<number, InvoiceSummary[]>();
  for (const inv of snap.invoices) {
    const cid = inv.customer?.id;
    if (cid == null || inv.draft || inv.archived_at || NOT_A_SALE.has(inv.status ?? "")) continue;
    invoicesByCustomer.set(cid, [...(invoicesByCustomer.get(cid) ?? []), summarizeInvoice(inv, now)]);
  }
  for (const list of invoicesByCustomer.values()) list.sort((a, b) => b.date.localeCompare(a.date));

  // Index des clients Pennylane par SIREN et par nom normalisé. Les comptes
  // génériques (« CLIENTS DIVERS ») n'ont ni l'un ni l'autre d'utile.
  const bySiren = new Map<string, PlCustomer>();
  const byName = new Map<string, PlCustomer>();
  for (const c of snap.customers) {
    const s = normalizeSiren(c.reg_no);
    if (s && !bySiren.has(s)) bySiren.set(s, c);
    const n = normalizeName(c.name);
    if (n && !byName.has(n)) byName.set(n, c);
  }

  // Abonnements vivants par client Pennylane. Un abonnement arrêté ne compte
  // que s'il n'y en a pas de vivant : c'est lui qu'on montre alors.
  const subsByCustomer = new Map<number, PlSubscriptionFull[]>();
  for (const s of snap.subscriptions) {
    const cid = s.customer?.id;
    if (cid == null) continue;
    const arr = subsByCustomer.get(cid) ?? [];
    arr.push(s);
    subsByCustomer.set(cid, arr);
  }
  const pickSubscriptions = (cid: number) => {
    const all = subsByCustomer.get(cid) ?? [];
    const live = all.filter((s) => LIVE_STATUSES.has(s.status));
    return live.length ? live : all.slice(0, 1);
  };

  // Rapprochement en deux temps : d'abord tout ce que le SIREN relie (un fait),
  // puis le nom pour les fiches restantes — mais jamais vers un client Pennylane
  // déjà pris par un SIREN. Sinon une fiche de test homonyme, sans SIREN,
  // viendrait se coller sur l'abonnement du vrai client.
  const matches = new Map<SupportClientFacts, { customer: PlCustomer; match: "siren" | "name" }>();
  const taken = new Set<number>();
  for (const cl of clients) {
    const siren = normalizeSiren(cl.siren);
    const found = siren ? bySiren.get(siren) : undefined;
    if (found) {
      matches.set(cl, { customer: found, match: "siren" });
      taken.add(found.id);
    }
  }
  for (const cl of clients) {
    if (matches.has(cl)) continue;
    const candidates = [normalizeName(cl.raisonSociale), normalizeName(cl.name)].filter(Boolean);
    for (const n of candidates) {
      const found = byName.get(n);
      if (found && !taken.has(found.id)) {
        matches.set(cl, { customer: found, match: "name" });
        taken.add(found.id);
        break;
      }
    }
  }

  const claimed = new Set<number>(); // abonnements rattachés à une fiche
  const checks: ClientCheck[] = [];

  for (const cl of clients) {
    const siren = normalizeSiren(cl.siren);
    const found = matches.get(cl);
    const match: ClientCheck["match"] = found?.match ?? "none";
    const plCustomer: PlCustomer | undefined = found?.customer;

    const subs = plCustomer ? pickSubscriptions(plCustomer.id) : [];
    const sub = subs[0] ?? null;
    for (const s of subs) claimed.add(s.id);

    // Un client qui n'a ni licence ni client Pennylane ni abonnement : rien à
    // contrôler, on ne l'affiche pas (prospects du pipeline).
    const supportRows = licenceLinesOf(cl.licences).map((l) => ({
      key: l.key,
      label: l.label,
      supportQty: l.qty,
      supportPrice: effectiveUnitPrice(l),
      supportListPrice: round2(l.price),
      supportDiscountPct: l.discountPct ?? 0,
      supportDiscountAmount: l.discountAmount ?? 0,
    }));
    const supportQty = supportRows.reduce((a, r) => a + r.supportQty, 0);
    const isActive = cl.clientStatus === "actif";
    if (!isActive && !sub) continue;

    // Une facture Pennylane peut couvrir plusieurs mois (trimestrielle : trois
    // sections « Mois 1/2/3 » qui répètent les lignes). On ramène tout AU MOIS,
    // l'unité de la fiche : quantités et montant divisés par le nombre de mois.
    const plMonths = sub ? pennylaneMonths(sub.recurring_rule) : null;
    const months = plMonths ?? 1;
    const supportMonths = billingPeriodMonths(cl.billingPeriod);

    // Agrégation des lignes Pennylane par profil.
    const agg = new Map<
      ProfilKey,
      {
        qty: number;
        prices: Set<number>;
        listPrices: Set<number>;
        lines: { qty: number; note: string; section: number }[];
      }
    >();
    const extraLines: ExtraLine[] = [];
    for (const line of sub?.lines ?? []) {
      const key = profileOfLine(line, products);
      const qty = num(line.quantity);
      const list = round2(num(line.raw_currency_unit_price));
      const amount = round2(num(line.currency_amount_before_tax));
      // Le prix qu'on compare est celui réellement facturé par licence : le total
      // de la ligne (remise déduite) ramené à l'unité. Une ligne offerte vaut 0.
      const unit = qty > 0 ? round2(amount / qty) : list;
      if (!key) {
        extraLines.push({ label: line.label, qty, unitPrice: unit, amountHT: amount });
        continue;
      }
      const a = agg.get(key) ?? {
        qty: 0,
        prices: new Set<number>(),
        listPrices: new Set<number>(),
        lines: [],
      };
      a.qty += qty;
      a.prices.add(unit);
      a.listPrices.add(list);
      a.lines.push({ qty, note: lineDescriptionText(line.description), section: line.section_rank ?? 0 });
      agg.set(key, a);
    }

    // Les sections d'une facture multi-mois doivent se répéter à l'identique :
    // si « Mois 2 » diffère de « Mois 1 », la moyenne mensuelle n'a pas de sens.
    let unevenMonths = false;
    if (months > 1) {
      for (const a of agg.values()) {
        const bySection = new Map<number, number>();
        for (const l of a.lines) bySection.set(l.section, (bySection.get(l.section) ?? 0) + l.qty);
        const qtys = [...bySection.values()];
        if (bySection.size !== months || qtys.some((q) => q !== qtys[0])) unevenMonths = true;
      }
    }

    const rows: ProfileRow[] = supportRows.map((r) => {
      const a = agg.get(r.key);
      const plQty = a ? round2(a.qty / months) : 0;
      // Détail : sur une facture multi-mois, celui du premier mois suffit quand
      // les mois se répètent ; sinon toutes les lignes, préfixées de leur mois.
      const detail = !a
        ? []
        : months === 1
          ? a.lines
          : unevenMonths
            ? a.lines.map((l) => ({ ...l, note: [`Mois ${l.section + 1}`, l.note].filter(Boolean).join(" · ") }))
            : a.lines.filter((l) => l.section === a.lines[0].section);
      const prices = a ? [...a.prices] : [];
      const plPrice = prices.length ? prices[0] : null;
      const plListPrice = a ? [...a.listPrices][0] : null;
      const mixedPrices = prices.length > 1;
      // Le prix ne se compare que là où il y a quelque chose à facturer des deux côtés.
      const priceMismatch =
        r.supportQty > 0 && plQty > 0 && (mixedPrices || round2(r.supportPrice) !== round2(plPrice ?? 0));
      return {
        ...r,
        plQty,
        plLines: detail.length > 1 ? detail.map(({ qty, note }) => ({ qty, note })) : [],
        plPrice,
        plListPrice,
        mixedPrices,
        qtyDiff: plQty - r.supportQty,
        priceMismatch,
      };
    });

    const supportHT = round2(rows.reduce((a, r) => a + r.supportQty * r.supportPrice, 0));
    const plQty = rows.reduce((a, r) => a + r.plQty, 0);
    const plInvoiceHT = round2(num(sub?.customer_invoice_data?.currency_amount_before_tax));
    const plHT = round2(plInvoiceHT / months);

    const issues: Issue[] = [];

    if (!plCustomer) {
      issues.push({
        code: "no-subscription",
        severity: "error",
        label: siren
          ? "Introuvable dans Pennylane (aucun client avec ce SIREN ni ce nom)"
          : "Introuvable dans Pennylane — et pas de SIREN sur la fiche",
      });
    } else {
      if (match === "name") {
        const plSiren = normalizeSiren(plCustomer.reg_no);
        issues.push({
          code: "siren-mismatch",
          severity: siren && plSiren ? "error" : "warn",
          label:
            siren && plSiren
              ? `SIREN différent : ${siren} sur la fiche, ${plSiren} dans Pennylane`
              : siren
                ? "Rapproché par le nom : le SIREN manque dans Pennylane"
                : "Rapproché par le nom : le SIREN manque sur la fiche",
        });
      }
      if (!sub) {
        issues.push({
          code: "no-subscription",
          severity: "error",
          label: "Client présent dans Pennylane mais sans abonnement",
        });
      } else {
        if (sub.status === "stopped" || sub.status === "finished") {
          issues.push({
            code: "subscription-stopped",
            severity: "error",
            label: `Abonnement ${plStatusLabel(sub.status).toLowerCase()} dans Pennylane`,
          });
        } else if (sub.status === "draft") {
          issues.push({ code: "subscription-draft", severity: "error", label: "Abonnement encore en brouillon" });
        }
        if (!isActive && LIVE_STATUSES.has(sub.status)) {
          issues.push({
            code: "not-active-but-billed",
            severity: "error",
            label: "Facturé par Pennylane alors que la fiche n'est pas « Gagnée »",
          });
        }
        if (subs.length > 1) {
          issues.push({
            code: "multiple-subscriptions",
            severity: "warn",
            label: `${subs.length} abonnements actifs dans Pennylane — seul le premier est comparé`,
          });
        }
        for (const r of rows) {
          if (r.qtyDiff !== 0) {
            issues.push({
              code: "qty",
              severity: "error",
              label: `${r.label} : ${r.supportQty} sur la fiche, ${r.plQty} facturée${r.plQty > 1 ? "s" : ""}${months > 1 ? " par mois" : ""}`,
            });
          } else if (r.priceMismatch) {
            issues.push({
              code: "price",
              severity: "warn",
              label: r.mixedPrices
                ? `${r.label} : plusieurs prix différents dans Pennylane`
                : `${r.label} : ${fmtPrice(r.supportPrice)} sur la fiche, ${fmtPrice(r.plPrice ?? 0)} facturé`,
            });
          }
        }
        if (plMonths == null) {
          issues.push({
            code: "billing-period",
            severity: "warn",
            label: "Récurrence Pennylane ni mensuelle ni annuelle : comparaison faite comme si elle était mensuelle",
          });
        } else if (plMonths !== supportMonths) {
          issues.push({
            code: "billing-period",
            severity: "error",
            label: `Périodicité : ${monthsLabel(supportMonths)} sur la fiche, ${monthsLabel(plMonths)} dans Pennylane`,
          });
        }
        if (unevenMonths) {
          issues.push({
            code: "uneven-months",
            severity: "error",
            label: `Les ${months} mois de la facture Pennylane ne se répètent pas à l'identique`,
          });
        }
        // Deux lignes du même profil ne sont un doublon que si RIEN ne les
        // distingue. Un groupe facturé par entité (« Maçonnerie » / « Échafaudage »)
        // a légitimement plusieurs lignes : on les additionne, sans alerte.
        const dup = [...agg.entries()].filter(([, a]) => {
          const keys = a.lines.map((l) => `${l.section}|${normalizeName(l.note)}`);
          return new Set(keys).size < keys.length;
        });
        if (dup.length) {
          issues.push({
            code: "duplicate-lines",
            severity: "warn",
            label: `Lignes en double dans Pennylane : ${dup.map(([k]) => PROFILS.find((p) => p.key === k)?.label ?? k).join(", ")}`,
          });
        }
        if (extraLines.length) {
          issues.push({
            code: "extra-lines",
            severity: "warn",
            label: `Lignes hors licences dans l'abonnement : ${extraLines.map((l) => l.label).join(", ")}`,
          });
        }
        if (cl.paymentMethod && sub.payment_method) {
          const expected = PAYMENT_METHOD_MAP[cl.paymentMethod];
          if (expected && !expected.includes(sub.payment_method)) {
            issues.push({
              code: "payment-method",
              severity: "warn",
              label: `Mode de paiement : ${cl.paymentMethod === "virement" ? "virement" : "prélèvement"} sur la fiche, ${plPaymentLabel(sub.payment_method).toLowerCase()} dans Pennylane`,
            });
          }
        }
        if (cl.paymentMethod === "virement" && cl.paymentTerms && sub.payment_conditions) {
          const expected = PAYMENT_TERMS_MAP[cl.paymentTerms];
          if (expected && expected !== sub.payment_conditions) {
            issues.push({
              code: "payment-terms",
              severity: "warn",
              label: `Délai de règlement : ${cl.paymentTerms} sur la fiche, ${sub.payment_conditions.replace("_days", " j").replace("upon_receipt", "à réception")} dans Pennylane`,
            });
          }
        }
      }
    }

    // Paiements : ce qui a été émis et encaissé, mois après mois.
    const invoices = plCustomer ? (invoicesByCustomer.get(plCustomer.id) ?? []) : [];
    const latePayments = invoices.filter((i) => i.state === "retard");
    const billingLive = sub && LIVE_STATUSES.has(sub.status);
    const monthChecks = billingLive ? expectedMonths(sub.start ?? null, months, invoices, now) : [];
    if (latePayments.length) {
      const total = round2(latePayments.reduce((a, i) => a + i.remaining, 0));
      issues.push({
        code: "late-payment",
        severity: "error",
        label:
          latePayments.length === 1
            ? `Facture ${latePayments[0].number} en retard de ${latePayments[0].lateDays} j — ${fmtPrice(latePayments[0].remaining)} TTC restant dus`
            : `${latePayments.length} factures en retard — ${fmtPrice(total)} TTC restant dus`,
      });
    }
    const missing = monthChecks.filter((m) => m.missing);
    if (missing.length) {
      const names = missing.map((m) =>
        new Date(m.month).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }),
      );
      issues.push({
        code: "missing-invoice",
        severity: "error",
        label: missing.length === 1 ? `Aucune facture émise en ${names[0]}` : `Aucune facture émise : ${names.join(", ")}`,
      });
    }

    const verdict: Verdict = !plCustomer
      ? "non-rapproche"
      : !sub || sub.status === "stopped" || sub.status === "finished" || sub.status === "draft"
        ? "sans-abonnement"
        : issues.length
          ? "ecart"
          : "ok";

    checks.push({
      client: {
        id: cl.id,
        name: cl.name,
        siren,
        clientStatus: cl.clientStatus ?? null,
        paymentMethod: cl.paymentMethod ?? null,
        paymentTerms: cl.paymentTerms ?? null,
      },
      match,
      pennylane: plCustomer
        ? {
            customerId: plCustomer.id,
            customerName: plCustomer.name,
            regNo: normalizeSiren(plCustomer.reg_no),
            subscriptionId: sub?.id ?? null,
            subscriptionLabel: sub?.label ?? null,
            status: sub?.status ?? null,
            start: sub?.start ?? null,
            nextOccurrence: sub?.next_occurrence ?? null,
            paymentMethod: sub?.payment_method ?? null,
            paymentConditions: sub?.payment_conditions ?? null,
            amountHT: plInvoiceHT,
            months: sub ? plMonths : null,
          }
        : null,
      rows,
      extraLines,
      totals: { supportQty, supportHT, plQty, plHT },
      issues,
      verdict,
      invoices,
      latePayments,
      months: monthChecks,
    });
  }

  // Abonnements vivants que personne ne réclame : un client facturé qui n'a
  // pas de fiche « Gagnée » — ou plus de fiche du tout.
  const orphans: OrphanSubscription[] = snap.subscriptions
    .filter((s) => LIVE_STATUSES.has(s.status) && !claimed.has(s.id))
    .map((s) => {
      const c = s.customer?.id != null ? customersById.get(s.customer.id) : undefined;
      return {
        subscriptionId: s.id,
        customerId: c?.id ?? null,
        customerName: c?.name ?? "Client inconnu",
        regNo: normalizeSiren(c?.reg_no),
        status: s.status,
        amountHT: round2(num(s.customer_invoice_data?.currency_amount_before_tax)),
        label: s.label ?? null,
      };
    });

  // Les écarts d'abord, puis les conformes ; à égalité, l'ordre alphabétique.
  const rank: Record<Verdict, number> = { "non-rapproche": 0, "sans-abonnement": 1, ecart: 2, ok: 3 };
  checks.sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.client.name.localeCompare(b.client.name, "fr"));

  return {
    fetchedAt: snap.fetchedAt,
    checks,
    orphans,
    summary: {
      total: checks.length,
      ok: checks.filter((c) => c.verdict === "ok").length,
      ecart: checks.filter((c) => c.verdict === "ecart").length,
      sansAbonnement: checks.filter((c) => c.verdict === "sans-abonnement").length,
      nonRapproche: checks.filter((c) => c.verdict === "non-rapproche").length,
      orphans: orphans.length,
      latePayments: checks.reduce((n, c) => n + c.latePayments.length, 0),
      lateAmount: round2(checks.reduce((n, c) => n + c.latePayments.reduce((a, i) => a + i.remaining, 0), 0)),
    },
  };
}

/* ─── Tampon pour l'historique mensuel ────────────────────────────────────── */

/**
 * Ce que l'historique d'une fiche garde de Pennylane, mois par mois : quand la
 * facturation a commencé (l'historique n'a pas de sens avant), et si les
 * licences du mois étaient conformes à l'abonnement au moment de l'enregistrer.
 *
 * `ok` ne regarde que les licences (quantités et prix par profil) : c'est ce
 * que l'historique raconte. Le mode de paiement ou la périodicité ont leur
 * place dans l'écran de rapprochement, pas dans une ligne de CA.
 */
export type PennylaneStamp = {
  /** Date de début de l'abonnement Pennylane (ISO jour), null sans abonnement. */
  start: string | null;
  /** Licences conformes ? null si aucun abonnement vivant. */
  ok: boolean | null;
  checkedAt: string;
};

export function pennylaneStampFor(facts: SupportClientFacts, snap: PennylaneSnapshot): PennylaneStamp {
  const check = buildBillingReport([{ ...facts, clientStatus: "actif" }], snap).checks[0];
  const pl = check?.pennylane;
  const live = Boolean(pl?.subscriptionId) && LIVE_STATUSES.has(pl?.status ?? "");
  return {
    start: live ? (pl?.start ?? null) : null,
    ok: live ? check.rows.every((r) => r.qtyDiff === 0 && !r.priceMismatch) : null,
    checkedAt: snap.fetchedAt,
  };
}
