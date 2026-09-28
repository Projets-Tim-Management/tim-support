import { dayKey } from "@/core/lib/dates";
import { legalFormLabel } from "@/modules/partner/lib/legal-forms";
import { PROFILS, effectiveUnitPrice, licenceLinesOf } from "@/modules/partner/lib/pricing";

/**
 * Les VARIABLES du contrat, calculées depuis la fiche client et les paramètres
 * (page Paramètres → « Contrat »). Module pur : l'aperçu, la génération du PDF
 * et les tests lisent la même table.
 *
 * Une variable absente vaut `null` : le rendu l'affiche comme un trou à
 * compléter (« [à compléter] », surligné), jamais comme une chaîne vide qui
 * passerait inaperçue dans un contrat.
 */

/** Durées d'engagement proposées (mois). */
export const ENGAGEMENT_OPTIONS = [
  { label: "1 mois", value: "1" },
  { label: "3 mois", value: "3" },
  { label: "6 mois", value: "6" },
  { label: "12 mois", value: "12" },
  { label: "24 mois", value: "24" },
  { label: "36 mois", value: "36" },
];

const WORDS: Record<number, string> = {
  1: "un",
  2: "deux",
  3: "trois",
  4: "quatre",
  5: "cinq",
  6: "six",
  7: "sept",
  8: "huit",
  9: "neuf",
  10: "dix",
  12: "douze",
  15: "quinze",
  18: "dix-huit",
  24: "vingt-quatre",
  30: "trente",
  36: "trente-six",
  48: "quarante-huit",
  60: "soixante",
};

/** 12 → « douze (12) » ; un nombre sans mot connu reste en chiffres. */
export const inWords = (n: number): string => (WORDS[n] ? `${WORDS[n]} (${n})` : String(n));

/** 12 mois → « douze (12) mois » ; 24 → « vingt-quatre (24) mois ». */
export const monthsText = (months: number): string => `${inWords(months)} mois`;

/** 2 → « deux (2) ans » ; 1 → « un (1) an ». */
export const yearsText = (years: number): string => `${inWords(years)} ${years > 1 ? "ans" : "an"}`;

/** « 1 234,50 » — montant français, sans le symbole (le texte porte « € HT »). */
export const amount = (n: number): string =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);

/** SIREN → numéro RCS lisible (« 811 756 721 »). */
export const rcsNumber = (siren?: string | null): string | null => {
  const d = (siren ?? "").replace(/\s+/g, "");
  return /^\d{9}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : null;
};

/**
 * Les valeurs livrées avec le code : défauts de la page Contrat (et de son
 * amorçage), et repli quand la page ne les donne pas.
 */
export const CONTRACT_DEFAULTS = {
  noticePeriod: "un (1) mois",
  priceNoticeDelay: "quinze (15) jours",
  debitDay: 5,
  territory: "France",
  /** Le prestataire, quand la page Entreprise ne le nomme pas. */
  providerName: "LC DEV",
} as const;

/**
 * Ce dont les variables ont besoin hors fiche : l'identité du prestataire et sa
 * banque (page Système → Entreprise), les valeurs par défaut (page Contrat).
 */
export type ContractSettings = {
  provider?: Partial<Record<"denomination" | "formeSociale" | "adresse" | "villeRcs" | "numeroRcs" | "representant" | "qualite" | "tribunal", string | null>>;
  bank?: { iban?: string | null; bic?: string | null };
  defaults?: {
    noticePeriod?: string | null;
    priceNoticeDelay?: string | null;
    debitDay?: number | null;
    territory?: string | null;
  };
};

export type ContractVars = Record<string, string | boolean | null>;

/** Une ligne du tableau de l'Annexe 2 : profil et prix unitaire (remise déduite). */
export type PriceRow = { profile: string; unitPrice: string };

/** Libellés et ordre du contrat (Annexe 2), qui diffèrent de ceux de la fiche. */
const CONTRACT_PROFILES: { key: (typeof PROFILS)[number]["key"]; label: string }[] = [
  { key: "admin", label: "Administrateur" },
  { key: "conducteur", label: "Conducteur de travaux" },
  { key: "chefEquipe", label: "Chef d'équipe" },
  { key: "chefChantier", label: "Chef de chantier" },
  { key: "compagnon", label: "Compagnon" },
];

