import { formatAdminURL } from "payload/shared";

/**
 * Utilitaires partagés du module partenaires (formateurs, relations, submit).
 * Regroupés ici pour éviter la duplication dans les composants admin.
 */

/** Montant en euros (2 décimales). */
export const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

/** Nombre (séparateurs de milliers FR), pour les points. */
export const nf = new Intl.NumberFormat("fr-FR");

/** Arrondi à 2 décimales. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * id d'un champ relation DANS L'ÉTAT DU FORMULAIRE (valeur = id brut, ou
 * `{ relationTo, value }` en polymorphe). ≠ relId (core/lib/relations) qui lit
 * `.id` d'un doc peuplé.
 */
export const fieldRelId = (v: unknown): number | string | null =>
  v && typeof v === "object"
    ? ((v as { value?: unknown }).value as number | string) ?? null
    : ((v as number | string) ?? null);

/**
 * Construit l'action + méthode de submit d'un document (identique aux boutons
 * natifs de Payload : POST à la création, PATCH en édition, `draft=true` pour
 * un brouillon).
 */
export function docSubmitAction(args: {
  api: string;
  collectionSlug?: string;
  id?: number | string;
  locale?: string;
  draft?: boolean;
}): { action: string; method: "PATCH" | "POST" } {
  const { api, collectionSlug, id, locale, draft } = args;
  const search = `?locale=${locale ?? ""}&depth=0&fallback-locale=null${draft ? "&draft=true" : ""}`;
  return {
    action: formatAdminURL({ apiRoute: api, path: `/${collectionSlug ?? ""}${id ? `/${id}` : ""}${search}` }),
    method: id ? "PATCH" : "POST",
  };
}
