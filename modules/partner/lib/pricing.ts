/**
 * Barème du programme partenaire (PDF « Programme partenaire 2026 »).
 *
 * Les prix licence /mois par profil sont des BASES par défaut : ils peuvent
 * être modifiés client par client (tarif négocié). Le CA se calcule à partir
 * des prix réellement saisis ; la commission du partenaire s'applique ensuite
 * sur le total HT (CA payé, après remise volume dégressive).
 */
import { round2 } from "./format";

/** Ce qu'il faut savoir d'une opportunité pour dire si elle est facturée. */
export type BillableFacts = {
  clientStatus?: string | null;
  /** Date de début de contrat — c'est ELLE qui enclenche l'abonnement. */
  contractStartDate?: string | null;
};

/**
 * Un client ne compte dans le CA et les commissions qu'une fois l'affaire
 * **Gagnée** ET son **contrat commencé**.
 *
 * Deux conditions, parce que ce sont deux faits distincts : gagner l'affaire se
 * décide (le statut), le contrat démarre à une date (souvent le 1er du mois
 * suivant). Facturer dès la bascule du statut avancerait l'abonnement de
 * plusieurs semaines dans les tuiles « CA / mois » et dans la commission du
 * partenaire — de l'argent annoncé avant d'être dû.
 *
 * Un lead du pipeline a déjà des licences saisies (l'offre en préparation) mais
 * ne paie rien ; un résilié/archivé ne paie plus (la commission s'interrompt à
 * la résiliation, cf. PDF).
 *
 * Source de vérité unique : les tuiles de la fiche partenaire, la colonne
 * « Commission / mois » et la ligne de total de la liste s'y réfèrent toutes.
 */
export const isBillableClient = (facts?: BillableFacts | null, now: Date = new Date()): boolean => {
  if (facts?.clientStatus !== "actif") return false;
  const start = facts?.contractStartDate ? Date.parse(facts.contractStartDate) : NaN;
  // Contrat à venir → pas encore facturé (et date illisible → on ne facture pas).
  return !Number.isNaN(start) && start <= now.getTime();
};

/** Prix de base /mois par profil (€ HT) — valeurs par défaut, surchargeables. */
export const LICENCE_BASE_PRICES = {
  admin: 39,
  conducteur: 32,
  chefChantier: 18,
  chefEquipe: 16,
  compagnon: 8,
  // Le personnel de bureau, sur le web (catalogue Pennylane LB-Tim, 16/10/2026).
  bureau: 8,
  // Le module Stock : le magasinier (grille « Offre » du 16/11/2026, l'écart de 40 € entre Planning et Planning + Stock).
  magasinier: 40,
  // Consultation sur mobile, au plus bas prix (catalogue Pennylane LV-Tim, 16/10/2026).
  visuel: 1.9,
} as const;

export type ProfilKey = keyof typeof LICENCE_BASE_PRICES;

/** Ordre + libellés d'affichage des profils. */
export const PROFILS: { key: ProfilKey; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "conducteur", label: "Conducteur de travaux" },
  { key: "chefChantier", label: "Chef de chantier" },
  { key: "chefEquipe", label: "Chef d'équipe" },
  { key: "compagnon", label: "Compagnon" },
  { key: "bureau", label: "Bureau" },
  { key: "magasinier", label: "Magasinier" },
  { key: "visuel", label: "Visuel" },
];

/**
 * Les profils arrivés après la grille d'origine (16/10/2026). Une ligne à 0
 * de ces profils n'entre pas dans la signature d'une fiche (voir
 * history.detailSignature) : leur arrivée ne doit ni écrire une ligne
 * d'historique sur toutes les fiches, ni repasser les mois validés « à revalider ».
 */
export const LATE_PROFILES: ReadonlySet<string> = new Set(["bureau", "magasinier", "visuel"]);

