import type { Expense } from "@/modules/analytics/lib/expenses";

/**
 * Les dépenses rangées dans les catégories analytiques de Pennylane
 * (« Suivi de trésorerie »), catégorie → sous-catégories, mois par mois.
 *
 * L'API Pennylane donne les catégories à plat : la catégorie parente n'y
 * figure pas. Le rattachement est donc tenu chez nous (Analyses → Catégories
 * de dépenses, global `expense-categories`), par identifiant Pennylane. Une
 * catégorie qu'on n'y a pas encore réglée prend l'arbre ci-dessous, par
 * libellé ; sinon elle est « à rattacher » et l'écran le signale.
 */

/** Valeur du rattachement pour une catégorie de premier niveau. */
export const ROOT = "racine";

/** Rattachement enregistré : id de la catégorie → id de sa parente, ou ROOT. */
export type CategoryParents = Record<string, string>;

/** L'arbre des sorties tel qu'il est posé dans Pennylane (capture du 04/11/2026), par libellé. */
export const DEFAULT_TREE: Record<string, string[]> = {
  Banque: ["Commissions", "Frais bancaires"],
  "Frais bancaires": ["Frais carte à l'étranger", "Tenue de compte", "Frais Pennylane / Swan"],
  "Frais de fonctionnement": [
    "Énergies et carburants",
    "Entretien / Maintenance",
    "Fournitures de bureaux",
    "Leasing, crédit-bail",
    "Logiciels",
    "Loyer et charges",
    "Note de frais",
    "Repas / Réception",
    "Téléphonie / Internet",
    "Transports",
  ],
  Logiciels: ["Emailing & CRM", "Outils IA", "Design & produit", "Productivité & messagerie"],
  "Frais de gestion": ["Amendes / Pénalités", "Expert-comptable", "Frais postaux", "Greffe et annonces", "Honoraires", "Avocat"],
  "Impôts, taxes et assurances": ["Assurances", "CFE", "IS", "Taxes"],
  "IT / Informatique": ["Hébergements web", "Matériels IT", "Prestataire"],
  "Hébergements web": ["Déploiement & DevOps"],
  "Marketing & acquisition": ["Agence marketing", "Événements / Salons", "Publicité en ligne", "Relation Presse", "SEO & netlinking", "Réseaux", "Supports imprimés & goodies"],
  Salaires: ["Formations", "Mutuelle", "Prélèvement à la source", "Prévoyance / Retraite", "Salaires nets", "Tickets restau", "URSSAF"],
  "Sous-traitants": ["Achats de marchandise", "Prestations de service", "Sous-traitance générale"],
};

/**
 * La couleur de chaque famille (catégorie de premier niveau) : une case FIXE de
 * la palette (styles/_ui-colors.scss, 0 = --tim-chart-1), la même dans le
 * graphique et les étiquettes du tableau, quel que soit le mois ou le montant.
 * Une famille absente d'ici (nouvelle, ou sans dépenses) va dans « Autres ».
 */
export const ROOT_SLOTS: Record<string, number> = {
  "IT / Informatique": 0,
  "Marketing & acquisition": 1,
  "Frais de gestion": 2,
  "Frais de fonctionnement": 3,
  Banque: 4,
  "Impôts, taxes et assurances": 5,
  "Sous-traitants": 6,
};

const DEFAULT_PARENT = new Map<string, string>(Object.entries(DEFAULT_TREE).flatMap(([parent, children]) => children.map((c): [string, string] => [c, parent])));
const DEFAULT_ROOTS = new Set(Object.keys(DEFAULT_TREE).filter((l) => !DEFAULT_PARENT.has(l)));

export type LiveCategory = { id: string; label: string; direction: "cash_in" | "cash_out" | null };

export type CategoryNode = LiveCategory & {
  /** null : premier niveau (ou à rattacher). */
  parentId: string | null;
  /** Ni réglée, ni dans l'arbre par défaut : ses dépenses vont dans « À rattacher ». */
  unattached: boolean;
};

/**
 * La parente de chaque catégorie : le réglage enregistré d'abord, puis l'arbre
 * par défaut (par libellé). Une catégorie d'entrées d'argent est de premier
 * niveau d'office (elle ne porte pas de dépenses, on ne la signale pas).
 * Un rattachement en boucle, ou vers une catégorie supprimée, rend la
 * catégorie « à rattacher ».
 */
export function resolveCategories(live: LiveCategory[], stored: CategoryParents = {}): CategoryNode[] {
  const byId = new Map(live.map((c) => [c.id, c]));
  const idOfLabel = new Map(live.map((c) => [c.label, c.id]));
  const nodes = new Map<string, CategoryNode>();
  for (const c of live) {
    const saved = stored[c.id];
    let parentId: string | null = null;
    let unattached = false;
    if (saved === ROOT) parentId = null;
    else if (saved) {
      if (byId.has(saved) && saved !== c.id) parentId = saved;
      else unattached = true;
    } else if (DEFAULT_ROOTS.has(c.label) || c.direction === "cash_in") parentId = null;
    else {
      const parentLabel = DEFAULT_PARENT.get(c.label);
      const id = parentLabel ? idOfLabel.get(parentLabel) : undefined;
      if (id) parentId = id;
      else unattached = true;
    }
    nodes.set(c.id, { ...c, parentId, unattached });
  }
  // Une boucle (A sous B, B sous A) ne mène à aucune racine : on la casse.
  for (const n of nodes.values()) {
    const seen = new Set<string>([n.id]);
    let p = n.parentId;
    while (p) {
      if (seen.has(p)) {
        n.parentId = null;
        n.unattached = true;
        break;
      }
      seen.add(p);
      p = nodes.get(p)?.parentId ?? null;
    }
  }
  return [...nodes.values()];
}

