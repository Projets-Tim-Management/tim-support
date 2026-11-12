"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

/**
 * « Lancer la revue maintenant » : la revue du lundi de la directrice SEA, à la
 * demande. Une minute environ ; la synthèse arrive dans la conversation, les
 * recommandations dans « Vos demandes ».
 */
export function ReviewButton({ name }: { name: string }) {
  return (
    <RunNowButton<{ created?: number }>
      url="/api/admin/ai-team/review"
      intro={
        <>
          📅 <strong>Revue du lundi</strong> : chaque lundi vers 10 h, {name} lit la fiche des canaux et vous dépose ses recommandations.
        </>
      }
      label="Lancer la revue maintenant"
      busyLabel={`${name} prépare sa revue… (une minute environ)`}
      done={(d) => (d.created ? `${d.created} recommandation${d.created > 1 ? "s" : ""} dans « Vos demandes ».` : "Revue faite : rien à vous demander cette fois.")}
      failed="La revue n'a pas pu être faite."
    />
  );
}
