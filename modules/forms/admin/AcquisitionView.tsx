import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import Link from "next/link";

import { hasAdminRole } from "@/core/access";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import AcqBars from "@/modules/forms/admin/AcqBars";
import AcqSegments, { type Segment } from "@/modules/forms/admin/AcqSegments";
import { InfoTip } from "@/modules/forms/admin/InfoTip";
import { buildStats, type ClientRow, type Row, type SubmissionRow } from "@/modules/forms/lib/stats";

/**
 * Écran « Acquisition » (/admin/acquisition) — d'où viennent les leads du site
 * vitrine, et lesquels aboutissent.
 *
 * Le comptage se fait ici, en base : c'est la source de vérité. GA4 ne voit que
 * les navigateurs qui le laissent parler.
 *
 * Server component : lecture directe par la Local API, aucun fetch client.
 */

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

const PERIODS = [
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
  { label: "12 mois", days: 365 },
  { label: "Tout", days: 0 },
];

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

function Tile({ label, value, sub, info }: { label: string; value: string; sub?: string; info: string[] }) {
  return (
    <div className="acq-tile">
      <span className="acq-tile__label">
        {label}
        <InfoTip content={info} />
      </span>
      <span className="acq-tile__value">{value}</span>
      {sub && <span className="acq-tile__sub">{sub}</span>}
    </div>
  );
}

export default async function AcquisitionView({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req } = initPageResult;
  const { payload, user } = req;

  const body = !hasAdminRole(user) ? (
    <p className="acq-empty">Cet écran est réservé aux administrateurs.</p>
  ) : (
    await content()
  );

  async function content() {
    const raw = (await searchParams)?.j;
    const asked = Number(Array.isArray(raw) ? raw[0] : raw);
    const days = PERIODS.some((p) => p.days === asked) ? asked : 30;
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

    const subs = await payload.find({
      collection: "form-submissions",
      where: since ? { createdAt: { greater_than: since } } : {},
      limit: 5000,
      depth: 0,
      overrideAccess: true,
      select: {
        channel: true,
        channelSource: true,
        placement: true,
        sourcePagePath: true,
        utmCampaign: true,
        lpVariant: true,
      } as never,
    });

    // Les opportunités NÉES d'un formulaire : c'est leur devenir qui dit si un
    // canal rapporte, et pas seulement s'il fait du volume.
    const clients = await payload.find({
      collection: "partner-clients",
      where: { formSubmission: { exists: true } },
      limit: 5000,
      depth: 0,
      draft: true,
      overrideAccess: true,
      select: { clientStatus: true, lossReason: true } as never,
    });

    const stats = buildStats(
      subs.docs as SubmissionRow[],
      clients.docs as ClientRow[],
    );

    const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

    return (
      <>
        <header className="acq-head">
          <div>
            <h1 className="acq-title">Acquisition</h1>
            <p className="acq-sub">
              D&apos;où viennent les leads du site vitrine, et ce qu&apos;ils deviennent.
            </p>
          </div>
          <nav className="acq-periods">
            {PERIODS.map((p) => (
              <Link
                key={p.days}
                href={`/admin/acquisition?j=${p.days}`}
                className={`acq-period${p.days === days ? " acq-period--on" : ""}`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </header>

        {stats.total === 0 ? (
          <p className="acq-empty">
            Aucune soumission sur cette période. L&apos;écran se remplira dès que le site vitrine
            enverra ses premiers formulaires.
          </p>
        ) : (
          <>
            <div className="acq-tiles">
              <Tile
                label="Soumissions"
                value={String(stats.total)}
                info={[
                  "Soumissions",
                  "Nombre de formulaires envoyés depuis le site vitrine sur la période, comptés en base au moment de leur réception.",
                  "C'est la source de vérité : un bloqueur de publicité ou un refus de cookies fait taire GA4, pas une ligne en base.",
                ]}
              />
              <Tile
                label="Opportunités gagnées"
                value={String(stats.gagnees)}
                sub={`${stats.perdues} perdue${stats.perdues > 1 ? "s" : ""}`}
                info={[
                  "Opportunités gagnées",
                  "Parmi les opportunités NÉES d'un formulaire, celles passées au statut « Gagnée ».",
                  "Indépendant de la période choisie : une affaire se gagne souvent des mois après la demande.",
                ]}
              />
              <Tile
                label="Attribution SEA fiable"
                value={pct(stats.fiabiliteSea)}
                sub="part attribuée par un clic constaté"
                info={[
                  "Attribution SEA fiable",
                  "Part des leads « Google Ads » reconnus grâce à un identifiant de clic réellement présent (gclid, msclkid ou utm_medium payant).",
                  "Le reste est déduit du fait que la page était une landing page de campagne — une présomption, pas un fait.",
                  "Si ce taux baisse : le taggage automatique de Google Ads ne remonte plus, ou le cookie d'attribution ne tient pas.",
                  "« — » signifie qu'aucun lead payant n'a été reçu : il n'y a rien à mesurer.",
                ]}
              />
            </div>

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
        <div className="acq">{body}</div>
      </Gutter>
    </DefaultTemplate>
  );
}
