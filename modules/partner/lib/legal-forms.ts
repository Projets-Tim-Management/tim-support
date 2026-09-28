/**
 * Formes juridiques proposées pour l'identité du client (contrat, espace
 * client). La VALEUR est courte (stockée), le LIBELLÉ est celui qui s'écrit
 * dans le contrat (« Société par actions simplifiée »).
 */
export const LEGAL_FORMS = [
  { value: "sas", label: "Société par actions simplifiée", short: "SAS" },
  { value: "sasu", label: "Société par actions simplifiée unipersonnelle", short: "SASU" },
  { value: "sarl", label: "Société à responsabilité limitée", short: "SARL" },
  { value: "eurl", label: "Entreprise unipersonnelle à responsabilité limitée", short: "EURL" },
  { value: "sa", label: "Société anonyme", short: "SA" },
  { value: "snc", label: "Société en nom collectif", short: "SNC" },
  { value: "ei", label: "Entreprise individuelle", short: "EI" },
  { value: "autre", label: "Autre forme", short: "Autre" },
] as const;

export type LegalForm = (typeof LEGAL_FORMS)[number]["value"];

export const isLegalForm = (v: unknown): v is LegalForm => LEGAL_FORMS.some((f) => f.value === v);

/**
 * Le libellé écrit dans le CONTRAT. « Autre » n'est pas une forme sociale :
 * elle reste vide, donc « [à compléter] » — l'envoi est bloqué tant qu'on ne
 * l'a pas précisée (étape « Informations » du contrat). Les listes de choix
 * lisent LEGAL_FORMS, pas cette fonction.
 */
export const legalFormLabel = (v?: string | null): string | null =>
  v === "autre" ? null : (LEGAL_FORMS.find((f) => f.value === v)?.label ?? null);

/**
 * Catégorie juridique INSEE (nomenclature à 4 chiffres) → forme proposée.
 * Seules les catégories courantes du BTP sont reconnues ; le reste donne
 * « autre », que le client précise.
 */
export function legalFormFromInsee(code?: string | null): LegalForm | null {
  if (!code) return null;
  const c = code.trim();
  if (c === "1000") return "ei";
  if (c === "5710") return "sas";
  if (c === "5720") return "sasu";
  if (c === "5498") return "eurl";
  if (/^54\d\d$/.test(c)) return "sarl";
  if (/^5[56]\d\d$/.test(c)) return "sa";
  if (/^52\d\d$/.test(c)) return "snc";
  return "autre";
}
