/**
 * Secret partagé (avec l'app app.tim-management.co) pour signer et vérifier les
 * JWT de session. Encodé une seule fois ici, réutilisé par le middleware
 * (proxy.ts) et par getSession (modules/partner/lib/session.ts).
 *
 * Fail-fast : à l'exécution en production, l'absence de JWT_SECRET fait échouer
 * le premier chargement plutôt que de laisser tourner l'app avec un secret par
 * défaut PUBLIC (sessions falsifiables). On exclut la phase de BUILD, qui ne
 * doit pas dépendre d'un secret runtime (les env runtime sont injectées à
 * l'exécution sur Vercel).
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (
  !process.env.JWT_SECRET &&
  process.env.NODE_ENV === "production" &&
  !isBuildPhase
) {
  throw new Error(
    "JWT_SECRET absent en production : définissez-le (secret partagé avec l'app). " +
      "Refus de démarrer avec un secret par défaut non sécurisé.",
  );
}

export const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-only-insecure-secret-change-me",
);

/** Nom du cookie de session (posé par proxy.ts, lu par getSession). */
export const SESSION_COOKIE = "tim_support_session";
/** Durée de vie de la session (8 h). */
export const SESSION_MAX_AGE = 60 * 60 * 8;
