"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

/** « Préparer le plan maintenant » : le plan de contenu de Paige, sans attendre lundi (deux à quatre minutes). */
export function ContentPlanButton({ name }: { name: string }) {
  return (
    <RunNowButton<{ findings?: number }>
      url="/api/admin/ai-team/content-plan"
      intro={
        <>
          📝 <strong>Plan de contenu</strong> : chaque lundi matin, {name} croise Search Console, l&apos;entonnoir d&apos;Ana et la veille de Guy, et propose les pages à créer ou rafraîchir.
        </>
      }
      label="Préparer le plan maintenant"
      busyLabel={`${name} prépare le plan de contenu… (2 à 4 minutes)`}
      done={(d) => `${d.findings ?? 0} action${(d.findings ?? 0) > 1 ? "s" : ""} — Serge les reprendra dans vos objectifs.`}
      failed="Le plan n'a pas pu être fait."
    />
  );
}
