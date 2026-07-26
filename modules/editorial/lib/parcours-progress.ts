/**
 * Gestion de la progression d'un parcours côté client.
 *
 * Stockage : localStorage anonyme, une clé par parcours.
 * Format JSON : { validated: number[] } — index des étapes (0-based) validées.
 *
 * Une étape est "validée" quand l'utilisateur clique "Suivant" dessus.
 * Cela débloque l'accès à l'étape suivante. La navigation est forcée
 * linéaire — impossible de sauter à une étape N sans avoir validé N-1.
 */

const STORAGE_PREFIX = "tim-parcours-";

interface ParcoursProgress {
  validated: number[];
}

/** Lit l'état de progression depuis localStorage (safe SSR). */
export function loadProgress(slug: string): ParcoursProgress {
  if (typeof window === "undefined") return { validated: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + slug);
    if (!raw) return { validated: [] };
    const parsed = JSON.parse(raw) as ParcoursProgress;
    if (Array.isArray(parsed.validated)) return parsed;
  } catch {
    /* corrompu — on repart à zéro */
  }
  return { validated: [] };
}

/** Persiste l'état de progression. */
export function saveProgress(slug: string, progress: ParcoursProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + slug, JSON.stringify(progress));
  } catch {
    /* quota dépassé ou storage indisponible — on ignore silencieusement */
  }
}

/** Marque une étape (0-based) comme validée et persiste. */
export function validateStep(slug: string, stepIdx: number): ParcoursProgress {
  const prog = loadProgress(slug);
  if (!prog.validated.includes(stepIdx)) {
    prog.validated.push(stepIdx);
    prog.validated.sort((a, b) => a - b);
    saveProgress(slug, prog);
  }
  return prog;
}

/**
 * Index max accessible : la dernière étape validée + 1
 * (= prochaine étape à découvrir). Si rien n'est validé, retourne 0
 * (l'étape 1 reste toujours accessible).
 */
export function maxAccessibleStep(prog: ParcoursProgress): number {
  if (prog.validated.length === 0) return 0;
  return Math.max(...prog.validated) + 1;
}

/** Statut global d'un parcours, pour l'affichage des badges. */
export type ParcoursStatus = "not_started" | "in_progress" | "completed";

export function parcoursStatus(prog: ParcoursProgress, totalSteps: number): ParcoursStatus {
  if (prog.validated.length === 0)            return "not_started";
  if (prog.validated.length >= totalSteps)    return "completed";
  return "in_progress";
}

/** Pourcentage d'avancement (0-100). */
export function progressPercent(prog: ParcoursProgress, totalSteps: number): number {
  if (totalSteps === 0) return 0;
  return Math.round((prog.validated.length / totalSteps) * 100);
}

/** Réinitialise un parcours (bouton "Recommencer"). */
export function resetProgress(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + slug);
  } catch {}
}
