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
export const isBillableClient = (facts?: BillableFacts | null): boolean => {
  if (facts?.clientStatus !== "actif") return false;
  const start = facts?.contractStartDate ? Date.parse(facts.contractStartDate) : NaN;
  // Contrat à venir → pas encore facturé (et date illisible → on ne facture pas).
  return !Number.isNaN(start) && start <= Date.now();
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
  { key: "conducteur", label: "Conducteur" },
  { key: "chefChantier", label: "Chef de chantier" },
  { key: "chefEquipe", label: "Chef d'équipe" },
  { key: "compagnon", label: "Compagnon" },
];

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
  const lignes = PROFILS.map((p) => ({
    label: p.label,
    qty: Number(licences?.[`${p.key}Qty`] ?? 0),
    price: Number(licences?.[`${p.key}Price`] ?? LICENCE_BASE_PRICES[p.key]),
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
