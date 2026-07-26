"use client";

import { useEffect, useState } from "react";
import { loadProgress, parcoursStatus, progressPercent, type ParcoursStatus } from "@/modules/editorial/lib/parcours-progress";

interface Props {
  slug:       string;
  totalSteps: number;
}

const STYLES: Record<ParcoursStatus, { label: string; cls: string }> = {
  not_started: { label: "À commencer", cls: "bg-surface text-muted border-border" },
  in_progress: { label: "En cours",    cls: "bg-processing-bg text-processing-text border-processing/30" },
  completed:   { label: "Terminé ✓",   cls: "bg-success-bg text-success-text border-success/30" },
};

/**
 * Affiche un petit badge avec le statut de progression du parcours pour le
 * visiteur courant (basé sur localStorage). Rendu uniquement après mount pour
 * éviter le mismatch hydration (le serveur ne connaît pas le localStorage).
 */
export default function ParcoursProgressBadge({ slug, totalSteps }: Props) {
  const [status,  setStatus]  = useState<ParcoursStatus | null>(null);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const prog = loadProgress(slug);
    setStatus(parcoursStatus(prog, totalSteps));
    setPercent(progressPercent(prog, totalSteps));
  }, [slug, totalSteps]);

  if (!status) return null;

  const style = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[5px] border ${style.cls}`}>
      {style.label}
      {status === "in_progress" && <span className="opacity-70">· {percent}%</span>}
    </span>
  );
}
