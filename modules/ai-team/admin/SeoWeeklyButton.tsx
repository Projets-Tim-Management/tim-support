"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

/** « Préparer mes objectifs maintenant » : la revue de Sergey, sans attendre lundi (deux à quatre minutes). */
export function SeoWeeklyButton({ name }: { name: string }) {
  return (
    <RunNowButton<{ objectives?: number; booked?: number }>
      url="/api/admin/ai-team/seo-weekly"
      intro={
        <>
          🎯 <strong>Objectifs de la semaine</strong> : chaque lundi matin, {name} analyse le site, Google et les IA, vous fixe vos objectifs et les pose dans votre agenda.
        </>
      }
      label="Préparer mes objectifs maintenant"
      busyLabel={`${name} analyse et prépare vos objectifs… (2 à 4 minutes)`}
      done={(d) => `${d.objectives ?? 0} objectif${(d.objectives ?? 0) > 1 ? "s" : ""} fixé${(d.objectives ?? 0) > 1 ? "s" : ""}${d.booked ? `, ${d.booked} créneau${d.booked > 1 ? "x" : ""} dans votre agenda` : ""}.`}
      failed="La revue n'a pas pu être faite."
    />
  );
}
