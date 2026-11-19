"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

type Result = { measured?: number; left?: number; total?: number; costEur?: number; report?: { status?: string; findings?: number } | null };

/** « Mesurer maintenant » : Georges avance la mesure du mois sans attendre le cron (2 à 4 minutes), puis fait son rapport si elle est complète. */
export function VisibilityButton({ name }: { name: string }) {
  return (
    <RunNowButton<Result>
      url="/api/admin/ai-team/ai-visibility"
      intro={
        <>
          ✨ <strong>Visibilité IA</strong> : dès le 1er du mois, {name} pose les questions du panel aux IA branchées, une minute après l&apos;autre, puis écrit son rapport.
        </>
      }
      label="Mesurer maintenant"
      busyLabel={`${name} interroge les IA… (2 à 4 minutes)`}
      done={(d) => {
        const cost = (d.costEur ?? 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
        const line = `${d.measured ?? 0} réponse${(d.measured ?? 0) > 1 ? "s" : ""} lue${(d.measured ?? 0) > 1 ? "s" : ""} (${cost}).`;
        if (d.left) return `${line} Il en reste ${d.left} sur ${d.total} : la suite continue toute seule.`;
        if (d.report?.status === "fait") return `${line} Mesure complète — ${d.report.findings ?? 0} action(s) pour Sergey.`;
        return `${line} Mesure complète ; le rapport du mois est déjà fait.`;
      }}
      failed="La mesure n'a pas pu avancer."
    />
  );
}
