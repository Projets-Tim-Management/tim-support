import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import Link from "next/link";

import { compact } from "@/admin/dashboard/format";
import { Icons } from "@/admin/dashboard/icons";
import StatTile from "@/admin/dashboard/StatTile";
import { hasAdminRole } from "@/core/access";
import { CAMPAIGN_STATUSES, OBJECTIVES } from "@/modules/ads/collections/AdCampaigns";
import { PERIODS, buildAdsDashboard, deltaPct, periodDays, type AdsDashboard, type DashAccount, type DashCampaign, type DashMetric } from "@/modules/ads/lib/dashboard";
import { platformLabel } from "@/modules/ads/lib/platforms";
import { Card } from "@/modules/analytics/admin/ui";
import { DataTable, type Column } from "@/modules/analytics/admin/DataTable";

import { DailyChart } from "./DailyChart";

/**
 * Publicité › Tableau de bord (/admin/publicite) — EN LECTURE (phase 0).
 *
 * L'ordre est celui du plan (§8) : d'abord ce qui attend une décision — c'est
 * l'écran qu'on ouvrira tous les matins —, puis l'état des comptes (un jeton qui
 * expire fige tout le reste), puis les chiffres.
 *
 * Tout vient de `ad-metrics-daily` et `ad-campaigns`, écrits par la synchro :
 * aucun appel à la régie ici. Server component, admin seul.
 */

const BASE = "/admin/publicite";

const STATUS_LABELS = Object.fromEntries(CAMPAIGN_STATUSES.map((s) => [s.value, s.label]));
const OBJECTIVE_LABELS = Object.fromEntries(OBJECTIVES.map((o) => [o.value, o.label]));

const COLUMNS: Column[] = [
  { key: "name", label: "Campagne" },
  { key: "account", label: "Compte" },
  { key: "status", label: "État", format: "badge", labels: STATUS_LABELS, tones: { active: "ok", "en-pause": "warn", terminee: "muted", brouillon: "muted" } },
  { key: "objective", label: "Objectif", format: "badge", labels: OBJECTIVE_LABELS },
  { key: "spend", label: "Dépense", format: "eur" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "clicks", label: "Clics", format: "int" },
  { key: "ctr", label: "Taux de clic", format: "pct" },
  { key: "leads", label: "Leads", format: "int" },
  { key: "cpl", label: "Coût par lead", format: "eur" },
];

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 1000 ? 0 : 2 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const pctLabel = (d: number | null) => (d == null ? undefined : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("fr-FR")} %`);

function Filters({ d, platform }: { d: AdsDashboard; platform: string | null }) {
  const href = (p: string | null, days: number) => {
    const q = new URLSearchParams();
    if (p) q.set("regie", p);
    if (days !== 30) q.set("j", String(days));
    const s = q.toString();
    return s ? `${BASE}?${s}` : BASE;
  };
  return (
    <div className="ads-dash__filters">
      {d.platforms.length > 1 && (
        <nav className="an-filters" aria-label="Régie">
          <Link href={href(null, d.period.days)} prefetch={false} className={`an-filter${!platform ? " an-filter--on" : ""}`}>
            Toutes les régies
          </Link>
          {d.platforms.map((p) => (
            <Link key={p} href={href(p, d.period.days)} prefetch={false} className={`an-filter${platform === p ? " an-filter--on" : ""}`}>
              {platformLabel(p)}
            </Link>
          ))}
        </nav>
      )}
      <nav className="an-filters" aria-label="Période">
        {PERIODS.map((n) => (
          <Link key={n} href={href(platform, n)} prefetch={false} className={`an-filter${n === d.period.days ? " an-filter--on" : ""}`}>
            {n} jours
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Report({ d, platform, toValidate = 0 }: { d: AdsDashboard; platform: string | null; toValidate?: number }) {
  const accountsHref = "/admin/collections/ad-accounts";
  const compared = `vs les ${d.period.days} jours précédents`;
  const delta = (cur: number, prev: number) => deltaPct(cur, prev, d.previous.covered);
  const tile = (cur: number, prev: number) => {
    const v = delta(cur, prev);
    return v == null ? {} : { delta: v, deltaLabel: pctLabel(v), deltaTitle: compared };
  };

  return (
    <>
      {d.simulated && (
        <p className="ads-simulated">
          <strong>Données simulées</strong> : ces chiffres incluent le compte « [SIMULÉ] », inventé pour tester l&apos;écran. Archivez-le
          une fois le vrai compte connecté — les comptes archivés ne sont plus comptés ici.
        </p>
      )}

      {/* 1. Ce qui attend une décision — en tête, même vide. */}
      <section className={`ads-dash__todo${toValidate ? " ads-dash__todo--active" : ""}`}>
        <span className="ads-dash__todo-count">{toValidate}</span>
        <span className="ads-dash__todo-text">
          <strong>À valider</strong>
          <span>
            {toValidate ? (
              <>
                {toValidate} créa{toValidate > 1 ? "s" : ""} attend{toValidate > 1 ? "ent" : ""} une décision.{" "}
                <Link href="/admin/publicite/a-valider" prefetch={false}>
                  Ouvrir la file
                </Link>
              </>
            ) : (
              "Rien pour l'instant. Les créas générées arrivent ici ; les propositions des agents (budgets, pauses) suivront en phase 2."
            )}
          </span>
        </span>
      </section>

      {/* 2. Les comptes : un jeton qui expire fige tout ce qui suit. */}
      {d.accounts.active === 0 ? (
        <section className="ads-dash__accounts ads-dash__accounts--empty">
          <span>Aucun compte publicitaire suivi.</span>
          <Link href={accountsHref} prefetch={false} className="tim-btn tim-btn--primary">
            Connecter un compte
          </Link>
        </section>
      ) : d.alerts.length ? (
        <ul className="ads-dash__alerts">
          {d.alerts.map((a) => (
            <li key={String(a.id)} className={`ads-dash__alert ads-dash__alert--${a.tone}`}>
              <Link href={`${accountsHref}/${a.id}`} prefetch={false}>
                <strong>{a.name}</strong>
              </Link>{" "}
              — {a.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ads-dash__accounts">
          {d.accounts.active} compte{d.accounts.active > 1 ? "s" : ""} suivi{d.accounts.active > 1 ? "s" : ""}, à jour
          {d.lastSyncAt ? ` — dernière synchro le ${when(d.lastSyncAt)}` : ""}.
          {d.accounts.archived ? ` ${d.accounts.archived} archivé${d.accounts.archived > 1 ? "s" : ""}, non compté${d.accounts.archived > 1 ? "s" : ""}.` : ""}{" "}
          <Link href={accountsHref} prefetch={false}>
            Gérer les comptes
          </Link>
        </p>
      )}

      {d.accounts.otherCurrency.length > 0 && (
        <p className="ads-dash__note">
          Non additionnés (devise autre que l&apos;euro) : {d.accounts.otherCurrency.join(", ")}.
        </p>
      )}

      {/* 3. Les chiffres. */}
      <div className="dash__kpis ads-dash__kpis">
        <StatTile
          icon={Icons.euro()}
          label="Dépense"
          value={eur(d.totals.spend)}
          sub={`${d.period.days} derniers jours, aujourd'hui compris`}
          sparkline={d.daily.map((p) => p.spend)}
          {...tile(d.totals.spend, d.previous.spend)}
        />
        <StatTile icon={Icons.users()} label="Impressions" value={compact(d.totals.impressions)} {...tile(d.totals.impressions, d.previous.impressions)} />
        <StatTile
          icon={Icons.target()}
          label="Clics"
          value={compact(d.totals.clicks)}
          sub={d.totals.ctr != null ? `taux de clic ${d.totals.ctr.toLocaleString("fr-FR")} %` : undefined}
          {...tile(d.totals.clicks, d.previous.clicks)}
        />
        <StatTile
          icon={Icons.inbox()}
          label="Leads (comptés par la régie)"
          value={compact(d.totals.leads)}
          sub={d.totals.cpl != null ? `coût par lead ${eur(d.totals.cpl)}` : "aucun lead sur la période"}
          sparkline={d.daily.map((p) => p.leads)}
          tone="accent"
          {...tile(d.totals.leads, d.previous.leads)}
        />
      </div>

      <div className="an-grid">
        <Card wide title="Dépense et leads, jour par jour" sub="La dépense en barres (échelle de gauche), les leads en ligne (échelle de droite). Le dernier jour est partiel : il se complète à la synchro suivante.">
          <DailyChart data={d.daily} />
        </Card>
        <Card
          wide
          title="Campagnes"
          sub="Chiffres de la période. Le coût par lead est celui de la régie ; le coût par lead QUALIFIÉ et par affaire gagnée arrivent en phase 1, quand les leads Meta rejoindront les fiches."
        >
          <DataTable
            columns={COLUMNS}
            rows={d.campaigns}
            sort={{ key: "spend", dir: "desc" }}
            csv={`publicite-campagnes-${platform ?? "toutes"}-${d.period.days}j`}
            searchKeys={["name", "account"]}
            emptyText="Aucune campagne : elles apparaissent à la première synchro d'un compte."
          />
        </Card>
      </div>
    </>
  );
}

