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
} as const;

export type ProfilKey = keyof typeof LICENCE_BASE_PRICES;

/** Ordre + libellés d'affichage des profils. */
export const PROFILS: { key: ProfilKey; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "conducteur", label: "Conducteur de travaux" },
  { key: "chefChantier", label: "Chef de chantier" },
  { key: "chefEquipe", label: "Chef d'équipe" },
  { key: "compagnon", label: "Compagnon" },
];

/**
 * Le RANG d'un profil dans la hiérarchie — admin 1, conducteur 2, chef de
 * chantier 3, chef d'équipe 4, compagnon 5.
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
export function tarifsMarkdown(licences?: Record<string, number | undefined> | null): string {
  const lignes = licenceLinesOf(licences).map((l) => ({
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
      chosen.length ? `- ${l.label} : ${l.qty} × ${l.price} €` : `- ${l.label} : ${l.price} €`,
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
export function computeClientCA(lines: LicenceLine[]) {
  const totalLicences = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const caHT = lines.reduce((s, l) => s + (Number(l.qty) || 0) * effectiveUnitPrice(l), 0);
  const suggestedDiscountPct = volumeDiscountPct(totalLicences);
  return { totalLicences, caHT: round2(caHT), suggestedDiscountPct };
}