/** Ligne du tableau : une catégorie, ses montants par mois et sa place dans l'arbre. */
export type CategoryRow = {
  id: string;
  label: string;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
  /** Un montant par mois demandé (0 : rien). */
  values: number[];
  total: number;
  /** Ligne ajoutée par l'écran (« À rattacher », « Sans catégorie », « non détaillé »). */
  muted?: boolean;
};

export const UNATTACHED_ID = "__a-rattacher";
export const NONE_ID = "__sans-categorie";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Le tableau catégorie × mois : chaque dépense (hors « pas une dépense ») va
 * à sa catégorie, au prorata si elle en a plusieurs ; une catégorie compte ce
 * qui lui est posé plus tout ce qu'il y a dessous. Ordre : l'arbre, chaque
 * niveau du plus gros au plus petit, puis « À rattacher » et « Sans catégorie ».
 */
export function categoryPivot(expenses: Expense[], nodes: CategoryNode[], months: string[]): CategoryRow[] {
  const col = new Map(months.map((m, i) => [m, i]));
  const all = new Map(nodes.map((n) => [n.id, n]));
  const own = new Map<string, number[]>();
  const put = (id: string, i: number, v: number) => {
    const arr = own.get(id) ?? months.map(() => 0);
    arr[i] += v;
    own.set(id, arr);
  };
  for (const e of expenses) {
    const i = col.get(e.month);
    if (i == null || e.kind === "ignore") continue;
    if (!e.categories.length) {
      put(NONE_ID, i, e.amount);
      continue;
    }
    const weights = e.categories.reduce((s, c) => s + c.weight, 0) || 1;
    for (const c of e.categories) {
      // Une catégorie que Pennylane ne liste plus (supprimée) : à rattacher, sous son nom.
      if (!all.has(c.id)) all.set(c.id, { id: c.id, label: c.label, direction: "cash_out", parentId: null, unattached: true });
      put(c.id, i, (e.amount * c.weight) / weights);
    }
  }

  const children = new Map<string | null, CategoryNode[]>();
  for (const n of all.values()) {
    const key = n.unattached ? UNATTACHED_ID : n.parentId;
    children.set(key, [...(children.get(key) ?? []), n]);
  }
  // Le total d'une catégorie : le sien plus celui de toute sa descendance.
  const sums = new Map<string, number[]>();
  const sumOf = (id: string): number[] => {
    const cached = sums.get(id);
    if (cached) return cached;
    const v = [...(own.get(id) ?? months.map(() => 0))];
    for (const ch of children.get(id) ?? []) sumOf(ch.id).forEach((x, i) => (v[i] += x));
    sums.set(id, v);
    return v;
  };
  const total = (v: number[]) => round2(v.reduce((s, x) => s + x, 0));

  const rows: CategoryRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = (children.get(parentId) ?? []).map((n) => ({ n, v: sumOf(n.id) })).filter((x) => total(x.v) > 0);
    kids.sort((a, b) => total(b.v) - total(a.v) || a.n.label.localeCompare(b.n.label, "fr"));
    for (const { n, v } of kids) {
      const subKids = (children.get(n.id) ?? []).some((ch) => total(sumOf(ch.id)) > 0);
      rows.push({ id: n.id, label: n.label, depth, parentId, hasChildren: subKids, values: v.map(round2), total: total(v) });
      if (!subKids) continue;
      walk(n.id, depth + 1);
      // Ce qui est posé sur la catégorie elle-même, sans sous-catégorie : dit à part, pour que les lignes s'additionnent.
      const mine = own.get(n.id);
      if (mine && total(mine) > 0) rows.push({ id: `${n.id}:direct`, label: `${n.label} (sans sous-catégorie)`, depth: depth + 1, parentId: n.id, hasChildren: false, values: mine.map(round2), total: total(mine), muted: true });
    }
  };
  walk(null, 0);

  // Une catégorie à rattacher emporte ses éventuelles sous-catégories dans son montant.
  const pending = (children.get(UNATTACHED_ID) ?? []).map((n) => ({ n, v: sumOf(n.id) })).filter((x) => total(x.v) > 0);
  if (pending.length) {
    const v = months.map((_, i) => pending.reduce((s, x) => s + x.v[i], 0));
    rows.push({ id: UNATTACHED_ID, label: "À rattacher", depth: 0, parentId: null, hasChildren: true, values: v.map(round2), total: total(v), muted: true });
    for (const { n, v: nv } of pending.sort((a, b) => total(b.v) - total(a.v))) rows.push({ id: n.id, label: n.label, depth: 1, parentId: UNATTACHED_ID, hasChildren: false, values: nv.map(round2), total: total(nv) });
  }
  const none = own.get(NONE_ID);
  if (none && total(none) > 0) rows.push({ id: NONE_ID, label: "Sans catégorie dans Pennylane", depth: 0, parentId: null, hasChildren: false, values: none.map(round2), total: total(none), muted: true });
  return rows;
}

/** Les catégories de sorties qui n'ont pas de parente, ni réglée ni par défaut : à signaler. */
export const unattachedOf = (nodes: CategoryNode[]) => nodes.filter((n) => n.unattached && n.direction !== "cash_in");
