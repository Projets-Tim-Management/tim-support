import type { Metadata } from "next";
import { getFeatures } from "@/lib/wordpress";
import FeatureCard from "@/components/features/FeatureCard";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { getRecentFeatures, NEW_FEATURE_DAYS } from "@/lib/feature-utils";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Les nouveautés",
  description: `Les fonctionnalités ajoutées ces ${NEW_FEATURE_DAYS} derniers jours.`,
};

export default async function NouveautesPage() {
  const all     = await getFeatures();
  // Cap large : on affiche tout ce qui est < 30 jours, jusqu'à 100 features
  const recent  = getRecentFeatures(all, 100);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Breadcrumb items={[{ label: "Nouveautés" }]} />

      <header className="mt-6 mb-10">
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[5px] bg-unavailable text-white text-[10px] font-bold tracking-wider uppercase mb-3">
          Nouveau
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
          Les nouveautés
        </h1>
        <p className="mt-2 text-muted">
          Toutes les fonctionnalités ajoutées ces {NEW_FEATURE_DAYS} derniers jours.
        </p>
      </header>

      {recent.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-4xl">🌱</p>
          <p className="font-medium text-foreground">
            Aucune nouvelle fonctionnalité pour l&apos;instant
          </p>
          <p className="text-sm text-muted">
            Revenez bientôt — la documentation s&apos;enrichit régulièrement.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted mb-6">
            {recent.length} fonctionnalité{recent.length > 1 ? "s" : ""} ajoutée{recent.length > 1 ? "s" : ""} récemment.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
