import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import Link from "next/link";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { BillingCheckDetail, VerdictBadge } from "@/modules/partner/admin/BillingCheckTable";
import { ValidateMonth } from "@/modules/partner/admin/ValidateMonth";
import type { BillingReport, ClientCheck, Verdict } from "@/modules/partner/lib/billing-check";
import { plStatusLabel } from "@/modules/partner/lib/billing-check";
import { loadBillingReport } from "@/modules/partner/lib/billing-report";
import { monthValidation, type MonthValidation } from "@/modules/partner/lib/billing-validation";
import type { HistoryEntry } from "@/modules/partner/lib/history";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { eur } from "@/modules/partner/lib/format";
import { isPennylaneConfigured, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Écran « Facturation » (/admin/facturation) — chaque fiche client du support
 * face à son abonnement Pennylane : les licences saisies contre les licences
 * facturées, profil par profil.
 *
 * Rien n'est modifié ici, ni dans le support ni dans Pennylane : on constate,
 * et on va corriger là où c'est faux. Les écarts sont en tête de liste ; les
 * conformes ferment la marche.
 *
 * Une seule écriture : la VALIDATION du mois (case « Conforme »), qui signe
 * que la fiche et l'abonnement disent la même chose pour la prochaine facture
 * — voir lib/billing-validation.ts. C'est elle qui alimente l'historique et
 * la liste de ce qui reste à faire.
 *
 * Server component : la Local API pour les fiches, l'API Pennylane (en cache
 * une heure) pour les abonnements. `?refresh=1` force une relecture.
 */

type Filter = "a-traiter" | "tous" | "ok" | "a-valider" | "valides";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "a-valider", label: "À valider" },
  { key: "valides", label: "Validés" },
  { key: "ok", label: "Conformes" },
  { key: "a-traiter", label: "À traiter" },
];

const keep = (f: Filter, v: Verdict, m: MonthValidation) =>
  f === "tous"
    ? true
    : f === "ok"
      ? v === "ok"
      : f === "a-valider"
        ? m.state === "a-valider" || m.state === "a-revalider"
        : f === "valides"
          ? m.state === "valide"
          : v !== "ok";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return `il y a ${h} h`;
};

