import type { AdminViewServerProps } from "payload";


import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { MonthlyChart } from "@/modules/analytics/admin/charts";
import { DataTable, type Column } from "@/modules/analytics/admin/DataTable";
import { Card as AnCard, PeriodFilter, periodFrom, Tile } from "@/modules/analytics/admin/ui";
import { buildAcquisitionAnalytics, type LeadClientRow, type LeadRow } from "@/modules/analytics/lib/acquisition";
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
];

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
    const all = await payload.find({
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
    });
    const subs = { docs: all.docs.filter((d) => (d as { createdAt?: string }).createdAt! >= since) };

    // Les opportunités NÉES d'un formulaire : c'est leur devenir qui dit si un
    // canal rapporte, et pas seulement s'il fait du volume.
    const clients = await payload.find({
      collection: "partner-clients",
      where: { formSubmission: { exists: true } },
      limit: 5000,
      depth: 0,
      draft: true,
      overrideAccess: true,
      select: { clientStatus: true, lossReason: true, formSubmission: true } as never,
    });

    const stats = buildStats(
      subs.docs as SubmissionRow[],
      clients.docs as ClientRow[],
    );
    const acq = buildAcquisitionAnalytics(all.docs as LeadRow[], clients.docs as LeadClientRow[], months, now);

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
        </div>

        <div className="an-grid">
          <AnCard wide title="Leads par mois et par canal" sub="Une couleur par canal, fixe : le SEO reste le même bleu quel que soit le filtre.">
            <MonthlyChart data={acq.monthly} series={acq.channelKeys.map((c) => ({ key: c.key, label: c.label }))} stacked />
          </AnCard>
          <AnCard wide title="Ce que chaque canal rapporte" sub="Leads de la période, fiches nées de ces leads, et leur devenir. La conversion compte les affaires gagnées sur les leads reçus.">
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
