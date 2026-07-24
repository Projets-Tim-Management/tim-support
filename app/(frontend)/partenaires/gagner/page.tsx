import Link from "next/link";
import type { Metadata } from "next";
import Breadcrumb from "@/components/ui/Breadcrumb";
import ConnectNotice from "@/components/partenaires/ConnectNotice";
import MissionCard from "@/components/partenaires/MissionCard";
import { getSession } from "@/lib/session";
import { getPointsSummary, getMissions } from "@/lib/wordpress";

export const metadata: Metadata = {
  title: "Gagner des points",
  description: "Toutes les façons de cumuler des points partenaires.",
};

export const dynamic = "force-dynamic";

export default async function GagnerPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <ConnectNotice />
      </div>
    );
  }

  const [summary, missions] = await Promise.all([
    getPointsSummary(session.email),
    getMissions(session.email),
  ]);
  const balance = summary?.balance ?? 0;
  const code = summary?.code ?? "";

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Breadcrumb
        items={[
          { label: "Espace partenaires", href: "/partenaires" },
          { label: "Gagner des points" },
        ]}
      />

      <header className="mt-6 mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gagner des points</h1>
          <p className="mt-2 text-muted">
            Réalisez ces missions pour cumuler des points, puis échangez-les contre des récompenses.
          </p>
        </div>
        <div className="rounded-[var(--radius-btn)] bg-primary-light text-primary px-4 py-2 font-extrabold tabular-nums">
          Solde : {balance.toLocaleString("fr-FR")} pts
        </div>
      </header>

      {missions.length === 0 ? (
        <p className="text-muted">
          Aucune mission disponible pour le moment. Revenez bientôt&nbsp;!
        </p>
      ) : (
        <div className="space-y-4">
          {missions.map((m) => (
            <MissionCard key={m.id} mission={m} partnerCode={code} />
          ))}
        </div>
      )}

      <p className="mt-10 text-sm text-muted">
        <Link href="/partenaires" className="text-primary hover:underline">
          ← Retour à mon espace
        </Link>
        {" · "}
        <Link href="/partenaires/recompenses" className="text-primary hover:underline">
          Voir les récompenses →
        </Link>
      </p>
    </div>
  );
}
