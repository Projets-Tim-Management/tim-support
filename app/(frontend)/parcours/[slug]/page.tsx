import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getParcoursBySlug, getAllParcoursSlugs } from "@/lib/wordpress";
import DocSection from "@/components/features/DocSection";
import StepNavigator from "@/components/parcours/StepNavigator";
import StepsList from "@/components/parcours/StepsList";
import { htmlToText } from "@/lib/html";

export const revalidate = 600;

export async function generateStaticParams() {
  const slugs = await getAllParcoursSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const parcours = await getParcoursBySlug(slug);
  if (!parcours) return {};
  return {
    title:       parcours.title,
    description: parcours.intro ? htmlToText(parcours.intro).slice(0, 160) : undefined,
  };
}

export default async function ParcoursStepPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>;
  searchParams: Promise<{ etape?: string }>;
}) {
  const { slug }    = await params;
  const sp          = await searchParams;
  const parcours    = await getParcoursBySlug(slug);
  if (!parcours || parcours.steps.length === 0) notFound();

  const rawIdx = parseInt(sp.etape ?? "1", 10);
  const idx    = Math.min(
    Math.max(0, isNaN(rawIdx) ? 0 : rawIdx - 1),
    parcours.steps.length - 1
  );
  const step = parcours.steps[idx];

  // Titres compacts pour la sidebar (titre ACF si renseigné, sinon post_title)
  const stepsSummary = parcours.steps.map((s) => ({
    slug:  s.slug,
    title: s.acf?.title_feature || s.title,
  }));

  return (
    <div className="protected-content">
      <StepNavigator
        slug={parcours.slug}
        totalSteps={parcours.steps.length}
        currentIdx={idx}
        profil={parcours.profil}
      >
        {/* Layout 2 colonnes : sidebar étapes (gauche) + contenu (centre).
            Largeur 90 % du viewport pour exploiter l'espace ; sidebar cachée
            sous lg sur petits écrans. */}
        <div className="w-[90%] max-w-[1600px] mx-auto px-4 py-8 flex gap-10">
          <StepsList
            slug={parcours.slug}
            steps={stepsSummary}
            currentIdx={idx}
            parcoursTitle={parcours.title}
            parcoursIntro={parcours.intro}
            profil={parcours.profil}
          />

          <main className="flex-1 min-w-0">

            {/* Indicateur d'étape */}
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Étape {idx + 1} sur {parcours.steps.length}
              </p>
            </div>

            {/* Contenu = la fiche feature */}
            <article>
              <header className="mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
                  {step.acf?.title_feature || step.title}
                </h2>
                {step.acf?.short_description && (
                  <div
                    className="mt-3 text-muted leading-relaxed wp-content"
                    dangerouslySetInnerHTML={{ __html: step.acf.short_description }}
                  />
                )}
                <Link
                  href={`/features/${step.slug}`}
                  className="inline-flex items-center gap-1 mt-4 text-xs text-muted hover:text-primary transition-colors"
                >
                  Voir la fiche complète
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              </header>

              {(step.acf?.doc ?? []).length > 0 && (
                <div className="border-t border-border" />
              )}

              {(step.acf?.doc ?? []).map((section, i) => (
                <DocSection key={i} section={section} index={i} />
              ))}
            </article>
          </main>
        </div>
      </StepNavigator>
    </div>
  );
}
