import { round2 } from "@/modules/partner/lib/format";

/**
 * Les dépenses, lues sur les comptes bancaires de Pennylane (depuis janvier
 * 2026) : chaque sortie d'argent rangée dans un POSTE (Google Ads, SEO,
 * ChatGPT Ads…) par une règle sur son libellé bancaire — « LINKUMA » → SEO.
 *
 * Les factures fournisseurs ne suffisent pas : les publicités payées par carte
 * n'en ont souvent pas. Le relevé, lui, voit tout ; il voit aussi ce qui n'est
 * pas une dépense, et les règles l'écartent :
 *  - les transferts entre nos propres comptes (GoCardless verse les
 *    prélèvements des clients sur le compte courant : compter ces sorties
 *    doublerait les dépenses) ;
 *  - la TVA reversée, qui ne fait que transiter.
 * Les impôts (CFE, IS…) sont un poste à part : le bénéfice se lit avant impôts.
 *
 * Une sortie sans règle prend la catégorie posée dans Pennylane, sinon elle va
 * dans « À classer » : un fournisseur à ranger s'ajoute dans
 * DEFAULT_EXPENSE_RULES (l'écran de réglage, resté vide, a été retiré le
 * 02/11/2026). `custom` sert aux tests. Pur : l'écran passe les transactions.
 */

export type ExpenseKind = "depense" | "impot" | "ignore";

export type ExpenseRule = {
  /** Morceau du libellé bancaire, sans tenir compte des majuscules. */
  match: string;
  poste: string;
  kind: ExpenseKind;
};

export const UNCLASSIFIED = "À classer";
export const TAXES = "Impôts";
export const IT = "IT";
export const OTHER = "Autres";
/** Les dépenses ponctuelles (un projet, pas un coût de fonctionnement) : le seuil d'équilibre se lit aussi sans elles. */
export const ONE_OFF_POSTES = ["Développement sous-traité"];
/** Les postes qui font venir des clients : la publicité et le référencement. */
export const ACQUISITION_POSTES = ["Google Ads", "ChatGPT Ads", "Meta Ads", "SEO"];

const rules = (kind: ExpenseKind, poste: string, ...match: string[]): ExpenseRule[] => match.map((m) => ({ match: m, poste, kind }));

/** Les règles d'origine, dans l'ordre : la première qui colle gagne. */
export const DEFAULT_EXPENSE_RULES: ExpenseRule[] = [
  // Les frais GoCardless (quelques euros par prélèvement de client) citent le
  // versement qu'ils minorent (« TIMLCDEV-… ») : ils passent avant lui.
  ...rules("depense", "Banque & frais", "GOCARDLESS_FEE"),
  ...rules("ignore", "Transfert GoCardless → compte courant", "TIMLCDEV-"),
  ...rules("ignore", "Virement entre nos comptes", "VIR INST VERS LC DEV"),
  ...rules("ignore", "TVA reversée", "TVA"),
  // Le capital d'un emprunt remboursé n'est pas une charge ; ses intérêts et son assurance, si.
  ...rules("ignore", "Remboursement d'emprunt (capital)", "CAPITAL"),
  ...rules("impot", TAXES, "DGFIP", "DIRECTION GENERALE DES FIN", "SIE ", "CFE", "URSSAF"),
  ...rules("depense", "Google Ads", "GOOGLE ADS"),
  // Un abonnement ChatGPT ou l'API n'est pas de la publicité : il passe avant la règle des annonces.
  ...rules("depense", IT, "CHATGPT SUBSCR", "CHATGPT PLUS", "OPENAI *API", "OPENAI API"),
  ...rules("depense", "ChatGPT Ads", "OPENAI", "CHATGPT"),
  ...rules("depense", "Meta Ads", "FACEBK", "FACEBOOK", "META PLATFORMS"),
  ...rules("depense", "SEO", "LINKU"),
  // Ninety Digital prélève par GoCardless (une fois sous le nom « LUIS AFONSO ») : rangé dans
  // « Autres » pour l'instant (décision de Charlie, 30/10/2026). Les versements GoCardless vers
  // le compte courant sont écartés plus haut.
  ...rules("depense", OTHER, "NINETY DIGITAL", "GOCARDLESS"),
  ...rules("depense", "Développement sous-traité", "HORIZONTE"),
  ...rules("depense", "Comptable", "AVIZEO"),
  ...rules(
    "depense",
    IT,
    "DIGITALOCEAN",
    "DIGITAL OCEAN",
    "SENDINBLUE",
    "BREVO",
    "LEMLIST",
    "WP ENGINE",
    "WPENGINE",
    "LARAVEL",
    "OVH",
    "ELEVENLABS",
    "ELEVEN LABS",
    "APPLE",
    "GOOGLE WORKSPACE",
    "GOOGLE CLOUD",
    "COOKIEYES",
    "VERCEL",
    "SUPABASE",
    "GITHUB",
    "ANTHROPIC",
    "CLAUDE.AI",
    "NOTION",
    "FIGMA",
  ),
  ...rules("depense", "Réseau & événements", "FRENCH TECH", "FRENCHTECH", "WEB CCI"),
  ...rules("depense", "Juridique", "AVOCAT"),
  ...rules("depense", "Banque & frais", "OFFRE COMPTE", "COTISATION", "FRAIS", "COMMISSION", "SWAN", "INTERETS", "PRET PROFESSION"),
];

