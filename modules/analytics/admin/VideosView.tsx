import type { AdminViewServerProps } from "payload";
import Link from "next/link";

import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { DailyChart } from "@/modules/analytics/admin/charts";
import { BarList, Card, Fold, Kpi } from "@/modules/analytics/admin/ui";
import {
  buildVideoLeads,
  buildVideosAnalytics,
  parisDay,
  videoLabel,
  type Split,
  type VideoLeadClientRow,
  type VideoLeadRow,
  type VideoLeads,
  type VideoReport,
  type VueRow,
} from "@/modules/analytics/lib/video-views";
import { delta } from "@/modules/analytics/lib/growth";
import { VIDEO_POURCENTAGE_LABELS, VIDEO_POURCENTAGES } from "@/modules/forms/lib/video-lead";
import { eur } from "@/modules/partner/lib/format";

/**
 * Écran « Analyses → Vidéos » (/admin/analyses/videos) — les vidéos de
 * démonstration du site vitrine : sont-elles lancées, regardées jusqu'au
 * bout, et mènent-elles à une demande de démo ?
 *
 * Lu de haut en bas : le résumé en une phrase et quatre chiffres ; « Vos
 * vidéos », une ligne par vidéo pour les comparer d'un coup d'œil, avec leur
 * parcours (affichée → lancée → moitié → fin → clic) et l'étape qui perd le
 * plus ; puis le détail de la vidéo choisie ; les lectures par jour ; les
 * explications repliées.
 *
 * Compté en base par Support (route /api/videos/vues), sans cookie ni
 * identifiant : ce sont des lectures, pas des personnes.
 */

const PERIODS = [7, 30, 90] as const;
const HREF = "/admin/analyses/videos";

const one = (sp: Record<string, string | string[] | undefined> | undefined, k: string) => {
  const v = sp?.[k];
  return Array.isArray(v) ? v[0] : v;
};
const daysFrom = (sp: Record<string, string | string[] | undefined> | undefined): number => {
  const raw = Number(one(sp, "j"));
  return (PERIODS as readonly number[]).includes(raw) ? raw : 30;
};

const pct0 = (n: number | null) => (n == null ? "—" : `${n} %`);
const int = (n: number) => n.toLocaleString("fr-FR");
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * La couleur d'une vidéo, la même dans la liste, le détail et la courbe : des
 * teintes d'identité, hors du rouge et du vert qui disent ailleurs « mauvais »
 * et « bon » (indigo, ambre, turquoise, bleu, brun).
 */
const SLOTS = [4, 3, 5, 1, 6];
const slotOf = (i: number) => SLOTS[i % SLOTS.length];
const colorOf = (i: number) => `var(--tim-chart-${slotOf(i) + 1})`;

type Step = { key: string; label: string; n: number; rate: number | null };

/** Le parcours d'une vidéo, étape par étape, chacune en part de la précédente. */
function stepsOf(v: VideoReport): Step[] {
  const half = v.funnel.find((f) => f.key === "50")?.reached ?? 0;
  const raw = [
    ...(v.affichages > 0 ? [{ key: "affichage", label: "Affichée", n: v.affichages }] : []),
    { key: "lecture", label: "Lancée", n: v.lectures.current },
    { key: "50", label: "À moitié", n: half },
    { key: "fin", label: "Jusqu'au bout", n: v.fins },
    { key: "cta", label: "Clic sur le bouton", n: v.cta },
  ];
  return raw.map((s, i) => ({ ...s, rate: i === 0 ? null : share(s.n, raw[i - 1].n) }));
}

/** L'étape qui perd le plus de monde (le plus bas taux de passage), hors clic final. */
const weakest = (steps: Step[]) =>
  steps
    .filter((s) => s.rate != null && s.key !== "cta")
    .reduce<Step | null>((w, s) => (w == null || (s.rate ?? 100) < (w.rate ?? 100) ? s : w), null);

