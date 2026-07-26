"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  loadProgress,
  validateStep,
  maxAccessibleStep,
  resetProgress,
} from "@/modules/editorial/lib/parcours-progress";
import { burstAt } from "@/core/ui/confetti";

interface Props {
  slug:        string;       // slug du parcours
  totalSteps:  number;       // nombre total d'étapes
  currentIdx:  number;       // étape actuelle (0-based)
  /** Slug du profil — utilisé pour la redirection ciblée en fin de parcours. */
  profil?:     string;
  children?:   React.ReactNode; // contenu rendu entre la barre du haut et celle du bas
}

/**
 * Navigation + progression d'un parcours en mode tuto forcé.
 *
 *  - Au mount, vérifie que l'utilisateur a le droit d'accéder à l'étape demandée
 *    (selon localStorage). Sinon → redirige sur la dernière étape accessible.
 *  - "Suivant" valide l'étape courante puis avance.
 *  - "Précédent" est libre tant qu'on reste dans les étapes déjà déverrouillées.
 *  - Barre de progression visible en haut.
 */
export default function StepNavigator({ slug, totalSteps, currentIdx, profil, children }: Props) {
  // Destination de fin de parcours : on renvoie sur la liste filtrée pour
  // garder le contexte (profil de l'utilisateur), pas sur la sélection.
  const finishHref = profil ? `/parcours?profil=${profil}` : "/parcours";
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [validatedCount, setValidatedCount] = useState(0);
  const [hydrated,       setHydrated]       = useState(false);
  const [finishing,      setFinishing]      = useState(false); // état "fin de parcours en cours"

  // Au mount : lit le localStorage et enforce la progression linéaire.
  useEffect(() => {
    const prog       = loadProgress(slug);
    const maxAllowed = maxAccessibleStep(prog);
    setValidatedCount(prog.validated.length);
    setHydrated(true);

    // L'utilisateur tente d'accéder à une étape pas encore débloquée → redirige.
    if (currentIdx > maxAllowed) {
      const target = Math.min(maxAllowed, totalSteps - 1);
      const params = new URLSearchParams(searchParams);
      params.set("etape", String(target + 1));
      router.replace(`?${params.toString()}`);
    }
  }, [slug, currentIdx, totalSteps, router, searchParams]);

  function goToStep(idx: number) {
    const params = new URLSearchParams(searchParams);
    params.set("etape", String(idx + 1));
    startTransition(() => router.push(`?${params.toString()}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNext(e: React.MouseEvent<HTMLButtonElement>) {
    const prog = validateStep(slug, currentIdx);
    setValidatedCount(prog.validated.length);

    // Pas la dernière étape : on enchaîne normalement.
    if (currentIdx < totalSteps - 1) {
      goToStep(currentIdx + 1);
      return;
    }

    // Dernière étape — petit burst depuis le bouton + redirection après 2 s.
    if (finishing) return; // protection contre double-clic
    setFinishing(true);

    const rect = e.currentTarget.getBoundingClientRect();
    burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2);

    // Délai avant redirection — laisse à l'utilisateur le temps de profiter
    // du burst et du bouton "🎉 Bravo !" avant de basculer sur la liste
    // des parcours de son profil (CDC, admin, etc.).
    window.setTimeout(() => {
      router.push(finishHref);
    }, 100);
  }

  function handlePrev() {
    if (currentIdx > 0) goToStep(currentIdx - 1);
  }

  function handleRestart() {
    resetProgress(slug);
    setValidatedCount(0);
    goToStep(0);
  }

  const isLast    = currentIdx === totalSteps - 1;
  const completed = hydrated && validatedCount >= totalSteps;

  return (
    <>
      {/* Contenu principal (rendu au-dessus de la bottom nav sticky) */}
      {children}

      {/* Footer de navigation — fixe en bas, version compacte */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-border mt-2.5">
        <div className="max-w-3xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIdx === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Précédent
          </button>

          {completed && isLast ? (
            <button
              type="button"
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-white border border-border text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              Recommencer
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleNext}
            disabled={finishing}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-80 disabled:cursor-default transition-colors"
          >
            {finishing
              ? "🎉 Bravo !"
              : isLast
                ? "Terminer le parcours ✓"
                : "J'ai compris, suivant"}
            {!isLast && !finishing && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
