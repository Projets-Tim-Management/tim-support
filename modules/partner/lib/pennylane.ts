/**
 * Lecture de Pennylane (API v2) — ce que TIM facture réellement à ses clients.
 *
 * Périmètre volontairement restreint : on LIT les clients, les abonnements de
 * facturation et leurs lignes. Rien n'est écrit, rien n'est copié en base :
 * l'écran de contrôle interroge Pennylane à la demande, un instantané est gardé
 * en mémoire une heure pour ne pas refaire ~35 requêtes à chaque affichage
 * (limite Pennylane : 25 requêtes / 5 s).
 *
 * Config via .env.local :
 *   PENNYLANE_API_TOKEN   token d'entreprise, scopes readonly customers,
 *                         billing_subscriptions, products (obligatoire)
 *   PENNYLANE_API_BASE    base URL (défaut https://app.pennylane.com/api/external/v2)
 *
 * Doc : https://pennylane.readme.io/reference/getbillingsubscriptions
 */

const BASE = process.env.PENNYLANE_API_BASE || "https://app.pennylane.com/api/external/v2";
const TOKEN = () => process.env.PENNYLANE_API_TOKEN;

/** Durée de vie de l'instantané en mémoire (une heure). */
const TTL_MS = 60 * 60 * 1000;

/** Nombre de requêtes de lignes lancées en parallèle : sous la limite Pennylane. */
const LINES_CONCURRENCY = 5;

export type PlCustomer = {
  id: number;
  name: string;
  customer_type?: string;
  reg_no?: string | null;
  vat_number?: string | null;
  external_reference?: string | null;
  emails?: string[];
};

export type PlProduct = {
  id: number;
  label: string;
  reference?: string | null;
  price_before_tax?: string | null;
  price?: string | null;
  vat_rate?: string | null;
};

export type PlSubscriptionStatus =
  | "draft"
  | "stopped"
  | "finished"
  | "pending"
  | "not_started"
  | "in_progress";

export type PlInvoiceLine = {
  id: number;
  label: string;
  quantity: string;
  /** Prix unitaire HT AVANT remise. */
  raw_currency_unit_price: string;
  /** Total HT de la ligne, remise déduite. */
  currency_amount_before_tax: string;
  /** Texte riche sérialisé (JSON de paragraphes) — voir `lineDescriptionText`. */
  description?: string | null;
  /** Section de la facture (0, 1, 2…) : une facture trimestrielle en a une par mois. */
  section_rank?: number | null;
  product?: { id: number } | null;
};

export type PlSubscription = {
  id: number;
  label?: string | null;
  status: PlSubscriptionStatus;
  start?: string | null;
  finish?: string | null;
  next_occurrence?: string | null;
  prev_occurrence?: string | null;
  stopped_at?: string | null;
  payment_method?: string | null;
  payment_conditions?: string | null;
  recurring_rule?: { rule_type?: string; interval?: number; day_of_month?: number[] | null } | null;
  customer?: { id: number } | null;
  customer_invoice_data?: {
    currency_amount?: string;
    currency_amount_before_tax?: string;
    invoice_lines?: { url: string };
  } | null;
};

export type PlInvoiceStatus =
  | "archived" | "incomplete" | "cancelled" | "paid" | "partially_paid" | "partially_cancelled"
  | "upcoming" | "late" | "draft" | "credit_note" | "proforma" | "shipping_order" | "purchasing_order"
  | "estimate_pending" | "estimate_accepted" | "estimate_invoiced" | "estimate_denied";

/** Une facture client émise (ou brouillon) — ce qui a VRAIMENT été facturé et encaissé. */
export type PlInvoice = {
  id: number;
  label?: string | null;
  invoice_number?: string | null;
  date?: string | null;
  deadline?: string | null;
  status?: PlInvoiceStatus | string | null;
  paid?: boolean | null;
  draft?: boolean | null;
  amount?: string | null;
  currency_amount_before_tax?: string | null;
  remaining_amount_with_tax?: string | null;
  archived_at?: string | null;
  public_file_url?: string | null;
  customer?: { id: number } | null;
  billing_subscription?: { id: number } | null;
  credited_invoice?: { id: number } | null;
};

/** Un abonnement AVEC ses lignes : c'est là qu'est la quantité par profil. */
export type PlSubscriptionFull = PlSubscription & { lines: PlInvoiceLine[] };

export type PennylaneSnapshot = {
  /** Quand l'instantané a été lu chez Pennylane. */
  fetchedAt: string;
  customers: PlCustomer[];
  products: PlProduct[];
  subscriptions: PlSubscriptionFull[];
  /** Factures clients, scope `customer_invoices:readonly` — vide si le token ne l'a pas. Le tri (brouillons, avoirs…) se fait dans billing-check. */
  invoices: PlInvoice[];
};

