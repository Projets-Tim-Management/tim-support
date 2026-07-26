import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import Breadcrumb from "@/components/ui/Breadcrumb";
import ConnectNotice from "@/components/partenaires/ConnectNotice";
import RedeemButton from "@/components/partenaires/RedeemButton";
import { getSession } from "@/modules/partner/lib/session";
import { getPointsSummary, getRewards } from "@/modules/partner/lib/partner";
import { htmlToText } from "@/core/lib/html";

export const metadata: Metadata = {
  title: "Récompenses",
  description: "Échangez vos points contre des récompenses.",
};

export const dynamic = "force-dynamic";

export default async function RecompensesPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <ConnectNotice />
      </div>
    );
  }

  const [summary, rewards] = await Promise.all([
    getPointsSummary(session.email),
    getRewards(),
  ]);
  const balance = summary?.balance ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <Breadcrumb
        items={[
          { label: "Espace partenaires", href: "/partenaires" },
          { label: "Récompenses" },
        ]}
      />

      <header className="mt-6 mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Récompenses</h1>
          <p className="mt-2 text-muted">Échangez vos points contre les lots ci-dessous.</p>
        </div>
        <div className="rounded-[var(--radius-btn)] bg-primary-light text-primary px-4 py-2 font-extrabold tabular-nums">
          Solde : {balance.toLocaleString("fr-FR")} pts
        </div>
      </header>

      {rewards.length === 0 ? (
        <p className="text-muted">
          Aucune récompense disponible pour le moment. Revenez bientôt&nbsp;!
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {rewards.map((r) => {
            const canAfford = balance >= r.cost;
            return (
              <article
                key={r.id}
                className="flex flex-col rounded-lg border border-border bg-white overflow-hidden"
              >
                <div className="relative aspect-[4/3] bg-surface">
                  {r.image ? (
                    <Image
                      src={r.image}
                      alt={r.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-5xl">🎁</div>
                  )}
                </div>

                <div className="flex flex-col flex-1 p-4">
                  <h2 className="font-bold text-foreground">{r.title}</h2>
                  {r.description && (
                    <p className="mt-1 text-sm text-muted line-clamp-3">{htmlToText(r.description)}</p>
                  )}

                  <div className="mt-3 mb-4">
                    <span className="text-2xl font-extrabold text-foreground tabular-nums">
                      {r.cost.toLocaleString("fr-FR")}
                    </span>
                    <span className="text-sm font-bold text-muted ml-1">points</span>
                  </div>

                  <div className="mt-auto">
                    <RedeemButton
                      rewardId={r.id}
                      title={r.title}
                      cost={r.cost}
                      canAfford={canAfford}
                    />
                    {!canAfford && (
                      <p className="mt-1.5 text-xs text-muted text-center">
                        Il vous manque {(r.cost - balance).toLocaleString("fr-FR")} pts
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-10 text-sm text-muted">
        <Link href="/partenaires" className="text-primary hover:underline">
          ← Retour à mon espace
        </Link>
      </p>
    </div>
  );
}
