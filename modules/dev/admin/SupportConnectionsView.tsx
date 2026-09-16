import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { hasAdminRole } from "@/core/access";
import { ConnectionCard, type Entry } from "@/modules/dev/admin/ConnectionCard";
import { SUPPORT_CONNECTIONS, connectionEnv, isConfigured } from "@/modules/dev/lib/support-connections";

/**
 * Écran « Connexions du support » (/admin/connexions-support, Paramètres).
 *
 * Les API que ce back-office utilise lui-même — Pennylane, Brevo, INSEE,
 * Google — et pour chacune : à quoi elle sert, quelles variables elle attend
 * et si elles sont posées, un bouton pour la tester, le dernier résultat, des
 * notes. AUCUNE clé ne se saisit ni ne s'affiche ici : elles vivent sur Vercel,
 * un coffre par environnement. L'écran lit `process.env` au rendu.
 *
 * Server component : `process.env` n'est lisible que côté serveur, et c'est
 * bien — l'état des variables ne doit jamais partir dans un bundle client.
 */
export default async function SupportConnectionsView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const { payload, user } = req;
  const isAdmin = hasAdminRole(user);

  const global = isAdmin
    ? ((await payload.findGlobal({ slug: "support-connections", depth: 0, overrideAccess: true })) as { entries?: ({ key: string } & Entry)[] | null })
    : null;
  const entries = new Map((global?.entries ?? []).map((e) => [e.key, e]));

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <div className="sc">
          <header className="sc-head">
            <h1 className="sc-title">Connexions du support</h1>
            <p className="sc-sub">
              Les API que ce back-office utilise. Les clés vivent sur Vercel — ici on voit ce qui est posé, on teste, on note.
            </p>
          </header>

          {!isAdmin ? (
            <p className="sc-empty">Cet écran est réservé aux administrateurs.</p>
          ) : (
            <div className="sc-list">
              {SUPPORT_CONNECTIONS.map((def) => {
                const e = entries.get(def.key);
                return (
                  <ConnectionCard
                    key={def.key}
                    def={def}
                    env={connectionEnv(def)}
                    configured={isConfigured(def)}
                    initial={{ notes: e?.notes ?? null, lastTestAt: e?.lastTestAt ?? null, lastTestOk: e?.lastTestOk ?? null, lastTestMessage: e?.lastTestMessage ?? null }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