export function contractPriceRows(client: Record<string, unknown>): PriceRow[] {
  const lines = licenceLinesOf(client.licences as never);
  const byKey = new Map(lines.map((l) => [l.key, l]));
  // Tous les profils tarifés, dans l'ordre du modèle : un profil sans licence
  // aujourd'hui garde son prix négocié — le client peut en ajouter demain.
  return CONTRACT_PROFILES.map((p) => {
    const line = byKey.get(p.key);
    const price = line ? effectiveUnitPrice(line) : undefined;
    return {
      profile: p.label,
      unitPrice: price != null && price > 0 ? `${amount(price)} € HT par mois et par utilisateur` : "",
    };
  }).filter((r) => r.unitPrice);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export function buildContractVars(client: Record<string, unknown>, settings: ContractSettings): ContractVars {
  const p = settings.provider ?? {};
  const d = settings.defaults ?? {};
  const engagement = num(client.engagementMonths);
  const preferential = num(client.preferentialYears);
  const capital = num(client.shareCapital);
  const fee = num(client.integrationFee);
  const representative = [str(client.representativeFirstName), str(client.representativeLastName)?.toUpperCase()]
    .filter(Boolean)
    .join(" ");

  return {
    "client.denomination": str(client.raisonSociale) ?? str(client.companyName),
    "client.formeSociale": legalFormLabel(str(client.legalForm)),
    "client.capital": capital != null && capital > 0 ? amount(capital) : null,
    "client.adresse": [str(client.billingAddress), str(client.billingAddressComplement)].filter(Boolean).join(", ") || null,
    "client.villeRcs": str(client.rcsCity),
    "client.numeroRcs": rcsNumber(str(client.siren)),
    "representant.nom": representative || null,
    "representant.qualite": str(client.representativeRole),

    "contrat.dateDebut": longDate(isoDay(client.contractStartDate)),
    "engagement.duree": engagement ? monthsText(engagement) : null,
    "denonciation.preavis": str(d.noticePeriod) ?? CONTRACT_DEFAULTS.noticePeriod,
    "tarifs.delaiInformation": str(d.priceNoticeDelay) ?? CONTRACT_DEFAULTS.priceNoticeDelay,
    territoire: str(client.contractTerritory) ?? str(d.territory) ?? CONTRACT_DEFAULTS.territory,
    "tarifPreferentiel.duree": preferential && preferential > 0 ? yearsText(preferential) : null,
    "prelevement.jour": String(num(d.debitDay) ?? CONTRACT_DEFAULTS.debitDay),
    "integration.montant": fee != null ? amount(fee) : null,
    "integration.offerte": client.integrationOffered === true,

    "prestataire.denomination": str(p.denomination),
    "prestataire.formeSociale": str(p.formeSociale),
    "prestataire.adresse": str(p.adresse),
    "prestataire.villeRcs": str(p.villeRcs),
    "prestataire.numeroRcs": str(p.numeroRcs),
    "prestataire.representant": str(p.representant),
    "prestataire.qualite": str(p.qualite),
    "prestataire.tribunal": str(p.tribunal),
    "banque.iban": str(settings.bank?.iban),
    "banque.bic": str(settings.bank?.bic),
  };
}

/**
 * Où se remplit chaque variable — pour la liste « Informations manquantes »
 * du bloc Contrat : dire QUOI manque ne suffit pas, il faut dire OÙ le saisir.
 */
const FICHE_BILLING = "Fiche → Facturation client (ou le client, étape « Votre entreprise »)";
const FICHE_CONTRACT = "Préparer le contrat → Informations → Conditions commerciales";
const COMPANY = "Système → Entreprise";
const FICHE_LICENCES = "Fiche → Licences par profil";
const SETTINGS_DEFAULTS = "Système → Contrat → Valeurs par défaut";

/** Le tableau des tarifs (Annexe 2) : « manquant » quand aucune licence n'a de prix. */
export const PRICES_VAR = "licences.tableau";

const VAR_LABELS: Record<string, { label: string; where: string }> = {
  "client.denomination": { label: "Raison sociale", where: FICHE_BILLING },
  // « Autre » sur la fiche ne dit pas laquelle : on la précise pour le contrat.
  "client.formeSociale": { label: "Forme sociale", where: `${FICHE_BILLING} — si « Autre » : Préparer le contrat → Informations` },
  "client.capital": { label: "Capital social", where: FICHE_BILLING },
  "client.adresse": { label: "Adresse du siège", where: FICHE_BILLING },
  "client.villeRcs": { label: "Ville du RCS", where: FICHE_BILLING },
  "client.numeroRcs": { label: "SIREN (numéro RCS)", where: FICHE_BILLING },
  "representant.nom": { label: "Représentant légal", where: FICHE_BILLING },
  "representant.qualite": { label: "Qualité du représentant", where: FICHE_BILLING },
  "contrat.dateDebut": { label: "Date de début du contrat", where: FICHE_CONTRACT },
  "engagement.duree": { label: "Durée d'engagement", where: FICHE_CONTRACT },
  "tarifPreferentiel.duree": { label: "Durée du tarif préférentiel", where: FICHE_CONTRACT },
  "integration.montant": { label: "Frais d'intégration", where: FICHE_CONTRACT },
  "integration.offerte": { label: "Frais d'intégration offerts", where: FICHE_CONTRACT },
  territoire: { label: "Territoire", where: FICHE_CONTRACT },
  "denonciation.preavis": { label: "Préavis de dénonciation", where: SETTINGS_DEFAULTS },
  "tarifs.delaiInformation": { label: "Délai d'information tarifaire", where: SETTINGS_DEFAULTS },
  "prelevement.jour": { label: "Jour de prélèvement", where: SETTINGS_DEFAULTS },
  [PRICES_VAR]: { label: "Licences (tarifs de l'Annexe 2)", where: FICHE_LICENCES },
  "banque.iban": { label: "IBAN", where: COMPANY },
  "banque.bic": { label: "BIC", where: COMPANY },
  "prestataire.denomination": { label: "Dénomination du prestataire", where: COMPANY },
  "prestataire.formeSociale": { label: "Forme sociale du prestataire", where: COMPANY },
  "prestataire.adresse": { label: "Siège du prestataire", where: COMPANY },
  "prestataire.villeRcs": { label: "Ville du RCS du prestataire", where: COMPANY },
  "prestataire.numeroRcs": { label: "Numéro RCS du prestataire", where: COMPANY },
  "prestataire.representant": { label: "Représentant du prestataire", where: COMPANY },
  "prestataire.qualite": { label: "Qualité du représentant du prestataire", where: COMPANY },
  "prestataire.tribunal": { label: "Tribunal compétent", where: COMPANY },
};

export const varLabel = (name: string) => VAR_LABELS[name] ?? { label: name, where: "—" };

/**
 * L'étape « Informations » de la préparation du contrat : les variables,
 * regroupées et dans l'ordre où on les relit. Une variable absente de ces
 * groupes (ajoutée au modèle plus tard) tombe dans « Autres ».
 */
export const VAR_GROUPS: { title: string; names: string[] }[] = [
  {
    title: "Le client",
    names: [
      "client.denomination",
      "client.formeSociale",
      "client.capital",
      "client.adresse",
      "client.villeRcs",
      "client.numeroRcs",
      "representant.nom",
      "representant.qualite",
    ],
  },
  {
    title: "Conditions commerciales",
    names: [
      "contrat.dateDebut",
      "engagement.duree",
      "tarifPreferentiel.duree",
      "integration.offerte",
      "integration.montant",
      "territoire",
      "denonciation.preavis",
      "tarifs.delaiInformation",
      "prelevement.jour",
    ],
  },
  {
    title: "Le prestataire",
    names: [
      "prestataire.denomination",
      "prestataire.formeSociale",
      "prestataire.adresse",
      "prestataire.villeRcs",
      "prestataire.numeroRcs",
      "prestataire.representant",
      "prestataire.qualite",
      "prestataire.tribunal",
      "banque.iban",
      "banque.bic",
    ],
  },
];

/**
 * Les conditions commerciales se saisissent en valeurs brutes (une durée, un
 * montant…) : les variables qui en découlent ne se retapent pas à la main.
 */
export const CONTRACT_PARAM_KEYS = [
  "contractStartDate",
  "engagementMonths",
  "preferentialYears",
  "integrationFee",
  "integrationOffered",
  "contractTerritory",
] as const;
export type ContractParams = Partial<Record<(typeof CONTRACT_PARAM_KEYS)[number], string | number | boolean | null>>;
export const PARAM_DERIVED_VARS = new Set([
  "contrat.dateDebut",
  "engagement.duree",
  "tarifPreferentiel.duree",
  "integration.montant",
  "integration.offerte",
  "territoire",
]);

/** Les conditions commerciales d'une fiche (le premier contrat part de là). */
export const paramsFromClient = (client: Record<string, unknown>): ContractParams => ({
  ...Object.fromEntries(CONTRACT_PARAM_KEYS.map((k) => [k, (client[k] as ContractParams[typeof k]) ?? null])),
  contractStartDate: isoDay(client.contractStartDate),
});

/**
 * Une date (ISO complète ou jour) → « AAAA-MM-JJ », le jour à Paris ; null si
 * absente ou illisible. Un jour impossible (« 2026-02-31 ») déborde sur le mois
 * suivant : le comparer à l'entrée dit s'il existe.
 */
export function isoDay(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « AAAA-MM-JJ » → « 1er octobre 2026 » (sans passer par un fuseau). */
export function longDate(day: string | null): string | null {
  const m = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = Number(m[3]);
  return `${d === 1 ? "1er" : d} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Les variables citées par le texte (`{{x}}` et `[[si x]]`), hors blocs spéciaux. */
export function usedVariables(bodies: string[]): Set<string> {
  const used = new Set<string>();
  for (const body of bodies) {
    for (const m of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}|\[\[si\s+([\w.]+)\]\]/g)) {
      const name = m[1] ?? m[2];
      if (name !== PRICES_VAR && name !== "signatures") used.add(name);
    }
  }
  return used;
}

/**
 * Les valeurs saisies pour CE contrat priment sur la fiche — sans jamais la
 * modifier. Une valeur vide saisie exprès reste vide (et donc « à compléter »).
 */
export function mergeContractVars(base: ContractVars, overrides: Record<string, unknown> | null | undefined): ContractVars {
  const out: ContractVars = { ...base };
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (typeof v === "string") out[k] = v.trim() || null;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}
