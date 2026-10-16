/**
 * Un seul rafraîchissement de la page pour toutes les cartes qui en ont
 * besoin : avec un intervalle par carte, N retouches en cours recalculaient
 * la page N fois toutes les 15 s. Ici, un seul intervalle tourne tant qu'au
 * moins une carte est abonnée ; il s'arrête avec la dernière.
 */
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export const REFRESH_MS = 15_000;

/** S'abonne ; rend la fonction de désabonnement (à appeler au démontage). */
export function subscribeRefresh(refresh: () => void): () => void {
  subscribers.add(refresh);
  // Toutes les cartes partagent le même routeur : en appeler un suffit.
  timer ??= setInterval(() => subscribers.values().next().value?.(), REFRESH_MS);
  return () => {
    subscribers.delete(refresh);
    if (!subscribers.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