/** Une ligne du relevé, telle que Pennylane la donne (montant signé : négatif = sortie). */
export type BankTransaction = {
  id: string;
  date: string; // ISO jour
  label: string;
  amount: number;
  /** Catégories posées dans Pennylane, s'il y en a (leurs libellés). */
  categories: string[];
  /** Les mêmes, avec leur identifiant Pennylane et leur part de la transaction. */
  categoryRefs?: CategoryRef[];
  /** Part de TVA dans le montant TTC (0 : pas de TVA, 0,1667 : TVA à 20 %). */
  vatShare?: number;
};

/** Une catégorie Pennylane posée sur une dépense, et la part de la dépense qui lui revient (1 : tout). */
export type CategoryRef = { id: string; label: string; weight: number };

export type Expense = {
  id: string;
  date: string;
  month: string;
  /** Première ligne du libellé, sans la référence bancaire. */
  label: string;
  /** Montant HT, positif : ce que compte tout l'écran. */
  amount: number;
  /** Ce qui est sorti du compte (TTC), positif. */
  amountTTC: number;
  /** La TVA de la sortie (TTC − HT). */
  vat: number;
  poste: string;
  kind: ExpenseKind;
  /** Les catégories Pennylane de la dépense (vide : pas encore catégorisée). */
  categories: CategoryRef[];
};

/** Le libellé lisible : la première ligne, sans « (REF: …) ». */
export const cleanLabel = (label: string) =>
  label
    .split("\n")[0]
    .replace(/\(REF:.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

/** Les catégories Pennylane qui tombent dans un de nos postes (les autres gardent leur nom). */
const CATEGORY_POSTES: Record<string, string> = {
  Logiciels: IT,
  "Hébergements web": IT,
  "IT / Informatique": IT,
  "Matériels IT": IT,
};

export function classify(label: string, categories: string[], custom: ExpenseRule[]): { poste: string; kind: ExpenseKind } {
  const l = label.toUpperCase();
  for (const r of [...custom, ...DEFAULT_EXPENSE_RULES]) {
    const m = r.match.trim().toUpperCase();
    if (m && l.includes(m)) return { poste: r.poste.trim() || UNCLASSIFIED, kind: r.kind };
  }
  if (categories[0]) return { poste: CATEGORY_POSTES[categories[0]] ?? categories[0], kind: "depense" };
  return { poste: UNCLASSIFIED, kind: "depense" };
}

/** Les sorties d'argent, chacune dans son poste ; les entrées ne sont pas lues ici. */
export function classifyExpenses(tx: BankTransaction[], custom: ExpenseRule[] = []): Expense[] {
  return tx
    .filter((t) => t.amount < 0)
    .map((t) => ({
      id: t.id,
      date: t.date,
      month: t.date.slice(0, 7),
      label: cleanLabel(t.label),
      amount: round2(-t.amount * (1 - (t.vatShare ?? 0))),
      amountTTC: round2(-t.amount),
      vat: round2(-t.amount * (t.vatShare ?? 0)),
      categories: t.categoryRefs ?? [],
      ...classify(t.label, t.categories, custom),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export type ExpenseMonth = {
  /** Dépenses avant impôts. */
  expenses: number;
  taxes: number;
  byPoste: Record<string, number>;
};

/** Par mois : dépenses (avant impôts), impôts, et le détail par poste. Les « pas une dépense » ne comptent pas. */
export function expensesByMonth(expenses: Expense[]): Map<string, ExpenseMonth> {
  const out = new Map<string, ExpenseMonth>();
  for (const e of expenses) {
    if (e.kind === "ignore") continue;
    const m = out.get(e.month) ?? { expenses: 0, taxes: 0, byPoste: {} };
    if (e.kind === "impot") m.taxes = round2(m.taxes + e.amount);
    else {
      m.expenses = round2(m.expenses + e.amount);
      m.byPoste[e.poste] = round2((m.byPoste[e.poste] ?? 0) + e.amount);
    }
    out.set(e.month, m);
  }
  return out;
}
