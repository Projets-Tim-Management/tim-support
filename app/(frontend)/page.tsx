import { getFeatures, getFeatureCategories } from "@/lib/wordpress";
import SearchBar from "@/components/ui/SearchBar";
import FeatureCard from "@/components/features/FeatureCard";
import Link from "next/link";
import type { FeatureTerm } from "@/lib/types";
import { getRecentFeatures, getModifiedFeatures, NEW_FEATURE_DAYS, MODIFIED_FEATURE_DAYS } from "@/lib/feature-utils";

export const revalidate = 3600;

const PLATFORM_ICONS: Record<string, string> = {
  web:    "🖥️",
  mobile: "📱",
};

export default async function HomePage() {
  const [allFeatures, categories] = await Promise.all([
    getFeatures(),
    getFeatureCategories(),
  ]);

  const roots = categories.filter((c) => !c.parent || c.parent === 0);
  const childrenOf = (parentId: number): FeatureTerm[] =>
    categories.filter((c) => c.parent === parentId);

  const featureCount     = allFeatures.length;
  // 10 dernières features ajoutées dans les NEW_FEATURE_DAYS jours.
  const recentFeatures   = getRecentFeatures(allFeatures, 10);
  // Features modifiées récemment (mais pas créées récemment).
  const modifiedFeatures = getModifiedFeatures(allFeatures, 10);

  return (
    <>
      {/* ─── Hero — recherche + positionnement support ────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-surface to-white py-16 px-4">
        {/* Grille subtile animée — scroll diagonal très lent, fade en haut/bas
            pour s'intégrer au dégradé sans coupures nettes. Décoratif uniquement. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hero-grid" />

        <div className="relative max-w-3xl mx-auto text-center space-y-5">
          <p className="inline-block text-xs font-semibold uppercase tracking-wider text-primary bg-primary-light px-3 py-1 rounded-[5px]">
            Centre d&apos;aide
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Comment pouvons-nous vous aider ?
          </h1>
          <p className="text-muted text-lg">
            Documentation, assistance et suggestions — tout pour utiliser TIM Management au quotidien.
          </p>
          <SearchBar />
          <p className="text-xs text-muted pt-2">
            Astuce&nbsp;: utilisez <kbd className="px-1.5 py-0.5 rounded border border-border bg-white text-[11px] font-mono">⌘ K</kbd> pour ouvrir la recherche depuis n&apos;importe où.
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-14">

        {/* ─── 4 actions principales — Parcours / Doc / Assistance / Suggestion ─── */}
        <section>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/parcours"
              className="group flex flex-col gap-3 p-6 rounded-lg border border-border bg-white hover:border-primary hover:shadow-md transition-all"
            >
              <span className="text-3xl" aria-hidden>🎓</span>
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  Suivre un parcours
                </h3>
                <p className="text-sm text-muted mt-1">
                  Apprenez les bases étape par étape, selon votre profil utilisateur.
                </p>
              </div>
              <span className="text-sm text-primary font-medium mt-auto">
                Démarrer →
              </span>
            </Link>

            <Link
              href="/features"
              className="group flex flex-col gap-3 p-6 rounded-lg border border-border bg-white hover:border-primary hover:shadow-md transition-all"
            >
              <span className="text-3xl" aria-hidden>📚</span>
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  Parcourir la documentation
                </h3>
                <p className="text-sm text-muted mt-1">
                  {featureCount} fonctionnalité{featureCount > 1 ? "s" : ""} documentée{featureCount > 1 ? "s" : ""}, organisée{featureCount > 1 ? "s" : ""} par thème.
                </p>
              </div>
              <span className="text-sm text-primary font-medium mt-auto">
                Explorer →
              </span>
            </Link>

            <Link
              href="/contact?type=assistance"
              className="group flex flex-col gap-3 p-6 rounded-lg border border-border bg-white hover:border-primary hover:shadow-md transition-all"
            >
              <span className="text-3xl" aria-hidden>💬</span>
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  Demander de l&apos;assistance
                </h3>
                <p className="text-sm text-muted mt-1">
                  Une question ou un problème&nbsp;? Décrivez-le et joignez vos captures d&apos;écran.
                </p>
              </div>
              <span className="text-sm text-primary font-medium mt-auto">
                Contacter le support →
              </span>
            </Link>

            <Link
              href="/contact?type=suggestion"
              className="group flex flex-col gap-3 p-6 rounded-lg border border-border bg-white hover:border-primary hover:shadow-md transition-all"
            >
              <span className="text-3xl" aria-hidden>💡</span>
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  Proposer une amélioration
                </h3>
                <p className="text-sm text-muted mt-1">
                  Vos idées font évoluer TIM Management. Partagez ce qui vous manque.
                </p>
              </div>
              <span className="text-sm text-primary font-medium mt-auto">
                Suggérer →
              </span>
            </Link>
          </div>
        </section>

        {/* ─── Browse par plateforme ─────────────────────────────────────── */}
        {roots.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Parcourir la documentation
            </h2>
            <p className="text-sm text-muted mb-6">
              Choisissez votre plateforme pour explorer les guides correspondants.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {roots.map((root) => {
                const children = childrenOf(root.id);
                const icon = PLATFORM_ICONS[root.slug] ?? "📦";

                return (
                  <Link
                    key={root.id}
                    href={`/features?category=${root.slug}`}
                    className="group flex flex-col gap-3 p-5 rounded-lg border border-border bg-white hover:border-[#b4b4b4] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>{icon}</span>
                      <div>
                        <p className="font-semibold text-foreground group-hover:text-foreground transition-colors">
                          {root.name}
                        </p>
                        <p className="text-xs text-muted">
                          {children.length} catégorie{children.length > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    {children.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {children.slice(0, 6).map((child) => (
                          <span
                            key={child.id}
                            className="text-xs px-2 py-0.5 rounded-[5px] bg-surface border border-border text-muted"
                          >
                            {child.name}
                          </span>
                        ))}
                        {children.length > 6 && (
                          <span className="text-xs px-2 py-0.5 text-muted">
                            +{children.length - 6}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Les nouveautés ─────────────────────────────────────────────
            Encadré blanc + bordure avec la même grille animée que le hero
            (classe .hero-grid) en fond. CTA "Voir toutes les nouveautés"
            en bas qui mène à la page /nouveautes. */}
        {recentFeatures.length > 0 && (
          <section className="relative overflow-hidden rounded-2xl border border-border bg-white px-6 py-8 sm:px-10 sm:py-10">
            {/* Grille subtile animée — même rendu que le hero pour cohérence visuelle. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 hero-grid" />

            <div className="relative">
              <div className="flex items-start justify-between mb-7 gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                    Les nouveautés
                  </h2>
                  <p className="text-sm text-muted mt-1.5">
                    Les fonctionnalités ajoutées ces {NEW_FEATURE_DAYS} derniers jours.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentFeatures.map((feature) => (
                  <FeatureCard key={feature.id} feature={feature} />
                ))}
              </div>

              {/* CTA dédié — page /nouveautes liste l'intégralité des features
                  récentes (utile si > 10 ajouts dans les 30 jours). */}
              <div className="flex justify-center mt-8">
                <Link
                  href="/nouveautes"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
                >
                  Voir toutes les nouveautés
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ─── Mises à jour récentes ───────────────────────────────────────
            Features modifiées (post_modified) dans les MODIFIED_FEATURE_DAYS
            derniers jours et qui ne sont pas considérées comme nouveautés. */}
        {modifiedFeatures.length > 0 && (
          <section className="relative overflow-hidden rounded-2xl border border-border bg-white px-6 py-8 sm:px-10 sm:py-10">
            <div aria-hidden className="pointer-events-none absolute inset-0 hero-grid" />

            <div className="relative">
              <div className="flex items-start justify-between mb-7 gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                    Mises à jour
                  </h2>
                  <p className="text-sm text-muted mt-1.5">
                    Les fonctionnalités modifiées ces {MODIFIED_FEATURE_DAYS} derniers jours.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {modifiedFeatures.map((feature) => (
                  <FeatureCard key={feature.id} feature={feature} />
                ))}
              </div>

              <div className="flex justify-center mt-8">
                <Link
                  href="/mises-a-jour"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
                >
                  Voir toutes les mises à jour
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