export type PennylaneErrorCode = "not_configured" | "unauthorized" | "rate_limited" | "unreachable" | "api_error";

/** Une erreur qu'on sait expliquer à l'écran (jamais une stack brute). */
export class PennylaneError extends Error {
  code: PennylaneErrorCode;
  status?: number;
  constructor(code: PennylaneErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const isPennylaneConfigured = (): boolean => Boolean(TOKEN());

/** Message lisible pour chaque cas d'erreur, affiché tel quel dans l'admin. */
export function pennylaneErrorMessage(err: unknown): string {
  if (err instanceof PennylaneError) {
    switch (err.code) {
      case "not_configured":
        return "Connexion Pennylane non configurée : la variable PENNYLANE_API_TOKEN est absente.";
      case "unauthorized":
        return "Pennylane refuse le token (expiré, révoqué ou permissions insuffisantes). Générez-en un nouveau dans Pennylane → Paramètres → Connectivité → Développeurs.";
      case "rate_limited":
        return "Pennylane limite les appels pour l'instant. Réessayez dans quelques secondes.";
      case "unreachable":
        return "Pennylane est injoignable. Vérifiez la connexion, puis actualisez.";
      default:
        return `Pennylane a répondu une erreur${err.status ? ` (HTTP ${err.status})` : ""}.`;
    }
  }
  return "Lecture Pennylane impossible.";
}

/* ─── Appels HTTP ──────────────────────────────────────────────────────────── */

type Page<T> = { items: T[]; has_more?: boolean; next_cursor?: string | null };

async function get<T>(url: string, attempt = 0): Promise<T> {
  const token = TOKEN();
  if (!token) throw new PennylaneError("not_configured", "PENNYLANE_API_TOKEN absent");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new PennylaneError("unreachable", "Pennylane injoignable");
  }

  if (res.status === 401 || res.status === 403) {
    throw new PennylaneError("unauthorized", "Token Pennylane refusé", res.status);
  }
  // Une seule reprise sur 429 : on respecte `retry-after`, sinon on abandonne
  // proprement plutôt que d'insister contre la limite.
  if (res.status === 429) {
    if (attempt >= 1) throw new PennylaneError("rate_limited", "Limite d'appels Pennylane", 429);
    const wait = Math.min(10, Number(res.headers.get("retry-after")) || 3);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return get<T>(url, attempt + 1);
  }
  if (!res.ok) throw new PennylaneError("api_error", `Pennylane HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Parcourt toutes les pages d'une liste (curseur opaque, 100 par page). */
async function listAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null | undefined;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${BASE}${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await get<Page<T>>(url);
    out.push(...(page.items ?? []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

/** Applique `fn` sur les éléments par petits lots — jamais tout d'un coup. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

async function fetchSnapshot(): Promise<PennylaneSnapshot> {
  const [customers, products, subs, invoices] = await Promise.all([
    listAll<PlCustomer>("/customers"),
    listAll<PlProduct>("/products"),
    listAll<PlSubscription>("/billing_subscriptions"),
    // Les factures sont un plus (suivi des paiements) : un token sans ce scope
    // ne doit pas casser le rapprochement des licences.
    listAll<PlInvoice>("/customer_invoices").catch((e) => {
      if (e instanceof PennylaneError && e.code === "unauthorized") return [];
      throw e;
    }),
  ]);

  const subscriptions = await mapLimited(subs, LINES_CONCURRENCY, async (s) => ({
    ...s,
    lines: await listAll<PlInvoiceLine>(`/billing_subscriptions/${s.id}/invoice_lines`),
  }));

  return { fetchedAt: new Date().toISOString(), customers, products, subscriptions, invoices };
}

/* ─── Cache mémoire ────────────────────────────────────────────────────────── */

let cache: { at: number; data: PennylaneSnapshot } | null = null;
let inflight: Promise<PennylaneSnapshot> | null = null;

/**
 * L'instantané Pennylane, lu au plus une fois par heure. `refresh` force une
 * relecture (bouton « Actualiser »). Deux lectures simultanées partagent le
 * même appel — pas de double rafale contre la limite.
 */
export async function loadPennylane(opts: { refresh?: boolean } = {}): Promise<PennylaneSnapshot> {
  if (!opts.refresh && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!inflight) {
    inflight = fetchSnapshot()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * L'instantané en cache, SANS attendre : ce qu'il faut à un hook
 * d'enregistrement, qui ne doit pas bloquer une fiche le temps de trente
 * requêtes. Rien en cache (ou périmé) → null, et une relecture part en fond
 * pour la prochaine fois. Sans token, toujours null.
 */
export function peekPennylane(): PennylaneSnapshot | null {
  if (!TOKEN()) return null;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  void loadPennylane().catch(() => {});
  return null;
}
