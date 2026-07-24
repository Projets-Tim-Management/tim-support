const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tim-management.co";

/**
 * Affiché quand un visiteur arrive sur l'espace partenaires sans session.
 * En production, l'app redirige avec un ?token= qui crée la session ; sans ça
 * on invite simplement à se connecter depuis l'app.
 */
export default function ConnectNotice() {
  return (
    <div className="max-w-md mx-auto mt-10 rounded-lg border border-border bg-surface p-8 text-center">
      <div className="text-4xl mb-4">🔒</div>
      <h2 className="text-xl font-bold text-foreground">Espace réservé aux partenaires</h2>
      <p className="mt-3 text-muted">
        Cet espace est accessible uniquement depuis votre compte TIM Management.
        Connectez-vous à l&apos;application pour consulter vos points et vos récompenses.
      </p>
      <a
        href={APP_URL}
        className="inline-flex items-center justify-center mt-6 h-11 px-6 rounded-[var(--radius-btn)] bg-primary text-white font-extrabold hover:opacity-80 transition-opacity"
      >
        Aller sur l&apos;application
      </a>
    </div>
  );
}
