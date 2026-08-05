/**
 * Barème du programme partenaire (PDF « Programme partenaire 2026 »).
 *
 * Les prix licence /mois par profil sont des BASES par défaut : ils peuvent
 * être modifiés client par client (tarif négocié). Le CA se calcule à partir
 * des prix réellement saisis ; la commission du partenaire s'applique ensuite
 * sur le total HT (CA payé, après remise volume dégressive).
 */
import { round2 } from "./format";

/**
 * Un client ne compte dans le CA et les commissions que s'il est **Actif**.
 *
 * Un prospect ou un client « en cours » a déjà des licences saisies (l'offre en
 * préparation) mais ne paie encore rien ; un résilié/archivé ne paie plus (la
 * commission s'interrompt à la résiliation, cf. PDF). Les compter gonflerait un
 * CA « / mois » qui n'est pas encaissé.
 *
 * Source de vérité unique : les tuiles de la fiche partenaire, la colonne
 * « Commission / mois » et la ligne de total de la liste s'y réfèrent toutes.
 */
export const isBillableClient = (clientStatus?: string | null) => clientStatus === "actif";

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
  { key: "conducteur", label: "Conducteur" },
  { key: "chefChantier", label: "Chef de chantier" },
  { key: "chefEquipe", label: "Chef d'équipe" },
  { key: "compagnon", label: "Compagnon" },
];

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

export type LicenceLine = { qty: number; price: number };

/**
 * Totaux d'un client à partir des lignes { quantité, prix unitaire SAISI }.
 * - Le CA HT = Σ (quantité × prix saisi) : ce sont les prix fixés par le
 *   partenaire (il a le dernier mot) → AUCUNE remise n'est appliquée d'office.
 * - `suggestedDiscountPct` = remise volume du barème, purement INDICATIVE.
 */
export function computeClientCA(lines: LicenceLine[]) {
  const totalLicences = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const caHT = lines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0),
    0,
  );
  const suggestedDiscountPct = volumeDiscountPct(totalLicences);
  return { totalLicences, caHT: round2(caHT), suggestedDiscountPct };
}