function Journey({ steps }: { steps: Step[] }) {
  const weak = weakest(steps);
  return (
    <ol className="vd-journey" aria-label="Parcours des spectateurs">
      {steps.map((s) => (
        <li key={s.key} className={`vd-journey__step${weak?.key === s.key && (s.rate ?? 100) < 50 ? " vd-journey__step--weak" : ""}`}>
          {s.rate != null && (
            <span className="vd-journey__rate" title="part de l'étape d'avant">
              {s.rate} %
            </span>
          )}
          <span className="vd-journey__n">{int(s.n)}</span>
          <span className="vd-journey__label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

const splitItems = (list: Split[]) =>
  list.map((x) => ({
    key: x.key,
    label: x.label,
    value: x.lectures,
    sub: x.lectures ? `${pct0(x.completion)} vues jusqu'au bout${x.cta ? ` · ${x.cta} clic${x.cta > 1 ? "s" : ""}` : ""}` : undefined,
  }));

function Detail({ v, lead, index, days }: { v: VideoReport; lead: VideoLeads | undefined; index: number; days: number }) {
  const lectures = v.lectures.current;
  // La rétention : quelle part des lectures atteint chaque repère.
  const retention = v.funnel.map((f) => ({ key: f.key, label: f.key === "lecture" ? "Début" : f.key === "fin" ? "Fin" : f.label, value: f.reached, sub: `${f.fromStart} % des lectures` }));
  const weak = weakest(stepsOf(v));
  return (
    <section className="vd-detail" style={{ ["--vd-color" as string]: colorOf(index) }}>
      <header className="vd-detail__head">
        <span className="vd-dot" aria-hidden />
        <h2 className="vd-detail__title">{videoLabel(v.videoId)}</h2>
        <span className="vd-detail__id">{v.videoId}</span>
      </header>
      {weak && (weak.rate ?? 100) < 50 && (
        <p className="an-callout vd-callout">
          {weak.key === "lecture" ? (
            <>
              Seulement <b>{weak.rate} %</b> des visiteurs qui voient la vidéo la lancent ({int(lectures)} sur {int(v.affichages)} affichages) : c&apos;est là qu&apos;elle perd le
              plus. L&apos;image d&apos;aperçu et le titre décident du clic.
            </>
          ) : (
            <>
              L&apos;étape « {weak.label.toLowerCase()} » perd le plus : seulement <b>{weak.rate} %</b> y arrivent depuis l&apos;étape d&apos;avant.
            </>
          )}
        </p>
      )}
      <div className="an-grid">
        <Card title="Où les spectateurs décrochent" sub={`Sur ${int(lectures)} lecture${lectures > 1 ? "s" : ""} lancée${lectures > 1 ? "s" : ""} en ${days} jours : combien atteignent chaque repère.`}>
          <BarList items={retention} tone="blue" unit="int" showShare={false} empty="Aucune lecture sur la période." />
        </Card>
        <Card title="Demandes de démo" sub="Des visiteurs qui ont regardé cette vidéo, puis ce qu'elles sont devenues.">
          {lead ? (
            <>
              <div className="vd-leads">
                <span className="vd-leads__n">{int(lead.demandes)}</span>
                <span className="vd-leads__label">
                  demande{lead.demandes > 1 ? "s" : ""} de démo
                  {lectures ? ` · ${Math.round((lead.demandes / lectures) * 1000) / 10} pour 100 lectures` : ""}
                </span>
              </div>
              <BarList
                tone="green"
                unit="int"
                items={[
                  { key: "fin", label: "Depuis l'écran de fin de la vidéo", value: lead.depuisFin },
                  { key: "pause", label: "Depuis la pause", value: lead.depuisPause },
                  { key: "ailleurs", label: "Ailleurs sur la page", value: lead.demandes - lead.depuisFin - lead.depuisPause },
                  ...VIDEO_POURCENTAGES.filter((p) => lead.parPourcentage[p]).map((p) => ({
                    key: `p${p}`,
                    label: `Vidéo vue : ${VIDEO_POURCENTAGE_LABELS[p].toLowerCase()}`,
                    value: lead.parPourcentage[p],
                    muted: true,
                  })),
                ].filter((i) => i.value > 0)}
              />
              <p className="an-card__foot">
                {lead.clientes
                  ? `${lead.clientes} devenue${lead.clientes > 1 ? "s" : ""} cliente${lead.clientes > 1 ? "s" : ""} · ${eur.format(lead.caPaye)} HT par mois.`
                  : "Aucune n'est encore devenue cliente."}
              </p>
            </>
          ) : (
            <p className="an-empty">Aucune demande de démo après cette vidéo sur la période.</p>
          )}
        </Card>
        <Card title="D'où viennent les lectures" sub="Le canal de la visite où la vidéo a été lancée.">
          <BarList items={splitItems(v.canaux)} tone="blue" unit="int" />
        </Card>
        <Card title="Sur quel appareil" sub="Mobile, tablette ou ordinateur.">
          <BarList items={splitItems(v.appareils)} tone="blue" unit="int" />
        </Card>
        <Card wide title="Sur quelle page" sub="La page produit qui porte la vidéo, ou sa page dédiée /video/….">
          <BarList
            tone="blue"
            unit="int"
            items={v.pages.map((p) => ({
              key: p.page,
              label: `${p.page}${p.kind === "video" ? " (page vidéo)" : ""}`,
              value: p.lectures,
              sub: p.lectures ? `${pct0(share(p.fins, p.lectures))} vues jusqu'au bout` : undefined,
            }))}
          />
        </Card>
      </div>
    </section>
  );
}

export default async function VideosView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const sp = await view.searchParams;
  const days = daysFrom(sp);
  const asked = one(sp, "v");
  const body = hasAdminRole(user) ? await content() : null;

  async function content() {
    const now = new Date();
    // La période et celle d'avant, pour comparer.
    const since = parisDay(new Date(now.getTime() - (2 * days - 1) * 86_400_000));
    const found = await payload.find({
      collection: "video-views",
      where: { jour: { greater_than_equal: since } },
      limit: 20000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { videoId: true, page: true, etape: true, jour: true, appareil: true, canal: true, nombre: true },
    });
    const report = buildVideosAnalytics(found.docs as VueRow[], days, now);

    // Les demandes de démo de la période qui portent une vidéo, et ce qu'elles
    // sont devenues (l'opportunité née de chacune).
    const fromIso = new Date(now.getTime() - days * 86_400_000).toISOString();
    const subs = await payload.find({
      collection: "form-submissions",
      where: { and: [{ videoId: { exists: true } }, { createdAt: { greater_than_equal: fromIso } }] },
      limit: 5000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { videoId: true, videoPourcentage: true, videoCta: true, createdAt: true },
    });
    const subIds = subs.docs.map((d) => d.id);
    const clients = subIds.length
      ? await payload.find({
          collection: "partner-clients",
          where: { formSubmission: { in: subIds } },
          limit: 5000,
          pagination: false,
          depth: 0,
          draft: true,
          overrideAccess: true,
          select: { formSubmission: true, clientStatus: true, caPaye: true },
        })
      : { docs: [] };
    const leads = buildVideoLeads(subs.docs as VideoLeadRow[], clients.docs as VideoLeadClientRow[], fromIso);

    // Les liens gardent la période et la vidéo choisie.
    const link = (q: { j?: number; v?: string }) => {
      const v = q.v ?? asked;
      return `${HREF}?${new URLSearchParams({ j: String(q.j ?? days), ...(v ? { v } : {}) }).toString()}`;
    };
    const periods = (
      <div className="an-toolbar">
        <div className="an-period">
          <div className="an-period__field">
            <span className="an-period__label">Période</span>
            <nav className="an-filters" aria-label="Période">
              {PERIODS.map((p) => (
                <Link key={p} href={link({ j: p })} prefetch={false} scroll={false} className={`an-filter${p === days ? " an-filter--on" : ""}`}>
                  {p} jours
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    );

    if (report.videos.length === 0) {
      return (
        <>
          {periods}
          <p className="an-empty">Aucune lecture sur les {days} derniers jours.</p>
        </>
      );
    }

    /* ── Le total, toutes vidéos confondues ── */
    const videos = report.videos;
    const sum = (f: (v: VideoReport) => number) => videos.reduce((s, v) => s + f(v), 0);
    const affichages = sum((v) => v.affichages);
    const lectures = sum((v) => v.lectures.current);
    const lecturesAvant = sum((v) => v.lectures.previous);
    const fins = sum((v) => v.fins);
    const cta = sum((v) => v.cta);
    const demandes = [...leads.values()].reduce((s, l) => s + l.demandes, 0);
    const lancement = share(lectures, affichages);
    const completion = share(fins, lectures);
    const best = [...videos].sort((a, b) => b.lectures.current - a.lectures.current)[0];
    const selected = videos.find((v) => v.videoId === asked) ?? best;
    const dailyTotal = report.daily.map((d) => videos.reduce((s, v) => s + Number(d[v.videoId] ?? 0), 0));

    return (
      <>
        {periods}

        <section className="an-hero" aria-label="Résumé de la période">
          <p className="an-story">
            Sur les <b>{days} derniers jours</b>, les vidéos ont été affichées <b>{int(affichages)} fois</b> et lancées <b>{int(lectures)} fois</b>
            {lancement != null ? <> ({lancement} %)</> : null}. <b>{pct0(completion)}</b> des lectures vont jusqu&apos;au bout
            {demandes ? (
              <>
                , et elles ont mené à <b>{int(demandes)} demande{demandes > 1 ? "s" : ""} de démo</b>.
              </>
            ) : (
              <>. Aucune demande de démo n&apos;est encore venue d&apos;une vidéo.</>
            )}{" "}
            La plus regardée : <b>{videoLabel(best.videoId)}</b>.
          </p>
          <div className="vd-kpis">
            <Kpi tone="slate" label="Affichées à l'écran" value={int(affichages)} sub="la vidéo est apparue" />
            <Kpi
              tone="blue"
              label="Lancées"
              value={int(lectures)}
              delta={delta(lectures, lecturesAvant)}
              deltaTitle="face à la période d'avant"
              sub={lancement != null ? `${lancement} % des affichages` : undefined}
              spark={dailyTotal}
            />
            <Kpi tone="green" label="Vues jusqu'au bout" value={pct0(completion)} sub={`${int(fins)} lecture${fins > 1 ? "s" : ""} complète${fins > 1 ? "s" : ""}`} />
            <Kpi tone="amber" label="Clics sur le bouton" value={int(cta)} sub={demandes ? `${int(demandes)} demande${demandes > 1 ? "s" : ""} de démo` : "aucune demande de démo"} />
          </div>
        </section>

        <Card
          wide
          title="Vos vidéos"
          sub="Le parcours des spectateurs, étape par étape : chaque pourcentage est la part de l'étape d'avant. En rouge, l'étape qui perd le plus. Cliquez une vidéo pour son détail."
        >
          <ul className="vd-list">
            {videos.map((v, i) => (
              <li key={v.videoId}>
                <Link
                  href={link({ v: v.videoId })}
                  prefetch={false}
                  scroll={false}
                  className={`vd-row${v.videoId === selected.videoId ? " vd-row--on" : ""}`}
                  style={{ ["--vd-color" as string]: colorOf(i) }}
                  aria-current={v.videoId === selected.videoId ? "true" : undefined}
                >
                  <span className="vd-row__name">
                    <span className="vd-dot" aria-hidden />
                    <span className="vd-row__text">
                      <span className="vd-row__title">{videoLabel(v.videoId)}</span>
                      <span className="vd-row__pages">{v.pages.map((p) => p.page).join(" · ")}</span>
                    </span>
                  </span>
                  <Journey steps={stepsOf(v)} />
                  <span className="vd-row__leads">
                    <span className="vd-row__leads-n">{int(leads.get(v.videoId)?.demandes ?? 0)}</span>
                    <span className="vd-row__leads-label">demandes de démo</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Detail v={selected} lead={leads.get(selected.videoId)} index={videos.indexOf(selected)} days={days} />

        <Card wide title="Lectures par jour" sub={`Les ${days} derniers jours, une courbe par vidéo (même couleur que dans « Vos vidéos »).`}>
          <DailyChart data={report.daily} series={videos.map((v, i) => ({ key: v.videoId, label: videoLabel(v.videoId), kind: "line", slot: slotOf(i) }))} />
        </Card>

        <div className="an-folds">
          <Fold title="Comment lire ces chiffres" sub="Lectures, affichages, canal : ce que chaque mot veut dire.">
            <ul className="vd-notes">
              <li>
                <b>Des lectures, pas des personnes.</b> Revoir la vidéo compte comme une nouvelle lecture. Rien n&apos;identifie un visiteur : ni cookie, ni adresse (exemption de
                consentement CNIL).
              </li>
              <li>
                <b>Affichée</b> : la vidéo est apparue à l&apos;écran. <b>Lancée</b> : le visiteur a appuyé sur lecture. Le taux de lancement dit si l&apos;aperçu donne envie.
              </li>
              <li>
                <b>Le canal</b> est celui de la page où la vidéo est vue, sans mémoire d&apos;une page à l&apos;autre : un visiteur venu d&apos;une annonce qui navigue ensuite
                compte en « SEO » ou « accès direct ».
              </li>
              <li>
                <b>Les demandes de démo</b> sont celles envoyées par un visiteur qui a regardé la vidéo pendant sa visite ; leur devenir suit l&apos;opportunité née de chacune.
              </li>
            </ul>
          </Fold>
        </div>
      </>
    );
  }

  return (
    <AnalyticsPage view={view} page="videos" title="Vidéos">
      {body}
    </AnalyticsPage>
  );
}
