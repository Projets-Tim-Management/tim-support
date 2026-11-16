import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { isDirection } from "@/core/access";
import { RoadmapBoard } from "@/modules/ai-team/admin/RoadmapBoard";
import { loadRoadmap } from "@/modules/ai-team/lib/roadmap";

/**
 * Écran « Feuille de route » (/admin/feuille-de-route, 14/11/2026) — réservé à
 * la direction : les objectifs à 3, 6 et 12 mois des deux équipes, la courbe
 * des résultats avec les actions posées dessus, le journal des actions et ce
 * qui marche chez TIM. Voir lib/roadmap.
 */
export default async function RoadmapPage({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const allowed = isDirection(req.user);
  const view = allowed ? await loadRoadmap(req.payload) : null;
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <div className="ait">
          <header className="ait-head">
            <h1 className="ait-title">Feuille de route</h1>
            <p className="ait-sub">Objectifs à 3, 6 et 12 mois, actions des agents et des équipes, et ce qu&apos;elles ont donné.</p>
          </header>
          {view ? <RoadmapBoard view={view} /> : <p className="ait-empty">Cet écran est réservé à la direction.</p>}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
