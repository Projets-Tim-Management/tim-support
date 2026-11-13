import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { hasAdminRole } from "@/core/access";
import { ConnectionCard, type Entry } from "@/admin/connections/ConnectionCard";
import { summarizeSpend, type SpendEntry } from "@/core/lib/ai-budget";
import { KIND_TEXT, openApiAlerts } from "@/core/lib/api-health";
import { SUPPORT_CONNECTIONS, connectionEnv, isConfigured, isSimulated } from "@/core/lib/support-connections";

/**
 * Écran « Connexions du support » (/admin/connexions-support, menu Système).
 *
 * Les API que ce back-office utilise lui-même — Pennylane, Brevo, INSEE,
 * Google — et pour chacune : à quoi elle sert, quelles variables elle attend
 * et si elles sont posées, un bouton pour la tester, le dernier résultat, des
 * notes. AUCUNE clé ne se saisit ni ne s'affiche ici : elles vivent sur Vercel,
 * un coffre par environnement. L'écran lit `process.env` au rendu.
 *
 * Rien à voir avec les développements : c'est l'outillage du back-office
 * lui-même, d'où sa place dans le groupe Système, avec les comptes et les
 * boîtes connectées.
 *
 * Server component : `process.env` n'est lisible que côté serveur, et c'est
 * bien — l'état des variables ne doit jamais partir dans un bundle client.
 */
export default async function SupportConnectionsView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const { payload, user } = req;
  const isAdmin = hasAdminRole(user);

  const global = isAdmin
    ? ((await payload.findGlobal({ slug: "support-connections", depth: 0, overrideAccess: true })) as { entries?: ({ key: string } & Entry & SpendEntry)[] | null })
    : null;
  const entries = new Map((global?.entries ?? []).map((e) => [e.key, e]));
  // Les API en panne (paiement, accès, échecs répétés) : en tête de l'écran, avec le lien pour régler.
  const alerts = isAdmin ? await openApiAlerts(payload) : [];
  const since = (iso: string | null) => (iso ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");

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

          {alerts.length > 0 && (
            <section className="sc-alerts" role="alert">
              <h2 className="sc-alerts__title">⚠️ {alerts.length === 1 ? "Une API ne répond plus" : `${alerts.length} API ne répondent plus`}</h2>
              <ul className="sc-alerts__list">
                {alerts.map((a) => (
                  <li key={a.provider} className="sc-alerts__item">
                    <strong>{a.label}</strong> — {KIND_TEXT[a.kind].title}, depuis le {since(a.since)}.
                    {a.message && <span className="sc-alerts__msg"> « {a.message} »</span>} {KIND_TEXT[a.kind].todo}{" "}
                    <a href={a.fix} target={a.fix.startsWith("/") ? undefined : "_blank"} rel="noreferrer noopener">
                      Régler le problème
                    </a>
                  </li>
                ))}
              </ul>
              <p className="sc-alerts__note">L&apos;alerte se ferme toute seule au premier appel réussi — ou avec « Tester » sur la carte de l&apos;API.</p>
            </section>
          )}

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
                    simulated={isSimulated(def)}
                    initial={{ notes: e?.notes ?? null, lastTestAt: e?.lastTestAt ?? null, lastTestOk: e?.lastTestOk ?? null, lastTestMessage: e?.lastTestMessage ?? null }}
                    spend={def.key === "anthropic" ? summarizeSpend(e) : undefined}
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
