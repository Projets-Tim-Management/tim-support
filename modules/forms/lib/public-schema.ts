import { CHOICE_TYPES, HONEYPOT_FIELD, type FieldType } from "@/modules/forms/lib/form-schema";

/**
 * Traduction d'une définition en schéma PUBLIC.
 *
 * Le document brut porte de l'interne (identifiants, `seedVersion`, dates) et un
 * `null` par champ vide, que la vitrine devrait sinon distinguer d'une absence.
 *
 * C'est la SEULE lecture d'une définition : la validation des soumissions
 * s'appuie sur ce même schéma. Un champ absent d'ici n'est ni rendu, ni accepté.
 */

export interface PublicOption {
  value: string;
  label: string;
}

export interface PublicField {
  name: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  maxLength?: number;
  countryCode?: boolean;
  options?: PublicOption[];
}

export interface PublicForm {
  formId: string;
  /** Change à chaque enregistrement : permet à la vitrine d'invalider son cache. */
  version: string;
  successText: string;
  errorText: string;
  legalNotice?: string;
  honeypot: string;
  fields: PublicField[];
}

/** Forme minimale attendue d'un document `forms` (évite un couplage aux types générés). */
export interface FormDoc {
  /** Identifiant Payload — jamais exposé, mais nécessaire pour lier une soumission. */
  id?: number | string;
  formId?: string | null;
  active?: boolean | null;
  updatedAt?: string | null;
  successText?: string | null;
  errorText?: string | null;
  legalNotice?: string | null;
  fields?:
    | {
        name?: string | null;
        type?: string | null;
        label?: string | null;
        required?: boolean | null;
        placeholder?: string | null;
        helpText?: string | null;
        maxLength?: number | null;
        countryCode?: boolean | null;
        options?: { value?: string | null; label?: string | null }[] | null;
      }[]
    | null;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const isChoice = (type: string): boolean => CHOICE_TYPES.includes(type as FieldType);

/**
 * Un champ n'est retenu que s'il est rendable. Une ligne ajoutée puis abandonnée
 * en back-office produirait sinon une case sans intitulé sur le site public.
 */
function toPublicField(raw: NonNullable<FormDoc["fields"]>[number]): PublicField | null {
  const name = text(raw.name);
  const type = text(raw.type);
  const label = text(raw.label);
  if (!name || !type || !label) return null;

  // Une collision avec le leurre le rendrait toujours « rempli » : plus aucune
  // soumission enregistrée, et la réponse resterait « succès ». Panne muette.
  if (name === HONEYPOT_FIELD) return null;

  const field: PublicField = {
    name,
    type: type as FieldType,
    label,
    // Boolean() et non un repli sur `true` : une donnée aberrante ne doit pas
    // rendre obligatoire un champ que personne n'a voulu tel.
    required: Boolean(raw.required),
  };

  if (isChoice(type)) {
    // Une option sans valeur ne se poste pas, sans libellé ne s'affiche pas.
    const options = (raw.options ?? [])
      .map((o) => ({ value: text(o.value), label: text(o.label) }))
      .filter((o) => o.value && o.label);
    field.options = options;
  } else {
    // Un exemple n'a nulle part où s'afficher dans une liste déroulante.
    const placeholder = text(raw.placeholder);
    if (placeholder) field.placeholder = placeholder;
    const maxLength = typeof raw.maxLength === "number" && raw.maxLength > 0 ? raw.maxLength : null;
    if (maxLength) field.maxLength = maxLength;
    if (type === "tel" && raw.countryCode) field.countryCode = true;
  }

  const helpText = text(raw.helpText);
  if (helpText) field.helpText = helpText;

  return field;
}

/**
 * @returns le schéma public, ou `null` si la définition n'est pas servable —
 * pour un 404 franc. Une coquille vide afficherait un formulaire sans question,
 * que rien ne signalerait.
 */
export function toPublicForm(doc: FormDoc | null | undefined): PublicForm | null {
  if (!doc || doc.active === false) return null;

  const formId = text(doc.formId);
  if (!formId) return null;

  const fields = (doc.fields ?? [])
    .map(toPublicField)
    .filter((f): f is PublicField => f !== null);
  if (fields.length === 0) return null;

  const form: PublicForm = {
    formId,
    version: text(doc.updatedAt) || "0",
    successText: text(doc.successText),
    errorText: text(doc.errorText),
    honeypot: HONEYPOT_FIELD,
    fields,
  };

  // Vide = la vitrine n'affiche rien. La clé est donc absente plutôt que nulle.
  const legalNotice = text(doc.legalNotice);
  if (legalNotice) form.legalNotice = legalNotice;

  return form;
}
