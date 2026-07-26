"use client";

import { useEffect, useState } from "react";
import { loadProgress, parcoursStatus, type ParcoursStatus } from "@/modules/editorial/lib/parcours-progress";

interface Props {
  slug:       string;
  totalSteps: number;
  index:      number;
}

/**
 * Numéro du parcours, rendu en cercle.
 *  - Statut "completed" → vert (success-bg / success-text), identique au badge "Terminé"
 *  - Sinon → gris neutre (surface + muted)
 *
 * Rendu côté client uniquement (statut basé sur localStorage du visiteur).
 * Pendant le SSR / avant hydration, on rend la version grise par défaut.
 */
export default function ParcoursNumberPastille({ slug, totalSteps, index }: Props) {
  const [status, setStatus] = useState<ParcoursStatus | null>(null);

  useEffect(() => {
    const prog = loadProgress(slug);
    setStatus(parcoursStatus(prog, totalSteps));
  }, [slug, totalSteps]);

  const isCompleted = status === "completed";

  return (
    <span
      className={`shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold tabular-nums border transition-colors ${
        isCompleted
          ? "bg-success-bg text-success-text border-success/30"
          : "bg-surface text-muted border-border"
      }`}
    >
      {index}
    </span>
  );
}