export default async function AdsDashboardView(view: AdminViewServerProps) {
  const { initPageResult, params, searchParams } = view;
  const { req } = initPageResult;
  const { payload, user } = req;
  const sp = (await searchParams) ?? {};
  const days = periodDays(sp.j);
  const platform = typeof sp.regie === "string" && sp.regie ? sp.regie : null;

  let body: React.ReactNode = <p className="an-empty">Cet écran est réservé aux administrateurs.</p>;
  if (hasAdminRole(user)) {
    const now = new Date();
    // Deux périodes : l'actuelle, et la précédente pour les écarts.
    const from = new Date(now.getTime() - (2 * days + 1) * 86_400_000).toISOString().slice(0, 10);
    const [accounts, campaigns, metrics, toValidate] = await Promise.all([
      payload.find({ collection: "ad-accounts", pagination: false, depth: 0, overrideAccess: true }),
      payload.find({ collection: "ad-campaigns", pagination: false, depth: 0, overrideAccess: true }),
      payload.find({
        collection: "ad-metrics-daily",
        where: { and: [{ level: { equals: "campaign" } }, { day: { greater_than_equal: from } }] },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { account: true, platform: true, externalId: true, day: true, spend: true, impressions: true, clicks: true, leads: true } as never,
      }),
      payload.count({ collection: "ad-creatives", where: { status: { equals: "a-valider" } }, overrideAccess: true }),
    ]);
    const d = buildAdsDashboard({
      accounts: accounts.docs as DashAccount[],
      campaigns: campaigns.docs as DashCampaign[],
      metrics: metrics.docs as unknown as DashMetric[],
      now,
      days,
      platform,
    });
    body = (
      <>
        <Filters d={d} platform={platform} />
        <Report d={d} platform={platform} toValidate={toValidate.totalDocs} />
      </>
    );
  }

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
        <div className="an ads-dash">
          <header className="an-head">
            <h1 className="an-title">Publicité</h1>
            <p className="ads-dash__sub">{platform ? platformLabel(platform) : "Toutes les régies"} — en lecture : rien ne se modifie d&apos;ici chez la régie.</p>
          </header>
          {body}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
