import type { AdminViewServerProps } from "payload";


import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { MonthlyChart } from "@/modules/analytics/admin/charts";
import { DataTable, type Column } from "@/modules/analytics/admin/DataTable";
import { Card as AnCard, PeriodFilter, periodFrom, Tile } from "@/modules/analytics/admin/ui";
import { buildAcquisitionAnalytics, channelSpend, monthlyCosts, trackedMonths, type LeadClientRow, type LeadRow } from "@/modules/analytics/lib/acquisition";
import { channelLabel } from "@/core/lib/channels";
import { loadExpenses } from "@/modules/analytics/lib/expenses-load";
import { eur } from "@/modules/partner/lib/format";
import AcqBars from "@/modules/forms/admin/AcqBars";
import AcqSegments, { type Segment } from "@/modules/forms/admin/AcqSegments";
import { InfoTip } from "@/modules/forms/admin/InfoTip";
import { buildStats, type ClientRow, type Row, type SubmissionRow } from "@/modules/forms/lib/stats";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";

/**
 * Écran « Analyses → Acquisition » (/admin/analyses/acquisition) — d'où
 * viennent les leads du site vitrine, lesquels aboutissent, et ce que chaque
 * canal rapporte vraiment (la conversion, pas seulement le volume).
 *
 * Le comptage se fait ici, en base : c'est la source de vérité. GA4 ne voit que
 * les navigateurs qui le laissent parler.
 *
 * Server component : lecture directe par la Local API, aucun fetch client.
 */

const CHANNEL_COLUMNS: Column[] = [
  { key: "label", label: "Canal" },
  { key: "leads", label: "Leads", format: "int" },
  { key: "opportunities", label: "Opportunités", format: "int" },
  { key: "won", label: "Gagnées", format: "int" },
  { key: "lost", label: "Perdues", format: "int" },
  { key: "conversion", label: "Conversion lead → gagnée", format: "pct" },
  { key: "spend", label: "Dépense", format: "eur" },
  { key: "costPerLead", label: "Coût par lead", format: "eur" },
  { key: "costPerWon", label: "Coût par affaire gagnée", format: "eur" },
];

/** Mois par mois, au total : chaque grandeur suivie de son évolution sur le mois d'avant. */
const MONTH_COLUMNS: Column[] = [
  { key: "label", label: "Mois" },
  { key: "spend", label: "Dépense", format: "eur" },
  { key: "spendPct", label: "Évol. dépense", format: "delta", goodWhenUp: false },
  { key: "leads", label: "Leads", format: "int" },
  { key: "leadsPct", label: "Évol. leads", format: "delta" },
  { key: "costPerLead", label: "Coût par lead", format: "eur" },
  { key: "cplPct", label: "Évol. coût / lead", format: "delta", goodWhenUp: false },
  { key: "opportunities", label: "Opportunités", format: "int" },
  { key: "won", label: "Clients gagnés", format: "int" },
  { key: "costPerWon", label: "Coût par client gagné", format: "eur" },
];

/** Mois par mois et canal par canal. */
const MONTH_CHANNEL_COLUMNS: Column[] = [
  { key: "label", label: "Mois" },
  { key: "channel", label: "Canal" },
  { key: "spend", label: "Dépense", format: "eur" },
  { key: "leads", label: "Leads", format: "int" },
  { key: "costPerLead", label: "Coût par lead", format: "eur" },
  { key: "opportunities", label: "Opportunités", format: "int" },
  { key: "won", label: "Clients gagnés", format: "int" },
  { key: "costPerWon", label: "Coût par client gagné", format: "eur" },
];