/** Icônes propres à cet écran (même trait que celles du tableau de bord). */
const svg = (children: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const TileIcons = {
  /** Une facture barrée : ce qui devrait être facturé et ne l'est pas. */
  noInvoice: svg(
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="m9.5 12.5 5 5M14.5 12.5l-5 5" />
    </>,
  ),
  /** Un paiement en retard : l'horloge, et le point d'alerte. */
  late: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  /** Un client sans fiche : la silhouette, et le signe « moins ». */
  noSheet: svg(
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11h-6" />
    </>,
  ),
};

type Tone = "neutral" | "ok" | "warn" | "bad";

/**
 * Tuile de synthèse : l'icône sur un fond de sa couleur, le chiffre en grand.
 * Le ton dit l'état — vert conforme, ambre écart, rouge ce qu'on a manqué.
 * Une tuile à zéro reste neutre : rien à signaler, rien à colorer.
 */
function Tile({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: number; tone?: Tone }) {
  const t: Tone = tone !== "neutral" && value === 0 ? "neutral" : tone;
  return (
    <div className={`bil-tile bil-tile--${t}`}>
      <span className="bil-tile__icon" aria-hidden>
        {icon}
      </span>
      <span className="bil-tile__text">
        <span className="bil-tile__value">{value}</span>
        <span className="bil-tile__label">{label}</span>
      </span>
    </div>
  );
}

function Row({ check, month }: { check: ClientCheck; month: MonthValidation }) {
  const st = clientStatusMeta(check.client.clientStatus);
  const pl = check.pennylane;
  const errors = check.issues.filter((i) => i.severity === "error").length;
  const warns = check.issues.length - errors;
  return (
    <details className={`bil-item bil-item--${check.verdict}`}>
      <summary className="bil-item__head">
        <VerdictBadge verdict={check.verdict} />
        <span className="bil-item__name">
          <Link href={`/admin/collections/partner-clients/${check.client.id}`} prefetch={false}>
            {check.client.name}
          </Link>
          {st && check.client.clientStatus !== "actif" && (
            <span className="bil-status" style={{ color: st.color, background: st.bg }}>
              {st.label}
            </span>
          )}
        </span>
        <span className="bil-item__pl">
          {pl?.subscriptionId ? plStatusLabel(pl.status) : pl ? "aucun abonnement" : "absent de Pennylane"}
        </span>
        <span className="bil-item__amounts">
          <span title="Total HT / mois d'après la fiche">{eur.format(check.totals.supportHT)}</span>
          <span className="bil-muted"> → </span>
          <span
            title="Total HT / mois facturé par Pennylane"
            className={check.totals.supportHT !== check.totals.plHT ? "bil-price--flag" : ""}
          >
            {pl?.subscriptionId ? eur.format(check.totals.plHT) : "—"}
          </span>
        </span>
        {/* Le mois visé et sa case : signer, c'est ici. Réservé aux fiches
            gagnées — les autres ne sont pas facturées. */}
        {check.client.clientStatus === "actif" && <ValidateMonth clientId={check.client.id} initial={month} />}
        <span className="bil-item__count">
          {check.latePayments.length > 0 && (
            <span className="bil-pay bil-pay--retard">
              {check.latePayments.length} impayé{check.latePayments.length > 1 ? "s" : ""}
            </span>
          )}
          {errors > 0 && <span className="bil-count bil-count--error">{errors}</span>}
          {warns > 0 && <span className="bil-count bil-count--warn">{warns}</span>}
        </span>
      </summary>
      <BillingCheckDetail check={check} editable />
    </details>
  );
}

function Report({ report, filter, months }: { report: BillingReport; filter: Filter; months: Map<string, MonthValidation> }) {
  const { summary } = report;
  const mv = (c: ClientCheck) => months.get(String(c.client.id))!;
  const shown = report.checks.filter((c) => keep(filter, c.verdict, mv(c)));
  const aTraiter = summary.total - summary.ok;
  const aValider = report.checks.filter((c) => ["a-valider", "a-revalider"].includes(mv(c).state)).length;
  const valides = report.checks.filter((c) => mv(c).state === "valide").length;

  return (
    <>
      <div className="bil-tiles">
        <Tile icon={Icons.users()} label="Clients contrôlés" value={summary.total} />
        <Tile icon={Icons.check()} label="À valider" value={aValider} tone="warn" />
        <Tile icon={Icons.checkCircle()} label="Validés" value={valides} tone="ok" />
        <Tile icon={Icons.checkCircle()} label="Conformes" value={summary.ok} tone="ok" />
        <Tile icon={Icons.alert()} label="Écarts" value={summary.ecart} tone="warn" />
        <Tile icon={TileIcons.noInvoice} label="Sans abonnement" value={summary.sansAbonnement + summary.nonRapproche} tone="bad" />
        <Tile icon={TileIcons.late} label="Paiements en retard" value={summary.latePayments} tone="bad" />
        {summary.orphans > 0 && <Tile icon={TileIcons.noSheet} label="Facturés sans fiche" value={summary.orphans} tone="bad" />}
      </div>

      <nav className="bil-filters" aria-label="Filtre">
        {FILTERS.map((f) => {
          const n =
            f.key === "tous"
              ? summary.total
              : f.key === "ok"
                ? summary.ok
                : f.key === "a-valider"
                  ? aValider
                  : f.key === "valides"
                    ? valides
                    : aTraiter;
          return (
            <Link
              key={f.key}
              href={`/admin/facturation?f=${f.key}`}
              prefetch={false}
              className={`bil-filter${f.key === filter ? " bil-filter--on" : ""}`}
            >
              {f.label} <span className="bil-filter__n">{n}</span>
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <p className="bil-empty">
          {filter === "a-traiter"
            ? "Rien à traiter : toutes les fiches sont conformes à Pennylane."
            : filter === "a-valider"
              ? "Rien à valider : toutes les factures à venir sont signées."
              : "Aucune fiche dans ce filtre."}
        </p>
      ) : (
        <div className="bil-list">
          {shown.map((c) => (
            <Row key={c.client.id} check={c} month={mv(c)} />
          ))}
        </div>
      )}

      {report.orphans.length > 0 && (
        <section className="bil-orphans">
          <h2 className="bil-h2">Facturés par Pennylane sans fiche « Gagnée »</h2>
          <p className="bil-sub">
            Ces abonnements tournent dans Pennylane, mais aucune fiche client du support ne leur correspond
            — ni par SIREN, ni par nom. Soit la fiche manque, soit l&apos;abonnement devrait être arrêté.
          </p>
          <ul className="bil-orphan-list">
            {report.orphans.map((o) => (
              <li key={o.subscriptionId} className="bil-orphan">
                <span className="bil-orphan__name">{o.customerName}</span>
                {o.regNo && <span className="bil-muted">{o.regNo}</span>}
                <span className="bil-muted">{plStatusLabel(o.status)}</span>
                <span className="bil-orphan__amount">{eur.format(o.amountHT)} HT / mois</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default async function BillingCheckView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const { payload, user } = req;

  const sp = await searchParams;
  const asked = first(sp?.f) as Filter | undefined;
  const filter: Filter = FILTERS.some((f) => f.key === asked) ? (asked as Filter) : "tous";
  const refresh = first(sp?.refresh) === "1";

  const isAdmin = hasAdminRole(user);
  const configured = isPennylaneConfigured();

  // La lecture peut échouer (token expiré, Pennylane injoignable) : on garde le
  // message, et c'est le rendu, hors try/catch, qui choisit quoi afficher.
  let report: BillingReport | null = null;
  let failure: string | null = null;
  if (isAdmin && configured) {
    try {
      report = await loadBillingReport(payload, { refresh });
    } catch (err) {
      failure = pennylaneErrorMessage(err);
    }
  }
  const fetchedAt = report?.fetchedAt ?? null;

  /**
   * L'état du mois de chaque fiche : l'historique (où vit la signature) face
   * au rapprochement. Une lecture, `depth: 0`, le seul champ utile.
   */
  const months = new Map<string, MonthValidation>();
  if (report) {
    const docs = await payload
      .find({
        collection: "partner-clients",
        where: { id: { in: report.checks.map((c) => c.client.id) } },
        limit: 5000,
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { history: true } as never,
      })
      .then((r) => r.docs as { id: number | string; history?: HistoryEntry[] | null }[])
      .catch(() => [] as { id: number | string; history?: HistoryEntry[] | null }[]);
    const histories = new Map(docs.map((d) => [String(d.id), d.history ?? []]));
    const now = new Date();
    for (const c of report.checks) {
      months.set(String(c.client.id), monthValidation(histories.get(String(c.client.id)) ?? [], c, now));
    }
  }

  const body = !isAdmin ? (
    <p className="bil-empty">Cet écran est réservé aux administrateurs.</p>
  ) : !configured ? (
    <p className="bil-error">
      Connexion Pennylane non configurée : ajoutez <code>PENNYLANE_API_TOKEN</code> aux variables
      d&apos;environnement (token d&apos;entreprise en lecture seule).
    </p>
  ) : failure || !report ? (
    <p className="bil-error">{failure ?? "Lecture Pennylane impossible."}</p>
  ) : (
    <Report report={report} filter={filter} months={months} />
  );

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
        <div className="bil">
          <header className="bil-head">
            <h1 className="bil-title">Rapprochement</h1>
            {fetchedAt && (
              <div className="bil-refresh">
                <span className="bil-muted">Lu chez Pennylane {ago(fetchedAt)}</span>
                <Link href={`/admin/facturation?f=${filter}&refresh=1`} prefetch={false} className="bil-refresh__btn">
                  Actualiser
                </Link>
              </div>
            )}
          </header>
          {body}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
