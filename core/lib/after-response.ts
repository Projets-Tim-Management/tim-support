import { after } from "next/server";

/**
 * Exécute un travail APRÈS avoir répondu à l'utilisateur.
 *
 * Certains effets d'un enregistrement — prévenir l'équipe, poser un événement
 * d'agenda — n'apportent rien à celui qui a cliqué : il n'attend pas leur
 * résultat, il attend son écran. Les faire dans la requête, c'est lui faire
 * payer une poignée de main SMTP par notification.
 *
 * `after()` de Next confie le travail à la plateforme, qui le poursuit une fois
 * la réponse envoyée (Vercel le prend en charge nativement). L'écran revient
 * immédiatement ; l'e-mail part juste après.
 *
 * REPLI INDISPENSABLE : `after()` n'existe que dans le contexte d'une requête.
 * Les crons, les scripts et les hooks déclenchés par l'API locale n'en ont pas —
 * là, on exécute tout de suite, sans quoi le travail serait purement et
 * simplement perdu.
 *
 * L'erreur ne remonte JAMAIS : ce sont des effets de bord. Une notification qui
 * échoue ne doit pas annuler l'enregistrement qui l'a déclenchée — d'autant
 * qu'après la réponse, plus personne n'est là pour la voir.
 */
export function afterResponse(
  task: () => Promise<unknown>,
  onError?: (error: unknown) => void,
): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      onError?.(error);
    }
  };

  try {
    after(guarded);
  } catch {
    // Hors requête (cron, script, seed) : on fait le travail maintenant.
    void guarded();
  }
}
