import type { Feature } from "@/core/lib/types";

/** Seuil de "fraîcheur" — au-delà, le badge "Nouveauté" disparaît automatiquement. */
export const NEW_FEATURE_DAYS = 30;

/**
 * Date pivot — toutes les features dont la date de création est ANTÉRIEURE
 * à cette date ne reçoivent jamais le badge "Nouveauté".
 *
 * Permet d'éviter de marquer comme "nouveau" l'ensemble des features
 * historiques au moment de l'activation du système. À partir de cette date,
 * seules les nouvelles publications WP recevront le badge (pendant 30 jours).
 */
export const NEW_FEATURE_SINCE = "2026-05-20T00:00:00Z";

/**
 * Renvoie true si la feature a été créée il y a moins de `days` jours
 * ET après la date pivot `NEW_FEATURE_SINCE`. Tolérant : retourne false si
 * la date est manquante, invalide ou dans le futur.
 */
export function isFeatureRecent(
  dateStr: string | undefined | null,
  days = NEW_FEATURE_DAYS
): boolean {
  if (!dateStr) return false;
  const created = new Date(dateStr).getTime();
  if (isNaN(created)) return false;

  // 1. Doit être créée à partir de la date pivot (exclut l'historique)
  if (created < new Date(NEW_FEATURE_SINCE).getTime()) return false;

  // 2. Doit être dans les `days` derniers jours
  const diffDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays < days;
}

/**
 * Filtre les features ajoutées dans les `days` derniers jours, triées par date
 * décroissante (les plus récentes d'abord), et limite à `limit` éléments.
 */
export function getRecentFeatures(
  features: Feature[],
  limit = 10,
  days = NEW_FEATURE_DAYS
): Feature[] {
  return features
    .filter((f) => isFeatureRecent(f.date, days))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

// ─── Modifications récentes ─────────────────────────────────────────────────

/** Même fenêtre de 30 jours que pour les nouveautés. */
export const MODIFIED_FEATURE_DAYS = 30;

/**
 * Date pivot — toute modification antérieure ne donne pas de badge "Modifié".
 * Identique au pivot des Nouveautés pour ignorer l'historique de l'import.
 */
export const MODIFIED_FEATURE_SINCE = NEW_FEATURE_SINCE;

/**
 * Renvoie true si la feature a été modifiée récemment ET n'est pas considérée
 * comme une nouveauté (sinon "Nouveauté" prend la priorité).
 */
export function isFeatureModified(
  feature: Pick<Feature, "date" | "modified">,
  days = MODIFIED_FEATURE_DAYS
): boolean {
  // Si c'est une nouveauté, on n'affiche pas le badge "Modifié" en parallèle —
  // une feature toute neuve n'est pas "modifiée" mais "créée".
  if (isFeatureRecent(feature.date)) return false;

  if (!feature.modified) return false;
  const mod = new Date(feature.modified).getTime();
  if (isNaN(mod)) return false;

  // Doit être modifiée après le pivot
  if (mod < new Date(MODIFIED_FEATURE_SINCE).getTime()) return false;

  // Doit être dans les `days` derniers jours
  const diffDays = (Date.now() - mod) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays < days;
}

/**
 * Features modifiées récemment (mais pas créées récemment), triées par date
 * de modification décroissante.
 */
export function getModifiedFeatures(
  features: Feature[],
  limit = 10,
  days = MODIFIED_FEATURE_DAYS
): Feature[] {
  return features
    .filter((f) => isFeatureModified(f, days))
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
    .slice(0, limit);
}
