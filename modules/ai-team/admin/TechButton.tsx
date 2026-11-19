"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

/** « Contrôler maintenant » : le contrôle technique de Robert, sans attendre le début du mois (trois à cinq minutes). */
export function TechButton({ name }: { name: string }) {
  return (
    <RunNowButton<{ findings?: number }>
      url="/api/admin/ai-team/site-health"
      intro={
        <>
          🔧 <strong>Contrôle technique</strong> : le premier jour ouvré du mois, {name} lit toutes les pages du site, leur indexation et le robots.txt, puis vous donne les tâches pas à pas.
        </>
      }
      label="Contrôler maintenant"
      busyLabel={`${name} contrôle le site… (3 à 5 minutes)`}
      done={(d) => `${d.findings ?? 0} tâche${(d.findings ?? 0) > 1 ? "s" : ""} — Sergey les reprendra dans vos objectifs.`}
      failed="Le contrôle n'a pas pu être fait."
    />
  );
}
