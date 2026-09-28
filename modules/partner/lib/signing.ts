/**
 * Le process de SIGNATURE d'une affaire : de « oui » au contrat signé.
 *
 * Cinq étapes, dans l'ordre où elles arrivent :
 *   1. les informations de l'entreprise (raison sociale, SIREN ou SIRET,
 *      adresse de facturation) — saisies par le partenaire sur la fiche, ou par
 *      le client dans son espace ;
 *   2. le devis envoyé ;
 *   3. le devis retourné signé ;
 *   4. le contrat envoyé ;
 *   5. le contrat retourné signé.
 *
 * Il démarre au PREMIER de deux faits : la réponse « Je continue » en fin de
 * phase de test, ou le passage de la fiche en « Gagnée » (affaire conclue sans
 * test). `signingStartedAt` en garde la date.
 *
 * ── Une étape = un fait, pas une case ────────────────────────────────────────
 * Chaque document a sa DATE. Déposer le document pose la date (hook
 * `stampSigning`) : c'est le geste qui coche, d'où qu'il vienne — la fiche ou
 * l'espace client. Quand le document est passé par e-mail, le partenaire pose
 * la date seul (« Fait par e-mail ») : l'étape est tout aussi acquise, sans
 * pièce jointe. Aucune case n'existe à côté du fait.
 *
 * Un document signé retourné PROUVE que son original est parti : l'étape
 * « envoyé » est donc acquise dès que la version signée est là, même si
 * personne n'a pensé à la cocher.
 *
 * Module pur (aucun import Payload ni React) : la fiche, l'espace client et
 * les tests lisent exactement la même règle.
 */

export type SigningDocKey = "devis-envoye" | "devis-signe" | "contrat-envoye" | "contrat-signe";
export type SigningStepKey = "entreprise" | SigningDocKey;

/** Les champs de la fiche qui portent chaque étape documentaire. */
export const SIGNING_DOC_FIELDS: Record<SigningDocKey, { doc: string; date: string }> = {
  "devis-envoye": { doc: "quoteDocument", date: "quoteSentAt" },
  "devis-signe": { doc: "quoteSignedDocument", date: "quoteSignedAt" },
  "contrat-envoye": { doc: "contractToSignDocument", date: "contractSentAt" },
  // Champs antérieurs au process, repris tels quels : c'est la date de
  // signature qui arme déjà l'étape « Contrat signé » du parcours de test.
  "contrat-signe": { doc: "contractDocument", date: "signatureDate" },
};

/** L'étape « envoyé » dont la version signée prouve l'envoi. */
const SIGNED_PROVES: Partial<Record<SigningDocKey, SigningDocKey>> = {
  "devis-envoye": "devis-signe",
  "contrat-envoye": "contrat-signe",
};

export const SIGNING_STEPS: { key: SigningStepKey; label: string; who: string }[] = [
  { key: "entreprise", label: "Informations de l'entreprise", who: "Partenaire ou client" },
  { key: "devis-envoye", label: "Devis envoyé", who: "Partenaire" },
  { key: "devis-signe", label: "Devis retourné signé", who: "Client" },
  { key: "contrat-envoye", label: "Contrat envoyé", who: "Partenaire" },
  { key: "contrat-signe", label: "Contrat retourné signé", who: "Client" },
];

/** Ce qu'il faut pour facturer : sans l'un de ces trois, pas de facture. */
export const COMPANY_FIELDS: { field: string; label: string }[] = [
  { field: "raisonSociale", label: "Raison sociale" },
  { field: "siren", label: "SIREN ou SIRET" },
  { field: "billingAddress", label: "Adresse de facturation" },
];

export type SigningFacts = Record<string, unknown>;

const filled = (v: unknown): boolean =>
  v != null && v !== "" && !(typeof v === "string" && v.trim() === "");

/** Libellés des informations d'entreprise encore manquantes (SIRET vaut SIREN). */
export function missingCompanyInfo(facts: SigningFacts): string[] {
  return COMPANY_FIELDS.filter(({ field }) =>
    field === "siren" ? !filled(facts.siren) && !filled(facts.siret) : !filled(facts[field]),
  ).map((f) => f.label);
}

export type SigningStepState = {
  key: SigningStepKey;
  label: string;
  who: string;
  done: boolean;
  /** Date du fait (ISO), quand on la connaît. */
  at: string | null;
  /**
   * Comment l'étape est acquise :
   *  - `document` : un fichier est déposé (fiche ou espace client) ;
   *  - `manuel`   : coché à la main — le document est passé par e-mail ;
   *  - `deduit`   : jamais coché, mais la version signée prouve l'envoi ;
   *  - `saisie`   : informations d'entreprise complètes.
   */
  via: "document" | "manuel" | "deduit" | "saisie" | null;
  /** Informations d'entreprise manquantes (étape 1 seulement). */
  missing?: string[];
};

export function signingSteps(facts: SigningFacts): SigningStepState[] {
  const docStep = (key: SigningDocKey) => {
    const { doc, date } = SIGNING_DOC_FIELDS[key];
    const hasDoc = filled(facts[doc]);
    const at = filled(facts[date]) ? String(facts[date]) : null;
    return { hasDoc, at };
  };

  return SIGNING_STEPS.map(({ key, label, who }) => {
    if (key === "entreprise") {
      const missing = missingCompanyInfo(facts);
      return { key, label, who, done: missing.length === 0, at: null, via: missing.length ? null : "saisie", missing };
    }
    const own = docStep(key);
    if (own.hasDoc) return { key, label, who, done: true, at: own.at, via: "document" as const };
    if (own.at) return { key, label, who, done: true, at: own.at, via: "manuel" as const };
    const proof = SIGNED_PROVES[key];
    if (proof) {
      const signed = docStep(proof);
      if (signed.hasDoc || signed.at) {
        return { key, label, who, done: true, at: null, via: "deduit" as const };
      }
    }
    return { key, label, who, done: false, at: null, via: null };
  });
}

/** Le process est-il lancé ? Démarré explicitement, ou affaire déjà signée. */
export const signingStarted = (facts: SigningFacts): boolean =>
  filled(facts.signingStartedAt) || filled(facts.signatureDate);

/**
 * Pose la date des documents qui viennent d'arriver, et seulement d'eux.
 *
 * Une date déjà là n'est jamais réécrite : le partenaire a pu cocher « envoyé
 * par e-mail » le 3, puis déposer le PDF le 10 — le fait date du 3.
 *
 * Renvoie les champs à ajouter aux données enregistrées (vide si rien à poser).
 */
export function stampDocumentDates(
  data: SigningFacts,
  previous: SigningFacts | undefined,
  now: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { doc, date } of Object.values(SIGNING_DOC_FIELDS)) {
    const docNow = doc in data ? data[doc] : previous?.[doc];
    const dateNow = date in data ? data[date] : previous?.[date];
    const arrived = filled(docNow) && !filled(previous?.[doc]);
    if (arrived && !filled(dateNow)) out[date] = now;
  }
  return out;
}

/** SIREN : 9 chiffres. SIRET : 14. Les espaces de saisie sont tolérés. */
export const normalizeCompanyId = (v: unknown, digits: 9 | 14): string | null => {
  if (typeof v !== "string") return null;
  const d = v.replace(/\s+/g, "");
  return new RegExp(`^\\d{${digits}}$`).test(d) ? d : null;
};
