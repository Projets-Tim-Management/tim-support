import type { Metadata } from "next";
import { getFeatures } from "@/lib/wordpress";
import FeatureCard from "@/components/features/FeatureCard";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { getModifiedFeatures, MODIFIED_FEATURE_DAYS } from "@/lib/feature-utils";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Mises à jour",
  description: `Les fonctionnalités modifiées ces ${MODIFIED_FEATURE_DAYS} derniers jours.`,
};

export default async function MisesAJourPage() {
  const all      = await getFeatures();
  // Cap à 100 — au-delà, le scroll devient pénible
  const modified = getModifiedFeatures(all, 100);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Breadcrumb items={[{ label: "Mises à jour" }]} />

      <header className="mt-6 mb-10">
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[5px] bg-processing text-white text-[10px] font-bold tracking-wider uppercase mb-3">
          Mise à jour
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
          Mises à jour
        </h1>
        <p className="mt-2 text-muted">
          Toutes les fonctionnalités modifiées ces {MODIFIED_FEATURE_DAYS} derniers jours.
        </p>
      </header>

      {modified.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-4xl">🔄</p>
          <p className="font-medium text-foreground">
            Aucune mise à jour récente
          </p>
          <p className="text-sm text-muted">
            Revenez bientôt — la documentation évolue régulièrement.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted mb-6">
            {modified.length} fonctionnalité{modified.length > 1 ? "s" : ""} mise{modified.length > 1 ? "s" : ""} à jour récemment.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modified.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
