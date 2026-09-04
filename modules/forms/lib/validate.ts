import type { PublicField, PublicForm } from "@/modules/forms/lib/public-schema";

/**
 * Contrôle d'une soumission, DÉRIVÉ du schéma servi au site : rien n'est codé
 * en dur, sinon un champ rendu facultatif en back-office resterait exigé — le
 * visiteur remplit, le serveur refuse.
 *
 * Deux principes derrière les arbitrages : un lead ne se rattrape pas (on
 * enregistre, puis on signale), et ce qui entre est hostile (tout est plafonné).
 */

/** Plafond par valeur. Large pour un formulaire, dérisoire pour un abus. */
export const MAX_VALUE_LENGTH = 2000;
const MAX_MULTI = 50;
const MAX_EXTRA_FIELDS = 20;

export type AnswerValue = string | string[];

export interface ValidationOk {
  ok: true;
  answers: Record<string, AnswerValue>;
  /** Champs hors schéma, conservés. Non vide = le site sert une définition périmée. */
  extras: string[];
}

export interface ValidationFail {
  ok: false;
  /** Un message par champ fautif, à afficher sous le champ. */
  errors: Record<string, string>;
}

export type ValidationResult = ValidationOk | ValidationFail;

const REQUIRED = "Ce champ est obligatoire.";
const TOO_LONG = (max: number) => `Ce champ est limité à ${max} caractères.`;
const BAD_EMAIL = "Adresse e-mail invalide.";
const BAD_PHONE = "Numéro de téléphone invalide.";
const BAD_CHOICE = "Ce choix n'est pas proposé.";
const BAD_MULTI = "Choisissez au moins une option.";

/** Mêmes règles que core/lib/validators. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[+()\d\s.-]{6,20}$/;

/** Nombres et booléens convertis : un proxy JSON peut transmettre 42 pour un texte. */
const asText = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

const optionValues = (field: PublicField): Set<string> =>
  new Set((field.options ?? []).map((o) => o.value));

/** `undefined` en retour = valeur absente et acceptable. */
function checkField(field: PublicField, raw: unknown): { value?: AnswerValue; error?: string } {
  if (field.type === "multiselect") {
    const list = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
    const allowed = optionValues(field);
    const values: string[] = [];
    for (const item of list.slice(0, MAX_MULTI)) {
      const v = asText(item);
      if (v === null || v === "") continue;
      if (!allowed.has(v)) return { error: BAD_CHOICE };
      if (!values.includes(v)) values.push(v);
    }
    if (values.length === 0) return field.required ? { error: BAD_MULTI } : {};
    return { value: values };
  }

  const value = asText(raw);
  if (value === null || value === "") return field.required ? { error: REQUIRED } : {};

  if (field.type === "select") {
    return optionValues(field).has(value) ? { value } : { error: BAD_CHOICE };
  }

  // Le plafond du champ ne peut pas dépasser le plafond général : un `maxLength`
  // mal saisi ne doit pas laisser entrer 10 Mo.
  const max = Math.min(field.maxLength ?? MAX_VALUE_LENGTH, MAX_VALUE_LENGTH);
  if (value.length > max) return { error: TOO_LONG(max) };

  if (field.type === "email" && !EMAIL_RE.test(value)) return { error: BAD_EMAIL };
  if (field.type === "tel" && !PHONE_RE.test(value)) return { error: BAD_PHONE };

  return { value };
}

/**
 * Valide les réponses contre le schéma.
 *
 * Un champ INCONNU ne fait pas échouer : pendant une bascule, le site sert
 * encore l'ancienne définition le temps que son cache expire. Il est conservé et
 * signalé dans `extras`.
 */
export function validateAnswers(form: PublicForm, raw: unknown): ValidationResult {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const errors: Record<string, string> = {};
  const answers: Record<string, AnswerValue> = {};

  for (const field of form.fields) {
    const { value, error } = checkField(field, input[field.name]);
    if (error) errors[field.name] = error;
    else if (value !== undefined) answers[field.name] = value;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const known = new Set(form.fields.map((f) => f.name));
  const extras: string[] = [];
  for (const key of Object.keys(input)) {
    if (known.has(key) || key === form.honeypot) continue;
    if (extras.length >= MAX_EXTRA_FIELDS) break;
    const value = Array.isArray(input[key])
      ? (input[key] as unknown[])
          .slice(0, MAX_MULTI)
          .map(asText)
          .filter((v): v is string => v !== null && v !== "")
      : asText(input[key]);
    if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    answers[key] = Array.isArray(value)
      ? value.map((v) => v.slice(0, MAX_VALUE_LENGTH))
      : value.slice(0, MAX_VALUE_LENGTH);
    extras.push(key);
  }

  return { ok: true, answers, extras };
}

/**
 * Le champ leurre a-t-il été rempli ? Invisible pour un humain, rempli par un
 * robot qui remplit tout.
 */
export function honeypotTripped(form: PublicForm, raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const value = (raw as Record<string, unknown>)[form.honeypot];
  return typeof value === "string" ? value.trim() !== "" : value != null;
}
