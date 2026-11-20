"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

/** « Lancer la veille maintenant » : les plans de site des concurrents, puis le rapport de Guy (deux à quatre minutes). */
export function CompetitionButton({ name }: { name: string }) {
  return (
    <RunNowButton<{ findings?: number }>
      url="/api/admin/ai-team/competition"
      intro={
        <>
          🔭 <strong>Veille de la semaine</strong> : chaque dimanche soir, {name} lit le site de chaque concurrent ; lundi matin, il remet à Sergey ce qui a bougé et ce que TIM n&apos;a pas.
        </>
      }
      label="Lancer la veille maintenant"
      busyLabel={`${name} lit les sites des concurrents… (2 à 4 minutes)`}
      done={(d) => `${d.findings ?? 0} constat${(d.findings ?? 0) > 1 ? "s" : ""} — Sergey les reprendra dans vos objectifs.`}
      failed="La veille n'a pas pu être faite."
    />
  );
}