const pctVs = (cur: number | null, prev: number | null | undefined) => (cur != null && prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const monthLong = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Couleurs des segments — jetons uniquement, jamais de valeur en dur. */
const CANAL_COLORS: Record<string, string> = {
  seo: "var(--tim-teal)",
  sea: "var(--tim-indigo)",
};

/** Un fait est vert, une présomption est ambre, un défaut est neutre. */
const PREUVE_COLORS: Record<string, string> = {
  "clic-payant": "var(--tim-green)",
  "landing-page": "var(--tim-amber)",
  defaut: "var(--tim-slate)",
};

const FALLBACK = "var(--tim-gray)";

const toSegments = (rows: Row[], colors: Record<string, string>): Segment[] =>
  rows.map((r) => ({ label: r.label, value: r.value, color: colors[r.key ?? ""] ?? FALLBACK }));

/** Les statuts portent déjà leur couleur : on reprend celle du Kanban. */
const statutSegments = (rows: Row[]): Segment[] =>
  rows.map((r) => ({
    label: r.label,
    value: r.value,
    color: clientStatusMeta(r.key)?.color ?? FALLBACK,
  }));

function Card({ title, info, children }: { title: string; info: string[]; children: React.ReactNode }) {
  return (
    <section className="acq-card">
      <h2 className="acq-card__title">
        {title}
        <InfoTip content={info} />
      </h2>
      {children}
    </section>
  );
}

export default async function AcquisitionView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;

  // La période se lit AVANT `content()` : la fonction la référence.
  const months = periodFrom(await view.searchParams, 3);
  const body = hasAdminRole(user) ? await content() : null;

  async function content() {
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1)).toISOString();

    // Toutes les soumissions (la tendance mensuelle et la variation ont besoin
    // de la période précédente) ; les répartitions se limitent à la période.
    // Les quatre lectures sont indépendantes : elles partent ensemble.
    const [all, clients, { expenses, note: expenseNote }, metaRows] = await Promise.all([
      payload.find({
      collection: "form-submissions",
      limit: 10000,
      depth: 0,
      overrideAccess: true,
      select: {
        channel: true,
        channelSource: true,
        placement: true,
        sourcePagePath: true,
        utmCampaign: true,
        lpVariant: true,
        createdAt: true,
      } as never,
      }),
      // Les opportunités NÉES d'un formulaire : c'est leur devenir qui dit si un
      // canal rapporte, et pas seulement s'il fait du volume.
      payload.find({
        collection: "partner-clients",
        where: { formSubmission: { exists: true } },
        limit: 5000,
        depth: 0,
        draft: true,
        overrideAccess: true,
        select: { clientStatus: true, lossReason: true, formSubmission: true } as never,
      }),
      // Ce que coûte chaque canal : les dépenses (relevés Pennylane, par poste),
      // et pour Meta la dépense relevée par son API sur la période (la banque ne la voit pas, ou en retard).
      loadExpenses(),
      payload.find({
        collection: "ad-metrics-daily",
        where: { and: [{ platform: { equals: "meta" } }, { level: { equals: "campaign" } }, { day: { greater_than_equal: since.slice(0, 10) } }] },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { day: true, spend: true } as never,
      }),
    ]);
    const subs = { docs: all.docs.filter((d) => (d as { createdAt?: string }).createdAt! >= since) };

    const stats = buildStats(
      subs.docs as SubmissionRow[],
      clients.docs as ClientRow[],
    );

    const metaSpendByMonth: Record<string, number> = {};
    for (const r of metaRows.docs as { day: string; spend?: number | null }[]) metaSpendByMonth[r.day.slice(0, 7)] = (metaSpendByMonth[r.day.slice(0, 7)] ?? 0) + (r.spend ?? 0);
    const leadsByChannel: Record<string, number> = {};
    for (const d of subs.docs as LeadRow[]) leadsByChannel[d.channel ?? ""] = (leadsByChannel[d.channel ?? ""] ?? 0) + 1;
    // Le premier lead enregistré : la dépense ne s'impute qu'à partir de ce mois-là.
    const trackedFrom = (all.docs as LeadRow[]).reduce<string | null>((min, d) => (d.createdAt && (!min || d.createdAt.slice(0, 7) < min) ? d.createdAt.slice(0, 7) : min), null);
    const spendByChannel =
      expenses.length || Object.keys(metaSpendByMonth).length ? channelSpend(expenses, metaSpendByMonth, leadsByChannel, months, now, trackedFrom) : undefined;
    const periodStart = since.slice(0, 7);
    const spendNote =
      spendByChannel && trackedFrom && trackedFrom > periodStart
        ? `Leads suivis depuis ${new Date(`${trackedFrom}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })} : la dépense n'est comptée qu'à partir de ce mois, pour que le coût par lead reste juste.`
        : null;

    const acq = buildAcquisitionAnalytics(all.docs as LeadRow[], clients.docs as LeadClientRow[], months, now, spendByChannel);

    // Mois par mois (les mois suivis de la période) : au total et par canal.
    // Tous les mois de la période : avant le suivi des leads, la dépense seule (leads « — »).
    // Avant le premier relevé (janvier 2026), la dépense est inconnue : ces mois ne s'affichent pas.
    const spentFrom = [...expenses.map((e) => e.month), ...Object.keys(metaSpendByMonth)].sort()[0] ?? null;
    const monthly = spendByChannel
      ? monthlyCosts(all.docs as LeadRow[], clients.docs as LeadClientRow[], expenses, metaSpendByMonth, trackedMonths(months, now, spentFrom), trackedFrom)
      : [];
    const monthRows = monthly.map((m, i) => {
      const prev = monthly[i - 1];
      return {
        id: m.month,
        label: monthLong(m.month),
        spend: m.spend,
        spendPct: pctVs(m.spend, prev?.spend),
        leads: m.leads,
        leadsPct: pctVs(m.leads, prev?.leads),
        costPerLead: m.costPerLead,
        cplPct: pctVs(m.costPerLead, prev?.costPerLead),
        opportunities: m.opportunities,
        won: m.won,
        costPerWon: m.costPerWon,
      };
    });
    const monthChannelRows = monthly.flatMap((m) =>
      Object.entries(m.byChannel)
        .filter(([, f]) => f.spend > 0 || (f.leads ?? 0) > 0)
        .map(([ch, f]) => ({ id: `${m.month}-${ch}`, month: m.month, label: monthLong(m.month), channel: channelLabel(ch) ?? (ch || "Canal inconnu"), ...f })),
    );
    // Les graphiques reprennent l'ordre des canaux du graphique des leads : mêmes couleurs.
    const chartRows = monthly.map((m) => ({
      month: `${m.month}-01T00:00:00.000Z`,
      ...Object.fromEntries(acq.channelKeys.map((c) => [`spend:${c.key}`, m.byChannel[c.key]?.spend ?? 0])),
      ...Object.fromEntries(acq.channelKeys.map((c) => [`cpl:${c.key}`, m.byChannel[c.key]?.costPerLead ?? null])),
    }));
    const money = (n: number | null) => (n == null ? "—" : eur.format(n));

    const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

    return (
      <>
        <PeriodFilter page="acquisition" months={months} />

        <div className="an-tiles">
          <Tile icon={Icons.inbox()} label="Leads reçus" value={String(acq.kpis.leads.current)} delta={acq.kpis.leads} sub="formulaires du site vitrine" />
          <Tile icon={Icons.checkCircle()} label="Affaires gagnées" value={String(acq.kpis.won)} sub={acq.kpis.conversion != null ? `${acq.kpis.conversion} % des leads de la période` : undefined} tone="ok" />
          <Tile
            icon={Icons.alert()}
            label="Attribution SEA fiable"
            value={pct(stats.fiabiliteSea)}
            sub={stats.fiabiliteSea == null ? "aucun lead payant reçu" : "part attribuée par un clic constaté (gclid…)"}
            tone={stats.fiabiliteSea != null && stats.fiabiliteSea < 0.8 ? "warn" : undefined}
          />
          {acq.kpis.spend != null && (
            <>
              <Tile icon={Icons.euro()} label="Dépense d'acquisition" value={money(acq.kpis.spend)} sub="pub + SEO" />
              <Tile icon={Icons.coins()} label="Coût par lead" value={money(acq.kpis.costPerLead)} sub="dépense ÷ leads reçus" />
              <Tile
                icon={Icons.target()}
                label="Coût par affaire gagnée"
                value={money(acq.kpis.costPerWon)}
                sub={acq.kpis.won ? "dépense ÷ affaires gagnées" : "aucune encore"}
              />
            </>
          )}
        </div>
        {expenseNote && <p className="an-note">{expenseNote}</p>}
        {spendNote && <p className="an-card__sub">{spendNote}</p>}

        <div className="an-grid">
          <AnCard wide title="Leads par mois et par canal" sub="Une couleur par canal, fixe : le SEO reste le même bleu quel que soit le filtre.">
            <MonthlyChart data={acq.monthly} series={acq.channelKeys.map((c) => ({ key: c.key, label: c.label }))} stacked />
          </AnCard>
          {monthly.length > 0 && (
            <AnCard
              wide
              title="Mois par mois : dépense, leads, coûts"
              sub={`Ce qui a été dépensé chaque mois, les leads reçus, et le devenir des fiches nées de ces leads (une cohorte : un client gagné compte pour le mois de son lead, même signé plus tard). Une couleur par canal, la même que sur le graphique des leads.${trackedFrom ? ` Leads suivis depuis ${monthLong(trackedFrom)} : avant, la dépense seule.` : ""}`}
            >
              <div className="an-grid">
                <div>
                  <h3 className="an-fold__h">Dépense par canal</h3>
                  <MonthlyChart data={chartRows} series={acq.channelKeys.map((c) => ({ key: `spend:${c.key}`, label: c.label }))} stacked unit="eur" />
                </div>
                <div>
                  <h3 className="an-fold__h">Coût par lead, par canal</h3>
                  <MonthlyChart data={chartRows} series={acq.channelKeys.map((c) => ({ key: `cpl:${c.key}`, label: c.label, kind: "line" as const }))} unit="eur" />
                </div>
              </div>
              <DataTable columns={MONTH_COLUMNS} rows={monthRows} sort={{ key: "id", dir: "desc" }} csv="acquisition-mois-par-mois" />
              <DataTable columns={MONTH_CHANNEL_COLUMNS} rows={monthChannelRows} sort={{ key: "id", dir: "desc" }} csv="acquisition-mois-par-canal" searchKeys={["channel"]} />
            </AnCard>
          )}
          <AnCard
            wide
            title="Ce que chaque canal rapporte, et ce qu'il coûte"
            sub="Leads de la période, fiches nées de ces leads, et leur devenir ; la conversion compte les affaires gagnées sur les leads reçus. La dépense est celle du poste du canal sur la période (relevés Pennylane, ramenés en HT) — Meta : la dépense relevée par son API, partagée entre Facebook et Instagram selon leurs leads. Le SEO ne compte que Linkuma (l'agence est dans « Autres »)."
          >
            <DataTable columns={CHANNEL_COLUMNS} rows={acq.channels} sort={{ key: "leads", dir: "desc" }} csv="acquisition-par-canal" />
          </AnCard>
        </div>

        {stats.total === 0 ? (
          <p className="acq-empty">
            Aucune soumission sur cette période. L&apos;écran se remplira dès que le site vitrine
            enverra ses premiers formulaires.
          </p>
        ) : (
          <>
            <div className="acq-grid">
              <Card
                title="Par canal"
                info={[
                  "Par canal",
                  "Répartition des soumissions entre référencement naturel et campagnes payantes.",
                  "Un lead est « Google Ads » dès que sa visite porte une trace de clic payant, quelle que soit la page où il a rempli le formulaire — ou qu'il vient d'une landing page de campagne.",
                ]}
              >
                <AcqSegments segments={toSegments(stats.parCanal, CANAL_COLORS)} />
              </Card>

              <Card
                title="Sur quelle preuve"
                info={[
                  "Sur quelle preuve",
                  "Comment le canal a été décidé pour chaque soumission.",
                  "« Clic payant » : un identifiant de clic était présent — c'est un fait.",
                  "« Landing page » : déduit de la page, qui n'est atteignable que par une campagne — c'est une présomption.",
                  "« Canal par défaut » : aucun signal, on retient le canal déclaré du formulaire.",
                ]}
              >
                <AcqSegments segments={toSegments(stats.parPreuve, PREUVE_COLORS)} />
              </Card>

              <Card
                title="Par page"
                info={[
                  "Par page",
                  "Chemin de la page qui portait le formulaire au moment de l'envoi.",
                  "Le tiroir de demande de démo étant présent sur tout le site, cette répartition dit quelles pages amènent réellement à demander une démo.",
                  "Au-delà de huit pages, les suivantes sont regroupées pour ne pas masquer celles qui comptent.",
                ]}
              >
                <AcqBars rows={stats.parPage} />
              </Card>

              <Card
                title="Page d'arrivée"
                info={[
                  "Page d'arrivée",
                  "Première page vue de la visite, qui n'est pas toujours celle du formulaire.",
                  "C'est elle qui distingue « arrivé directement sur la landing page » d'une navigation ordinaire — la seule explication disponible pour un lead sans campagne.",
                  "« Entrée inconnue » : soumission reçue avant que la vitrine ne transmette cette information.",
                ]}
              >
                <AcqBars rows={stats.parEntree} tone="blue" />
              </Card>

              <Card
                title="Par campagne"
                info={[
                  "Par campagne",
                  "Valeur d'utm_campaign transmise par Google Ads, via le suffixe d'URL finale du compte.",
                  "« Sans campagne » regroupe les visites sans paramètre : trafic naturel, accès direct, ou lien partagé.",
                ]}
              >
                <AcqBars rows={stats.parCampagne} />
              </Card>

              <Card
                title="Par emplacement"
                info={[
                  "Par emplacement",
                  "Où se trouvait le formulaire : tiroir global, page contact, hero ou section de landing page.",
                  "Le même formulaire sert tous ces emplacements — c'est cette dimension qui les distingue.",
                ]}
              >
                <AcqBars rows={stats.parEmplacement} tone="teal" />
              </Card>

              <Card
                title="Variante de landing page"
                info={[
                  "Variante de landing page",
                  "Version de la landing page affichée au moment de l'envoi (v1 ou v2).",
                  "Ce sont des leads reçus, pas un taux de conversion : le nombre de visiteurs de chaque variante n'est pas connu du support.",
                  "« Hors landing page » regroupe les soumissions venues du reste du site.",
                ]}
              >
                <AcqBars rows={stats.parVariante} tone="indigo" />
              </Card>

              <Card
                title="Devenir des opportunités"
                info={[
                  "Devenir des opportunités",
                  "Statut actuel des opportunités nées d'un formulaire, tous canaux confondus.",
                  "Ne dépend pas de la période choisie : une opportunité vit bien après la soumission qui l'a créée.",
                ]}
              >
                <AcqSegments segments={statutSegments(stats.parStatut)} />
              </Card>

              <Card
                title="Motifs de perte"
                info={[
                  "Motifs de perte",
                  "Motif saisi à la clôture des opportunités issues d'un formulaire et passées en « Perdue ».",
                  "Ne compte pas les affaires perdues reprises du CRM Brevo : elles n'ont pas de soumission d'origine.",
                ]}
              >
                <AcqBars rows={stats.parMotif} tone="rose" />
              </Card>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <AnalyticsPage view={view} page="acquisition" title="Acquisition">
      <div className="acq">{body}</div>
    </AnalyticsPage>
  );
}
