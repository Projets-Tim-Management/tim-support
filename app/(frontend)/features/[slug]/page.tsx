import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFeatureBySlug, getAllFeatureSlugs, getFeatures } from "@/modules/editorial/lib/content";
import { htmlToText } from "@/core/lib/html";
import Breadcrumb from "@/components/ui/Breadcrumb";
import StatusBadge from "@/components/features/StatusBadge";
import DocSection from "@/components/features/DocSection";
import FeedbackWidget from "@/components/features/FeedbackWidget";
import FeatureNav from "@/components/features/FeatureNav";
import ContentProtection from "@/components/ui/ContentProtection";
import { SetActiveCategory } from "@/components/features/active-category-context";

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await getAllFeatureSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const feature = await getFeatureBySlug(slug);
  if (!feature) return {};

  const description = feature.acf?.short_description
    ? htmlToText(feature.acf.short_description).slice(0, 160)
    : undefined;

  return {
    title: feature.acf?.title_feature || feature.title,
    description,
  };
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const feature = await getFeatureBySlug(slug);
  if (!feature) notFound();

  // Features de la même catégorie (ou toutes si pas de catégorie) pour la navigation
  const mainCategory = feature.categories[0];
  const siblings = await getFeatures(mainCategory ? { category: mainCategory.slug } : {});
  const currentIdx = siblings.findIndex((f) => f.slug === slug);
  const prevFeature = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextFeature = currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;
  const updatedDate  = new Date(feature.modified).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  const breadcrumb = [
    { label: "Fonctionnalités", href: "/features" },
    ...(mainCategory ? [{ label: mainCategory.name, href: `/features?category=${mainCategory.slug}` }] : []),
    { label: feature.acf?.title_feature || feature.title },
  ];

  const sections = feature.acf?.doc ?? [];

  return (
    <div className="max-w-5xl px-8 py-8 protected-content">
      <ContentProtection />
      {feature.categories.length > 0 && (
        <SetActiveCategory slugs={feature.categories.map((c) => c.slug)} />
      )}
      <Breadcrumb items={breadcrumb} />

      {/* En-tête */}
      <header className="mt-6 mb-8">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {feature.acf?.status && <StatusBadge status={feature.acf.status} />}
          {feature.platforms.map((p) => (
            <span
              key={p.id}
              className="text-xs font-medium px-2 py-0.5 rounded-[5px] bg-absence-bg text-absence border border-absence/30"
            >
              {p.name}
            </span>
          ))}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
          {feature.acf?.title_feature || feature.title}
        </h1>

        <p className="mt-2 text-xs text-muted">
          Mis à jour le {updatedDate}
        </p>

        {/* Description courte */}
        {feature.acf?.short_description && (
          <div
            className="mt-4 text-muted leading-relaxed wp-content"
            dangerouslySetInnerHTML={{ __html: feature.acf.short_description }}
          />
        )}
      </header>

      {/* Séparateur */}
      {sections.length > 0 && (
        <div className="border-t border-border" />
      )}

      {/* Sections doc */}
      {sections.map((section, i) => (
        <DocSection key={i} section={section} index={i} />
      ))}

      {/* Feedback */}
      <FeedbackWidget postId={feature.id} />

      {/* CTA report — pré-remplit type=bug, sujet et URL pour gagner du temps. */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-lg border border-border bg-surface">
        <p className="text-sm text-muted text-center sm:text-left">
          Un problème sur cette page ou une suggestion ?
        </p>
        <a
          href={`/contact?type=assistance&url=${encodeURIComponent(mainCategory ? `/features?category=${mainCategory.slug}` : "")}&subject=${encodeURIComponent(`Problème sur "${feature.acf?.title_feature || feature.title}"`)}`}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 0 0 1.74-3l-6.93-12a2 2 0 0 0-3.48 0l-6.93 12a2 2 0 0 0 1.74 3z" />
          </svg>
          Signaler un problème
        </a>
      </div>

      {/* Navigation précédent / suivant */}
      <FeatureNav
        prev={prevFeature ? { slug: prevFeature.slug, title: prevFeature.acf?.title_feature || prevFeature.title } : undefined}
        next={nextFeature ? { slug: nextFeature.slug, title: nextFeature.acf?.title_feature || nextFeature.title } : undefined}
      />
    </div>
  );
}