/**
 * LES MODULES DE L'OFFRE (grille « Offre » de la vitrine, 16/11/2026) : ce que le prospect prend, coché pendant le
 * rendez-vous pour lui donner le prix en face. Seuls changent le prix de l'Admin et la ligne Magasinier ; les autres
 * profils et la remise volume restent ceux de toujours. Aucun module coché : la fiche se calcule comme avant.
 *
 *   Planning ou Pointage → Admin 29 € · les deux → 39 € · Stock seul → Admin 9 €
 *   Stock → + un Magasinier à 40 € (compté d'office, d'autres s'ajoutent ; il compte dans le volume de remise)
 */
export const MODULES = [
  { key: "planning", field: "modulePlanning", label: "Planning", icon: "📅" },
  { key: "pointage", field: "modulePointage", label: "Pointage", icon: "⏱️" },
  { key: "stock", field: "moduleStock", label: "Stock", icon: "📦" },
] as const;
export type ModuleKey = (typeof MODULES)[number]["key"];
export type ModuleChoice = Partial<Record<ModuleKey, boolean>>;

/** Le prix de l'Admin selon les modules cochés ; null si aucun (le prix de la fiche ne bouge pas). Pur. */
export function adminPriceForModules(m: ModuleChoice): number | null {
  if (!m.planning && !m.pointage && !m.stock) return null;
  if (!m.planning && !m.pointage) return 9;
  return m.planning && m.pointage ? 39 : 29;
}

/** Les modules cochés d'une fiche (groupe `licences`). Pur. */
export const modulesOf = (licences?: Record<string, unknown> | null): ModuleChoice =>
  Object.fromEntries(MODULES.map((m) => [m.key, licences?.[m.field] === true]));

/**
 * L'offre évoquée en rendez-vous, en une ligne, pour les agents (« Planning + Stock · 2 magasiniers · paiement
 * annuel −10 % ») ; null si aucun module n'est coché ni le paiement annuel. Pur.
 */
