import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { hasAdminRole } from "@/core/access";
import { Shell, type AnalyticsPage as PageKey } from "@/modules/analytics/admin/ui";

/**
 * Le squelette commun des six écrans « Analyses » : le gabarit Payload, la
 * coquille (titre, onglets), et la barrière admin. Chaque vue ne garde que
 * son chargement de données et son rapport.
 */
export function AnalyticsPage({
  view,
  page,
  title,
  children,
}: {
  view: AdminViewServerProps;
  page: PageKey;
  title: string;
  /** Le rapport, déjà rendu — ignoré pour un non-admin. */
  children: React.ReactNode;
}) {
  const { initPageResult, params, searchParams } = view;
  const { req } = initPageResult;
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
        <Shell page={page} title={title}>
          {hasAdminRole(req.user) ? children : <p className="an-empty">Cet écran est réservé aux administrateurs.</p>}
        </Shell>
      </Gutter>
    </DefaultTemplate>
  );
}
