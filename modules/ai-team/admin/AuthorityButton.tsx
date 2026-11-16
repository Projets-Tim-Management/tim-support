"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

/** « Chercher maintenant » : le rapport d'autorité de Linda, sans attendre le début du mois (trois à six minutes). */
export function AuthorityButton({ name }: { name: string }) {
  return (
    <RunNowButton<{ findings?: number }>
      url="/api/admin/ai-team/authority"
      intro={
        <>
          🔗 <strong>Autorité</strong> : chaque mois, après la mesure de Georges, {name} cherche où TIM est nommé et où il manque, puis vous donne les cibles une à une.
        </>
      }
      label="Chercher maintenant"
      busyLabel={`${name} cherche sur le web… (3 à 6 minutes)`}
      done={(d) => `${d.findings ?? 0} cible${(d.findings ?? 0) > 1 ? "s" : ""} — Serge les reprendra dans vos objectifs.`}
      failed="Le rapport n'a pas pu être fait."
    />
  );
}