export function offerSummary(licences?: Record<string, unknown> | null, billingPeriod?: string | null): string | null {
  const m = modulesOf(licences);
  const names = MODULES.filter((x) => m[x.key]).map((x) => x.label);
  const mag = Number(licences?.magasinierQty ?? 0) || 0;
  const annual = isAnnualBilling(billingPeriod);
  if (!names.length && !annual) return null;
  return [
    names.length ? names.join(" + ") : null,
    mag ? `${mag} magasinier${mag > 1 ? "s" : ""}` : null,
    annual ? `paiement annuel −${ANNUAL_DISCOUNT_PCT} %` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Paiement annuel : −10 % sur tout l'abonnement, après la remise volume (grille « Offre », 16/11/2026). Une seule
 * information le décide : la périodicité de facturation « annuelle » de la fiche. Signé ainsi, c'est le CA réel
 * (CA payé, commissions, historique, contrôle Pennylane) ; les prix par profil, eux, restent ceux du tableau.
 */
export const ANNUAL_DISCOUNT_PCT = 10;
export const isAnnualBilling = (billingPeriod?: string | null): boolean => billingPeriod === "annuelle";
/** Le coefficient de l'abonnement : 0,9 payé à l'année, 1 sinon. */
export const billingFactor = (billingPeriod?: string | null): number => (isAnnualBilling(billingPeriod) ? 1 - ANNUAL_DISCOUNT_PCT / 100 : 1);

/** Le prix d'un abonnement mensuel HT, payé au mois ou à l'année. Pur. */
export function annualOffer(monthlyHT: number) {
  const monthly = round2(monthlyHT * (1 - ANNUAL_DISCOUNT_PCT / 100));
  return { monthly, saving: round2(monthlyHT - monthly), yearly: round2(monthly * 12) };
}

/**
 * Les prestations ponctuelles du catalogue (Pennylane), pour le MÉMO de la
 * fiche prospect : ce qu'on a évoqué pendant l'appel. Elles ne comptent ni
 * dans le CA mensuel, ni dans l'e-mail d'offre, ni dans le contrat (Charlie,
 * 16/10/2026).
 */
export const PRESTATIONS = [
  { key: "miseEnPlace", label: "Mise en place & Formation (forfait unique)", unit: "forfait", price: 2000, ref: "M-Tim" },
  { key: "formationPlace", label: "Formation sur place", unit: "unité", price: 800, ref: "FP-Tim" },
  { key: "formationDistance", label: "Formation à distance", unit: "unité", price: 400, ref: "FD-Tim" },
  { key: "dev", label: "Développement sur mesure", unit: "jour", price: 250, ref: "DS-Tim" },
  { key: "devApi", label: "Développement sur mesure — API", unit: "jour", price: 400, ref: "DA-Tim" },
] as const;
export type PrestationKey = (typeof PRESTATIONS)[number]["key"];

/**
 * Les profils qui ne comptent PAS dans le volume de la remise dégressive : 50
 * licences Visuel à 2,20 € ne doivent pas faire baisser le prix conseillé des
 * licences Admin ou Conducteur (Charlie, 16/10/2026). Elles comptent quand
 * même dans le total de licences affiché.
 */
export const OUT_OF_VOLUME: ReadonlySet<ProfilKey> = new Set<ProfilKey>(["visuel"]);

/** Le nombre de licences qui compte pour le palier de remise. Pure. */
export const volumeQty = (lines: { key?: string; qty: number }[]): number =>
  lines.reduce((s, l) => s + (l.key && OUT_OF_VOLUME.has(l.key as ProfilKey) ? 0 : Number(l.qty) || 0), 0);

/**
 * Le RANG d'un profil dans la hiérarchie — admin 1, conducteur 2, chef de
 * chantier 3, chef d'équipe 4, compagnon 5, bureau 6, visuel 7.
 *
 * `PROFILS` porte déjà cet ordre : la grille tarifaire se lit du plus cher au
 * moins cher, qui est aussi l'ordre hiérarchique. On en fait une fonction pour
 * que les LISTES DE PERSONNES s'y rangent aussi — accès de l'espace client,
 * récapitulatif par e-mail, feuille d'impression. Triées par nom, elles
 * mélangeaient un compagnon entre deux conducteurs, et il fallait relire
 * chaque ligne pour retrouver qui fait quoi.
 *
 * Profil inconnu ou vide : à la fin, jamais au milieu.
 */
export const profileRank = (key?: string | null): number => {
  const i = PROFILS.findIndex((p) => p.key === key);
  return i === -1 ? PROFILS.length : i;
};

/**
 * Grille tarifaire d'un client, en Markdown, pour la variable `{{tarifs}}`.
 *
 * Ce sont les prix RÉELLEMENT saisis sur sa fiche (onglet « Licences par
 * profil ») qui priment : un tarif négocié annoncé au prix public dans un
 * e-mail, c'est une promesse qu'on ne tient pas — ou une remise offerte deux
 * fois. À défaut de saisie, le prix de base fait foi.
 *
 * Seuls les profils dont une QUANTITÉ a été saisie sont listés quand il y en a :
 * annoncer cinq lignes à un client qui n'en veut que deux noie l'offre. Sans
 * aucune quantité (le cas d'un premier contact), on liste toute la grille.
 */
/** Un prix unitaire à la française : « 39 », mais « 2,20 » (jamais « 2.2 », vu dans un e-mail le 16/10/2026). */
const CENTS = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const unitPrice = (n: number): string => (Number.isInteger(n) ? String(n) : CENTS.format(n));

export function tarifsMarkdown(licences?: Record<string, number | boolean | undefined> | null): string {
  // Le Magasinier n'existe qu'avec le module Stock (16/11/2026) : pas dans la grille d'un prospect qui ne l'a pas pris.
  const withStock = licences?.moduleStock === true;
  const lignes = licenceLinesOf(licences as Record<string, number | undefined> | null)
    .filter((l) => l.key !== "magasinier" || withStock || l.qty > 0)
    .map((l) => ({
    label: l.label,
    qty: l.qty,
    // Le prix annoncé est celui qui sera facturé : remise de ligne déduite.
    price: effectiveUnitPrice(l),
  }));
  const chosen = lignes.filter((l) => l.qty > 0);
  const shown = chosen.length ? chosen : lignes;

  return shown
    .map((l) =>
      // La quantité n'apparaît que si elle a été décidée : « 3 × » sur une offre
      // encore ouverte engagerait un volume dont personne n'a parlé.
      chosen.length ? `- ${l.label} : ${l.qty} × ${unitPrice(l.price)} €` : `- ${l.label} : ${unitPrice(l.price)} €`,
    )
    .join("\n");
}

/**
 * Remise volume (%) selon le nombre TOTAL de licences — grille officielle TIM :
 *   1–5 → 0 % · 6–15 → 10 % · 16–25 → 25 % · 26–50 → 30 % · 51–100 → 35 % · 101+ → 45 %
 */
export function volumeDiscountPct(totalLicences: number): number {
  if (totalLicences >= 101) return 45;
  if (totalLicences >= 51) return 35;
  if (totalLicences >= 26) return 30;
  if (totalLicences >= 16) return 25;
  if (totalLicences >= 6) return 10;
  return 0;
}

/** Prix unitaire CONSEILLÉ à un palier de volume (indicatif ; le partenaire
 *  reste libre de saisir le prix qu'il veut). */
export function suggestedUnitPrice(basePrice: number, discountPct: number): number {
  return round2(basePrice * (1 - discountPct / 100));
}

/**
 * Une ligne de licences : la quantité, le prix unitaire saisi, et une remise
 * FACULTATIVE sur cette ligne — en % ou en € par licence (l'une OU l'autre ;
 * l'interface n'en propose qu'une à la fois). Ce sont les mêmes remises que
 * Pennylane pose sur une ligne d'abonnement : ce qui permet d'écrire sur la
 * fiche exactement ce qui est facturé, y compris « 1 chef de chantier offert ».
 */
export type LicenceLine = { qty: number; price: number; discountPct?: number; discountAmount?: number };

/** Prix unitaire réellement facturé : le prix saisi, remise déduite, jamais négatif. */
export function effectiveUnitPrice(l: Pick<LicenceLine, "price" | "discountPct" | "discountAmount">): number {
  const price = Number(l.price) || 0;
  const amount = Number(l.discountAmount) || 0;
  const pct = Number(l.discountPct) || 0;
  return round2(Math.max(0, price - amount) * (1 - Math.min(100, Math.max(0, pct)) / 100));
}

/**
 * Les lignes d'une fiche, lues dans le groupe `licences` (adminQty, adminPrice,
 * adminDiscountPct, adminDiscountAmount, …), dans l'ordre des profils. Un seul
 * endroit sait comment ces champs se nomment.
 */
export function licenceLinesOf(
  licences?: Record<string, number | null | undefined> | null,
): (LicenceLine & { key: ProfilKey; label: string })[] {
  return PROFILS.map((p) => ({
    key: p.key,
    label: p.label,
    qty: Number(licences?.[`${p.key}Qty`] ?? 0) || 0,
    price: Number(licences?.[`${p.key}Price`] ?? LICENCE_BASE_PRICES[p.key]) || 0,
    discountPct: Number(licences?.[`${p.key}DiscountPct`] ?? 0) || 0,
    discountAmount: Number(licences?.[`${p.key}DiscountAmount`] ?? 0) || 0,
  }));
}

/**
 * Totaux d'un client à partir des lignes { quantité, prix unitaire SAISI, remise }.
 * - Le CA HT = Σ (quantité × prix effectif) : les prix fixés par le partenaire
 *   (il a le dernier mot), moins la remise qu'il a lui-même posée sur la ligne.
 *   La remise VOLUME du barème, elle, n'est jamais appliquée d'office.
 * - `suggestedDiscountPct` = remise volume du barème, purement INDICATIVE.
 */
export function computeClientCA(lines: (LicenceLine & { key?: string })[], billingPeriod?: string | null) {
  const totalLicences = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const brut = lines.reduce((s, l) => s + (Number(l.qty) || 0) * effectiveUnitPrice(l), 0);
  // Le palier de remise se compte hors licences Visuel (voir OUT_OF_VOLUME).
  const suggestedDiscountPct = volumeDiscountPct(volumeQty(lines));
  // `caHT` : ce que le client paie par mois — paiement annuel déduit (−10 %) ; `caBrut` : avant.
  return { totalLicences, caBrut: round2(brut), caHT: round2(brut * billingFactor(billingPeriod)), suggestedDiscountPct };
}
