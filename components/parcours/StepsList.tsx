"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loadProgress, maxAccessibleStep, progressPercent } from "@/modules/editorial/lib/parcours-progress";

interface Step {
  slug:  string;
  title: string;
}

interface Props {
  slug:           string;
  steps:          Step[];
  currentIdx:     number;
  /** Titre et intro du parcours, affichés en tête de la sidebar. */
  parcoursTitle:  string;
  parcoursIntro?: string;
  /** Slug du profil — détermine la destination du bouton "Quitter". */
  profil?:        string;
}

/**
 * Sidebar de gauche : liste des étapes du parcours avec leur statut visuel.
 *
 *   ✓  Étape validée  → texte gris FONCÉ (foreground)
 *   →  Étape courante → fond rose pâle, texte rouge marque, bordure
 *   🔒 Étape future    → texte gris CLAIR, non cliquable
 *
 * Click sur une étape déjà validée : revient dessus.
 * Click sur étape future : ignoré (la nav linéaire forcée passe par "Suivant").
 */
export default function StepsList({ slug, steps, currentIdx, parcoursTitle, parcoursIntro, profil }: Props) {
  const exitHref = profil ? `/parcours?profil=${profil}` : "/parcours";
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [validated, setValidated] = useState<number[]>([]);
  const [hydrated,  setHydrated]  = useState(false);
  const [maxAllowed, setMaxAllowed] = useState(0);

  useEffect(() => {
    const prog = loadProgress(slug);
    setValidated(prog.validated);
    setMaxAllowed(maxAccessibleStep(prog));
    setHydrated(true);
  }, [slug, currentIdx]);

  // Pourcentage de progression. Au minimum, l'étape actuelle compte comme
  // entamée pour que la barre ne reste pas vide quand on découvre un parcours.
  const rawPercent = hydrated ? progressPercent({ validated }, steps.length) : 0;
  const minPercent = ((currentIdx + 1) / steps.length) * 100;
  const percent    = Math.max(rawPercent, hydrated ? minPercent : 0);

  function goTo(idx: number) {
    const params = new URLSearchParams(searchParams);
    params.set("etape", String(idx + 1));
    router.push(`?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <aside className="hidden lg:block w-80 shrink-0">
      <div className="sticky top-20 space-y-5">

        {/* Bouton Quitter — en tête, au-dessus du libellé "Parcours" */}
        <Link
          href={exitHref}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border bg-white text-xs font-medium text-foreground hover:bg-surface transition-colors"
          title="Votre progression est sauvegardée"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Quitter
        </Link>

        {/* Bandeau parcours — titre + intro, toujours visibles */}
        <div className="px-3 pb-4 border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">
            Parcours
          </p>
          <h2 className="text-lg font-bold text-foreground leading-tight">
            {parcoursTitle}
          </h2>
          {parcoursIntro && (
            <p className="mt-2 text-xs text-muted leading-relaxed">
              {parcoursIntro}
            </p>
          )}
        </div>

        {/* Barre de progression + numéro d'étape, côte à côte */}
        <div className="px-3">
          <div className="flex items-center justify-between mb-2 gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Progression
            </span>
            <span className="text-xs font-semibold text-foreground tabular-nums whitespace-nowrap">
              Étape {currentIdx + 1} / {steps.length}
            </span>
          </div>
          <div className="h-2 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3 px-3 pt-2">
          Étapes
        </p>
        <ol className="space-y-1">
          {steps.map((step, idx) => {
            const isValidated = hydrated && validated.includes(idx);
            const isCurrent   = idx === currentIdx;
            const isLocked    = hydrated && idx > maxAllowed && !isCurrent;

            // Status visuel
            let cls   = "text-muted";        // par défaut (non hydraté ou neutre)
            let icon  = `${idx + 1}`;
            let title = "text-muted";

            if (isCurrent) {
              cls   = "bg-primary-light text-primary border-primary/30";
              icon  = "→";
              title = "text-primary font-semibold";
            } else if (isValidated) {
              // Étape validée : pastille verte mais texte qui reste noir (foreground)
              cls   = "text-foreground";
              icon  = "✓";
              title = "text-foreground";
            } else if (isLocked) {
              cls   = "text-muted opacity-60"; // gris clair : étape à venir
              title = "text-muted";
            }

            const clickable = isValidated && !isCurrent;

            const Inner = (
              <div className={`flex items-start gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${cls} ${
                isCurrent ? "border" : "border border-transparent"
              } ${clickable ? "hover:bg-surface cursor-pointer" : ""}`}>
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 ${
                  isCurrent   ? "bg-primary text-white" :
                  isValidated ? "bg-success-bg text-success-text border border-success/30" :
                                "bg-surface border border-border text-muted"
                }`}>
                  {icon}
                </span>
                <span className={`flex-1 leading-snug line-clamp-2 ${title}`}>
                  {step.title}
                </span>
              </div>
            );

            return (
              <li key={idx}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => goTo(idx)}
                    className="w-full text-left"
                  >
                    {Inner}
                  </button>
                ) : (
                  Inner
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
