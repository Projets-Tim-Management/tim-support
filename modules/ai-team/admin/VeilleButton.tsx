"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";
import { euro } from "@/modules/ai-team/lib/format";

/**
 * « Lancer sa veille maintenant » : la veille web d'un agent, à la demande
 * (sinon le dimanche soir). Deux à quatre minutes ; la nouvelle méthode
 * s'affiche sur sa fiche.
 */
export function VeilleButton({ memberKey, name }: { memberKey: string; name: string }) {
  return (
    <RunNowButton<{ costEur?: number }>
      url="/api/admin/ai-team/veille"
      body={{ member: memberKey }}
      intro={
        <>
          🔎 <strong>Veille de la semaine</strong> : chaque dimanche soir, {name} fait le tour du web dans son domaine et réécrit sa méthode pour TIM.
        </>
      }
      label="Lancer sa veille maintenant"
      busyLabel={`${name} fait sa veille… (2 à 4 minutes)`}
      done={(d) => `Méthode mise à jour${typeof d.costEur === "number" ? ` (${euro(d.costEur, 2, 3)})` : ""}.`}
      failed="La veille n'a pas pu être faite."
    />
  );
}
