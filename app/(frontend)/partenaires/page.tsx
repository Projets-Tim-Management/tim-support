import Link from "next/link";
import type { Metadata } from "next";
import Breadcrumb from "@/components/ui/Breadcrumb";
import ConnectNotice from "@/components/partenaires/ConnectNotice";
import { getSession } from "@/modules/partner/lib/session";
import { getPointsSummary } from "@/modules/partner/lib/partner";
import type { PointsSource } from "@/core/lib/types";

export const metadata: Metadata = {
  title: "Espace partenaires",
  description: "Consultez vos points et échangez-les contre des récompenses.",
};

// Données utilisateur — jamais de cache.
export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<PointsSource, string> = {
  contrat:    "📄 Contrat / contact",
  avis:       "⭐ Avis partenaire",
  ajustement: "⚖️ Ajustement",
  echange:    "🎁 Échange",
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function PartenairesPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <ConnectNotice />
      </div>
    );
  }

  const summary = await getPointsSummary(session.email);
  const balance = summary?.balance ?? 0;
  const history = summary?.history ?? [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Breadcrumb items={[{ label: "Espace partenaires" }]} />

      <header className="mt-6 mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Bonjour{session.name ? ` ${session.name}` : ""} 👋
        </h1>
        <p className="mt-2 text-muted">
          Cumulez des points et échangez-les contre des récompenses.
        </p>
      </header>

      {/* Carte solde */}
      <div className="rounded-lg bg-primary text-white p-8">
        <p className="text-sm/none uppercase tracking-wide opacity-80">Votre solde</p>
        <p className="mt-2 text-5xl font-extrabold tabular-nums">
          {balance.toLocaleString("fr-FR")}
          <span className="text-2xl font-bold ml-2">points</span>
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/partenaires/gagner"
            className="inline-flex items-center justify-center h-11 px-6 rounded-[var(--radius-btn)] bg-white text-primary font-extrabold hover:opacity-90 transition-opacity"
          >
            🎯 Gagner des points
          </Link>
          <Link
            href="/partenaires/recompenses"
            className="inline-flex items-center justify-center h-11 px-6 rounded-[var(--radius-btn)] bg-white/15 text-white font-extrabold hover:bg-white/25 transition-colors"
          >
            🎁 Voir les récompenses
          </Link>
        </div>
      </div>

      {/* Code partenaire */}
      {summary?.code && (
        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted">
            Votre code partenaire (à communiquer pour vos leads) :
          </p>
          <code className="text-base font-extrabold text-foreground tracking-wider">
            {summary.code}
          </code>
        </div>
      )}

      {/* Historique */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-foreground mb-4">Historique des points</h2>

        {history.length === 0 ? (
          <p className="text-muted">
            Aucune transaction pour le moment. Vos points apparaîtront ici dès qu&apos;ils
            seront crédités.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-4 py-3 bg-white">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {h.motif || SOURCE_LABELS[h.source]}
                  </p>
                  <p className="text-xs text-muted">
                    {SOURCE_LABELS[h.source]} · {formatDate(h.created_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-extrabold tabular-nums ${
                    h.delta >= 0 ? "text-success-text" : "text-danger"
                  }`}
                >
                  {h.delta >= 0 ? "+" : ""}
                  {h.delta.toLocaleString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
