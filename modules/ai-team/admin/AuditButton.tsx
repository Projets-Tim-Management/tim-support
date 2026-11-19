"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

/** « Lancer l'audit maintenant » : l'audit du site vitrine par l'analyste SEO/GEO, sans attendre le début du mois. */
export function AuditButton({ name }: { name: string }) {
  return (
    <RunNowButton<{ findings?: number }>
      url="/api/admin/ai-team/site-audit"
      intro={
        <>
          🔬 <strong>Audit du site</strong> : chaque début de mois, {name} relit le site vitrine (technique, contenu, conversion) à la lumière de l&apos;entonnoir.
        </>
      }
      label="Lancer l'audit maintenant"
      busyLabel={`${name} audite le site… (2 à 4 minutes)`}
      done={(d) => `${d.findings ?? 0} constat${(d.findings ?? 0) > 1 ? "s" : ""} — Sergey les reprendra dans vos objectifs.`}
      failed="L'audit n'a pas pu être fait."
    />
  );
}
