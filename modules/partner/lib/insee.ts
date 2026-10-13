import { legalFormFromInsee, type LegalForm } from "@/modules/partner/lib/legal-forms";
import { isNafCode } from "@/modules/partner/lib/naf";

/**
 * Recherche d'entreprise dans l'API Sirene de l'INSEE — partagée par la
 * recherche du back-office (api/insee/search) et le préremplissage de l'espace
 * client (étape « Votre entreprise »).
 */

const BASE = process.env.INSEE_API_BASE || "https://api.insee.fr/api-sirene/3.11";
const KEY_HEADER = process.env.INSEE_API_KEY_HEADER || "X-INSEE-Api-Key-Integration";

export const isInseeConfigured = (): boolean => Boolean(process.env.INSEE_API_KEY);

type InseeAddress = {
  numeroVoieEtablissement?: string;
  typeVoieEtablissement?: string;
  libelleVoieEtablissement?: string;
  codePostalEtablissement?: string;
  libelleCommuneEtablissement?: string;
};
type InseeUnite = {
  denominationUniteLegale?: string;
  nomUniteLegale?: string;
  prenom1UniteLegale?: string;
  categorieJuridiqueUniteLegale?: string;
  activitePrincipaleUniteLegale?: string | null;
  nomenclatureActivitePrincipaleUniteLegale?: string | null;
};
type InseePeriode = {
  activitePrincipaleEtablissement?: string | null;
  nomenclatureActivitePrincipaleEtablissement?: string | null;
};
type InseeEtab = {
  siret?: string;
  siren?: string;
  uniteLegale?: InseeUnite;
  adresseEtablissement?: InseeAddress;
  /** La plus récente en tête. */
  periodesEtablissement?: InseePeriode[];
};

export type InseeResult = {
  siret: string | null;
  siren: string | null;
  denomination: string;
  adresse: string;
  codePostal: string | null;
  ville: string | null;
  /** Forme juridique déduite de la catégorie INSEE. */
  formeJuridique: LegalForm | null;
  /** Code NAF rév. 2 (« 43.22A »), `null` si absent ou d'une autre nomenclature. */
  naf: string | null;
};

/** Le code seulement s'il est en NAF rév. 2 et connu de notre table. */
const nafRev2 = (code?: string | null, nomenclature?: string | null): string | null =>
  nomenclature === "NAFRev2" && isNafCode(code) ? (code as string) : null;

/**
 * `bySiret` : la saisie visait un établissement précis — son activité prime
 * sur celle de l'unité légale (un siège administratif n'a pas le métier de
 * l'agence qu'on facture).
 */
function normalize(e: InseeEtab, bySiret: boolean): InseeResult {
  const u = e.uniteLegale ?? {};
  const a = e.adresseEtablissement ?? {};
  const denomination =
    u.denominationUniteLegale ||
    [u.prenom1UniteLegale, u.nomUniteLegale].filter(Boolean).join(" ") ||
    "—";
  const voie = [a.numeroVoieEtablissement, a.typeVoieEtablissement, a.libelleVoieEtablissement]
    .filter(Boolean)
    .join(" ");
  const ville = [a.codePostalEtablissement, a.libelleCommuneEtablissement].filter(Boolean).join(" ");
  return {
    siret: e.siret ?? null,
    siren: e.siren ?? e.siret?.slice(0, 9) ?? null,
    denomination,
    adresse: [voie, ville].filter(Boolean).join(", "),
    codePostal: a.codePostalEtablissement ?? null,
    ville: a.libelleCommuneEtablissement ?? null,
    formeJuridique: legalFormFromInsee(u.categorieJuridiqueUniteLegale),
    naf: nafOf(e, bySiret),
  };
}

function nafOf(e: InseeEtab, bySiret: boolean): string | null {
  const u = e.uniteLegale ?? {};
  const p = e.periodesEtablissement?.[0] ?? {};
  const legal = nafRev2(u.activitePrincipaleUniteLegale, u.nomenclatureActivitePrincipaleUniteLegale);
  const etab = nafRev2(p.activitePrincipaleEtablissement, p.nomenclatureActivitePrincipaleEtablissement);
  return bySiret ? (etab ?? legal) : (legal ?? etab);
}

const isSiret = (q: string): boolean => /^\d{14}$/.test(q.replace(/\s/g, ""));

/** Construit la requête INSEE selon la saisie (SIRET / SIREN / dénomination). */
function buildUrl(q: string): string {
  const digits = q.replace(/\s/g, "");
  if (isSiret(q)) return `${BASE}/siret/${digits}`;
  if (/^\d{9}$/.test(digits)) {
    return `${BASE}/siret?q=${encodeURIComponent(`siren:${digits} AND etablissementSiege:true`)}&nombre=10`;
  }
  // Recherche par dénomination : un seul mot → préfixe (wildcard) ; plusieurs
  // mots → phrase exacte (l'INSEE n'est pas un moteur de recherche "fuzzy").
  const name = q.toUpperCase().replace(/["\\()]/g, " ").trim();
  const tokens = name.split(/\s+/).filter(Boolean);
  const term = tokens.length > 1 ? `"${name}"` : `${name}*`;
  return `${BASE}/siret?q=${encodeURIComponent(
    `denominationUniteLegale:${term} AND etablissementSiege:true`,
  )}&nombre=10`;
}

/**
 * Résultats INSEE pour une saisie. `null` = erreur (clé absente, API
 * injoignable ou trop lente — 8 s au plus) ; `[]` = rien trouvé.
 */
export async function inseeSearch(q: string): Promise<InseeResult[] | null> {
  const key = process.env.INSEE_API_KEY;
  if (!key) return null;
  try {
    // Sans délai, une API qui ne répond pas bloquerait la saisie : l'abandon
    // tombe dans le catch, comme une erreur réseau.
    const res = await fetch(buildUrl(q), {
      headers: { [KEY_HEADER]: key, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return [];
    if (!res.ok) return null;
    const data = (await res.json()) as { etablissements?: InseeEtab[]; etablissement?: InseeEtab };
    const list = data.etablissements ?? (data.etablissement ? [data.etablissement] : []);
    const bySiret = isSiret(q);
    return list.map((e) => normalize(e, bySiret));
  } catch {
    return null;
  }
}
