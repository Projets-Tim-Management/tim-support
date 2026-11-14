import type { AdminViewServerProps, Payload } from "payload";
import Link from "next/link";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { isDirection } from "@/core/access";
import { AgentPanel } from "@/modules/ads/admin/AgentPanel";
import { ActiveToggle } from "@/modules/ai-team/admin/ActiveToggle";
import { BudgetEditor } from "@/modules/ai-team/admin/BudgetEditor";
import { ChatBox, type ChatMessage } from "@/modules/ai-team/admin/ChatBox";
import { Drawer } from "@/modules/ai-team/admin/Drawer";
import { FicheTabs, type FicheTab } from "@/modules/ai-team/admin/FicheTabs";
import { consignesOf, loadCarnet, type NoteRow } from "@/modules/ai-team/lib/notebook";
import { HoursEditor } from "@/modules/ai-team/admin/HoursEditor";
import { ObjectivesBoard, type BoardObjective } from "@/modules/ai-team/admin/ObjectivesBoard";
import { SeoWeeklyButton } from "@/modules/ai-team/admin/SeoWeeklyButton";
import { AuditButton } from "@/modules/ai-team/admin/AuditButton";
import { CompetitionButton } from "@/modules/ai-team/admin/CompetitionButton";
import { ContentPlanButton } from "@/modules/ai-team/admin/ContentPlanButton";
import { VisibilityButton } from "@/modules/ai-team/admin/VisibilityButton";
import { TechButton } from "@/modules/ai-team/admin/TechButton";
import { AuthorityButton } from "@/modules/ai-team/admin/AuthorityButton";
import { SocialButton, SocialConnect } from "@/modules/ai-team/admin/SocialConnect";
import { CopyPromptButton } from "@/modules/ai-team/admin/CopyPromptButton";
import { Inbox } from "@/modules/ai-team/admin/Inbox";
import { ProgressChart } from "@/modules/ai-team/admin/ProgressChart";
import { ReviewButton } from "@/modules/ai-team/admin/ReviewButton";
import { VeilleButton } from "@/modules/ai-team/admin/VeilleButton";
import { loadTeamView, type MemberView, type MissionView, type RunView, type TeamView } from "@/modules/ai-team/lib/activity";
import { euro } from "@/modules/ai-team/lib/format";
import { loadInbox } from "@/modules/ai-team/lib/inbox";
import { loadTeamMastery, type MemberMastery, type TeamMastery } from "@/modules/ai-team/lib/mastery";
import { Portrait } from "@/modules/ai-team/lib/portraits";
import { REQUEST_CHANNELS, REQUEST_OUTCOMES } from "@/modules/ai-team/lib/requests";
import type { Scorecard } from "@/modules/ai-team/lib/scorecard";
import { cachedScorecard, loadCompetitorNames } from "@/modules/ai-team/lib/shared-data";
import { directionAgenda } from "@/modules/ai-team/lib/agenda";
import { latestPlan } from "@/modules/ai-team/lib/seo-weekly";
import { loadFunnel, type Funnel } from "@/modules/ai-team/lib/funnel";
import { latestAudit, type Finding } from "@/modules/ai-team/lib/site-audit";
import { latestContentPlan, type ContentItem } from "@/modules/ai-team/lib/content-plan";
import { visibilityState, type Rates, type VisibilityState } from "@/modules/ai-team/lib/ai-visibility";
import { latestTech } from "@/modules/ai-team/lib/site-health";
import { latestAuthority } from "@/modules/ai-team/lib/authority";
import { socialState, type SocialState } from "@/modules/ai-team/lib/social";
import { latestCompetition, loadCompetitorRows, type CompetitionFinding, type CompetitorRow } from "@/modules/ai-team/lib/competition";
import { parisMonthDays } from "@/modules/ai-team/lib/format";
import { teamMonthlyBudget } from "@/modules/ai-team/lib/availability";
import { spentOf } from "@/modules/ads/lib/spend";
import { adsTrends, loadSnapshots } from "@/modules/ai-team/lib/snapshots";
import { monthTotal, perDay, type MemberSpend, type TeamSpend } from "@/modules/ai-team/lib/spend";
import { TEAM_GROUPS } from "@/modules/ai-team/lib/team";
import { VEILLE_DOMAINS } from "@/modules/ai-team/lib/veille-domains";
import { loadGoogleAds, type GoogleAdsView } from "@/modules/analytics/lib/google-ads";
import { loadOpenAiAds, type OpenAiAdsView } from "@/modules/analytics/lib/openai-ads";
import type { SourceResult } from "@/modules/analytics/lib/seo-cache";

/**
 * Écran « Équipe IA » (/admin/equipe-ia) — réservé à la DIRECTION
 * (super-admin ET direction@, voir core/access).
 *
 * Une équipe, pas un tableau de bord : des visages, des prénoms, et leurs
 * échanges présentés comme une messagerie. La règle de lecture : l'ESSENTIEL
 * d'abord (une phrase par message, quatre messages), le détail à un clic
 * (« Voir le détail », « Tout voir »).
 *
 * En haut, l'organigramme : la direction, puis UN BUREAU PAR CHEF (14/11/2026).
 * Un clic sur la carte d'un chef ouvre sa fiche ET son bureau : toute son
 * équipe s'affiche dessous, sur toute la largeur ; fermer la fiche laisse le
 * bureau ouvert (?bureau=…), ouvrir un autre chef referme le premier. Sur
 * chaque carte, la case « en service ». La fiche s'ouvre :
 *  - la cheffe : ses nouvelles à la direction (préparations, suivis) et ce que
 *    fait son équipe en coulisses ;
 *  - un sous-agent : ses échanges avec sa cheffe — la mission reçue, ce qu'il
 *    a rendu. On ne lui parle pas : il répond à sa cheffe.
 *
 * Lecture seule, sauf la case « en service ». Tout vient du moteur d'agents.
 */

const BASE = "/admin/equipe-ia";
const SHORT = 4;
const STATE_LABELS = { pause: "En pause", bientot: "Arrive bientôt", travail: "Au travail", validation: "Vous attend", repos: "Disponible" } as const;
const RUN_ICONS: Record<string, string> = { preparation: "🛠️", quotidien: "👀", hebdomadaire: "📅", mensuel: "📊" };
const RUN_VERBS: Record<string, string> = {
  preparation: "a préparé une campagne",
  quotidien: "a fait le point",
  hebdomadaire: "a fait le point de la semaine",
  mensuel: "a fait le bilan du mois",
};
const STATUS_PHRASES: Record<string, string> = {
  termine: "✅ C'est fait",
  "a-valider": "📝 À valider",
  "en-cours": "⏳ En cours",
  "en-attente": "🕐 En file",
  "en-pause-budget": "⏸️ Pause budget",
  echoue: "⚠️ N'a pas abouti",
  arrete: "✋ Arrêté",
};

/** Une campagne publicitaire, vue depuis la fiche de la cheffe SEA. */
type CampaignChip = { id: number | string; name: string; status: string; publication: string | null };

/** Ce que la cheffe fait d'une campagne, selon où elle en est. */
const campaignPhase = (c: CampaignChip): string =>
  c.publication === "active" ? "🟢 En ligne, suivie" : c.status === "brouillon" ? "📝 À préparer" : c.status === "en-pause" ? "⏸️ En pause" : c.status === "terminee" ? "🏁 Terminée" : "• " + c.status;

/* ─── Petits outils ─────────────────────────────────────────────────────── */

const eur = (n: number) => euro(n, 2);
const lcFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** « à l'instant », « il y a 3 h », « hier », « il y a 5 jours », puis la date. */
function ago(iso: string, now: Date): string {
  const min = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "hier";
  if (d < 8) return `il y a ${d} jours`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

function Face({ m, size }: { m: MemberView; size: number }) {
  return (
    <span className={`ait-face${m.active ? "" : " ait-face--off"}`} style={{ width: size, height: size }}>
      {m.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- image de la médiathèque, déjà optimisée
        <img className="ait-photo" src={m.photoUrl} alt={m.name} width={size} height={size} />
      ) : (
        <Portrait portrait={m.portrait} size={size} title={m.name} />
      )}
    </span>
  );
}

function StateChip({ m }: { m: MemberView }) {
  return (
    <span className={`ait-state ait-state--${m.state}`}>
      <span className="ait-state__dot" aria-hidden />
      {STATE_LABELS[m.state]}
    </span>
  );
}

/** Un texte entier derrière « Voir le détail ». */
function Detail({ children, label = "Voir le détail" }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="ait-detail">
      <summary>{label}</summary>
      <div className="ait-detail__body">{children}</div>
    </details>
  );
}

/* ─── Organigramme ──────────────────────────────────────────────────────── */

/**
 * Le coût sur la carte : le mois, et la moyenne par jour (total ÷ jours écoulés).
 * Sur la carte du chef, c'est son équipe entière, avec sa part à lui.
 */
function CardSpend({ m, spend }: { m: MemberView; spend: TeamSpend }) {
  const mine = spend.members.find((x) => x.key === m.key);
  if (!mine) return null;
  const days = spend.daysElapsed;
  const isChief = m.level === "chef";
  const total = isChief ? spend.teamMonthEur : monthTotal(mine);
  const daily = perDay(total, days);
  const projected = Math.round(daily * spend.daysInMonth * 100) / 100;
  const budget = isChief ? spend.budgetEur : null;
  const usedPct = budget ? Math.min(100, Math.round((total / budget) * 100)) : null;
  const tone = budget == null ? "" : projected > budget ? " ait-card__gauge--over" : usedPct! >= 80 ? " ait-card__gauge--high" : "";
  return (
    <div className="ait-card__spend" title={`Total du mois divisé par ${days} jour${days > 1 ? "s" : ""} écoulé${days > 1 ? "s" : ""}`}>
      <span className="ait-card__spend-main">
        💶 <strong>{eur(total)}</strong> ce mois · <strong>{eur3(daily)}</strong>/jour
      </span>
      {isChief && (
        <>
          <span className="ait-card__spend-sub">toute l&apos;équipe · dont {m.name} {eur(monthTotal(mine))}</span>
          {budget != null && (
            <span className={`ait-card__gauge${tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPct ?? 0} aria-label={`Budget IA du mois utilisé à ${usedPct} %`}>
              <span style={{ width: `${usedPct}%` }} />
            </span>
          )}
          <span className="ait-card__spend-sub">
            {budget != null ? `${usedPct} % du budget · ` : ""}à ce rythme ≈ {eur(projected)} fin du mois
            {budget != null && projected > budget ? " : au-delà du budget" : ""}
          </span>
          <BudgetEditor id={m.id} name={m.name} budgetEur={budget} capMonthEur={spend.capMonthEur} />
        </>
      )}
    </div>
  );
}

function MemberCard({ m, on, big, wide, spend, mastery, extra, expanded }: { m: MemberView; on: boolean; big?: boolean; wide?: boolean; spend: TeamSpend; mastery?: MemberMastery; extra?: React.ReactNode; expanded?: boolean }) {
  return (
    <div className={`ait-card${big ? " ait-card--chef" : ""}${on ? " ait-card--on" : ""}${m.active ? "" : " ait-card--off"}`}>
      <Link href={`${BASE}?membre=${m.key}`} prefetch={false} scroll={false} className="ait-card__link" aria-current={on ? "true" : undefined} aria-expanded={expanded}>
        <Face m={m} size={big ? 104 : wide ? 128 : 76} />
        <span className="ait-card__name">{m.name}</span>
        <span className="ait-card__job">{m.jobTitle}</span>
        <StateChip m={m} />
        <span className="ait-card__line">{m.stateLine}</span>
        {mastery && <CardMastery x={mastery} />}
      </Link>
      {m.engineRoles.length > 0 && <CardSpend m={m} spend={spend} />}
      {extra}
      {m.engineRoles.length > 0 && <ActiveToggle id={m.id} name={m.name} active={m.active} />}
    </div>
  );
}

/* ─── Budget IA ─────────────────────────────────────────────────────────── */

const HINT_ICONS = { info: "ℹ️", save: "💡", warn: "⚠️" } as const;
const eur3 = (n: number) => euro(n, 2, 3);

/**
 * Ce que coûte l'équipe du chef : le total du mois face au plafond des agents,
 * une barre par membre, les pistes d'optimisation tirées des vrais chiffres —
 * et le détail complet (depuis le début) derrière un clic.
 */
function Budget({ spend, members }: { spend: TeamSpend; members: MemberView[] }) {
  const byKey = new Map(members.map((m) => [m.key, m]));
  const max = Math.max(0.0001, ...spend.members.map((x) => x.month.spentEur + (x.conversationsEur ?? 0) + (x.questionsEur ?? 0)));
  const capPct = spend.capMonthEur ? Math.min(100, Math.round((spend.teamMonthEur / spend.capMonthEur) * 100)) : null;
  const sub = (x: MemberSpend) =>
    x.level === "chef"
      ? `passages ${eur3(x.month.spentEur)} · conversations ${eur3(x.conversationsEur ?? 0)} · questions ${eur3(x.questionsEur ?? 0)}`
      : x.month.missions
        ? `${x.month.missions} mission${x.month.missions > 1 ? "s" : ""} · ${x.month.usedPct ?? 0} % du budget confié utilisé`
        : "aucune mission ce mois";
  return (
    <section className="ait-budget">
      <h3 className="ait-h3">💶 Budget IA de l&apos;équipe</h3>
      <div className="ait-budget__total">
        <strong>{eur(spend.teamMonthEur)}</strong>
        <span>
          dépensés ce mois par toute l&apos;équipe{spend.budgetEur != null ? ` sur un budget de ${eur(spend.budgetEur)}` : ""} · {eur(spend.teamAllEur)} depuis le début
        </span>
      </div>
      {capPct != null && (
        <div className="ait-budget__cap" title="Plafond mensuel de tous les agents (Publicité › Garde-fous)">
          <span className="ait-budget__track">
            <span className={`ait-budget__fill${capPct >= 80 ? " ait-budget__fill--high" : ""}`} style={{ width: `${capPct}%` }} />
          </span>
          <span>
            {capPct} % du plafond mensuel des agents ({eur(spend.capMonthEur!)})
          </span>
        </div>
      )}
      <ul className="ait-budget__rows">
        {spend.members.map((x) => {
          const m = byKey.get(x.key);
          const total = x.month.spentEur + (x.conversationsEur ?? 0) + (x.questionsEur ?? 0);
          return (
            <li key={x.key}>
              {m && <Face m={m} size={28} />}
              <span className="ait-budget__who">
                <span className="ait-budget__name">
                  <strong>{x.name}</strong>
                  <span>{eur3(total)}</span>
                </span>
                <span className="ait-budget__bar" aria-hidden>
                  <span style={{ width: `${(total / max) * 100}%` }} />
                </span>
                <span className="ait-budget__sub">{sub(x)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {spend.hints.length > 0 && (
        <ul className="ait-hints">
          {spend.hints.map((h) => (
            <li key={h.memberKey} className={`ait-hint ait-hint--${h.tone}`}>
              <span aria-hidden>{HINT_ICONS[h.tone]}</span> {h.text}
            </li>
          ))}
        </ul>
      )}
      <Detail label="Le détail depuis le début">
        <table className="ait-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Missions</th>
              <th>Budget confié</th>
              <th>Dépensé</th>
              <th>Utilisé</th>
              <th>Moyenne</th>
              <th>Plus haute</th>
              <th>Plancher du moteur</th>
            </tr>
          </thead>
          <tbody>
            {spend.members.map((x) => (
              <tr key={x.key}>
                <td>{x.name}</td>
                <td>{x.all.missions}</td>
                <td>{eur(x.all.budgetEur)}</td>
                <td>{eur3(x.all.spentEur)}</td>
                <td>{x.all.usedPct != null ? `${x.all.usedPct} %` : "—"}</td>
                <td>{x.all.avgEur != null ? eur3(x.all.avgEur) : "—"}</td>
                <td>{x.all.maxEur != null ? eur3(x.all.maxEur) : "—"}</td>
                <td>{x.floorEur != null ? eur(x.floorEur) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ait-meta">Budget confié : ce que le chef réserve pour une mission (le reste lui revient à la fin). Plancher : le minimum que le moteur impose, deux tours au coût maximal. Pour le chef, les passages seulement.</p>
      </Detail>
    </section>
  );
}

/* ─── Une fiche en quelques coups d'œil : quatre chiffres, puis des onglets ─── */

type Kpi = { label: string; value: React.ReactNode; sub?: React.ReactNode; alert?: boolean; gauge?: number | null };

/** Les chiffres clés en tête d'une fiche (quatre, d'un coup d'œil) ; `alert` encadre ce qui demande l'attention. */
function Kpis({ items }: { items: Kpi[] }) {
  return (
    <ul className="ait-kpis">
      {items.map((k) => (
        <li key={k.label} className={`ait-kpi${k.alert ? " ait-kpi--alert" : ""}`}>
          <span className="ait-kpi__label">{k.label}</span>
          <strong className="ait-kpi__value">{k.value}</strong>
          {k.sub ? <span className="ait-kpi__sub">{k.sub}</span> : null}
          {k.gauge != null && (
            <span className={`ait-kpi__gauge${k.gauge >= 80 ? " ait-kpi__gauge--high" : ""}`} aria-hidden>
              <span style={{ width: `${Math.min(100, Math.max(0, k.gauge))}%` }} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

type Pane = { key: string; label: string; badge?: number; body: React.ReactNode };

/** Le détail d'une fiche rangé en onglets ; une seule section : pas d'onglet. */
function Panes({ panes, initial }: { panes: Pane[]; initial?: string }) {
  const shown = panes.filter((p) => p.body != null && p.body !== false);
  if (!shown.length) return null;
  if (shown.length === 1) return <>{shown[0].body}</>;
  return (
    <FicheTabs tabs={shown.map(({ key, label, badge }) => ({ key, label, badge: badge || undefined }))} initial={initial}>
      {shown.map((p) => (
        <div key={p.key}>{p.body}</div>
      ))}
    </FicheTabs>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

/* ─── La fiche des canaux (Yanis) ───────────────────────────────────────── */

const eur0 = (n: number | null) => euro(n);

/**
 * Ce que coûte un lead qualifié, canal par canal : d'abord les phrases à
 * retenir, puis le tableau, puis les budgets fixés — et les limites de la
 * lecture derrière un clic.
 */
function ScorecardView({ card, members }: { card: Scorecard; members: MemberView[] }) {
  const byKey = new Map(members.map((m) => [m.key, m]));
  const months = card.window.months;
  return (
    <section className="ait-score">
      <h3 className="ait-h3">📊 La fiche des canaux — {months} derniers mois</h3>
      <p className="ait-meta">Lead qualifié : une démo programmée (ou une étape plus avancée), même si l&apos;affaire est perdue ensuite.</p>
      {card.headlines.length > 0 && (
        <ul className="ait-score__headlines">
          {card.headlines.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      <div className="ait-score__scroll">
        <table className="ait-table ait-score__table">
          <thead>
            <tr>
              <th>Canal</th>
              <th>Dépense</th>
              <th>Leads</th>
              <th>Qualifiés</th>
              <th>Signés</th>
              <th>€ / lead</th>
              <th>€ / qualifié</th>
              <th>€ / signé</th>
              <th>Évol. € / qualifié</th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((r) => {
              const owner = r.owner ? byKey.get(r.owner) : undefined;
              const trendTone = r.cpqTrend == null ? "" : r.cpqTrend <= 0 ? " ait-score__trend--good" : " ait-score__trend--bad";
              return (
                <tr key={r.key} className={card.best === r.key ? "ait-score__best" : undefined}>
                  <td>
                    <span className="ait-score__channel">
                      {owner && <Face m={owner} size={22} />}
                      <strong>{r.label}</strong>
                      {card.best === r.key && <span title="Le lead qualifié le moins cher">🏆</span>}
                    </span>
                  </td>
                  <td>{r.paid ? eur0(r.now.spend) : "—"}</td>
                  <td>{r.now.leads}</td>
                  <td>
                    {r.now.qualified}
                    {r.now.qualifiedRate != null && <span className="ait-score__rate"> ({r.now.qualifiedRate} %)</span>}
                  </td>
                  <td>{r.now.won}</td>
                  <td>{r.paid ? eur0(r.now.costPerLead) : "—"}</td>
                  <td>
                    <strong>{r.paid ? eur0(r.now.costPerQualified) : "—"}</strong>
                  </td>
                  <td>{r.paid ? eur0(r.now.costPerWon) : "—"}</td>
                  <td className={`ait-score__trend${trendTone}`}>{r.cpqTrend == null ? "—" : `${r.cpqTrend > 0 ? "▲ +" : "▼ "}${r.cpqTrend.toLocaleString("fr-FR")} %`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Detail label="Les budgets que vous avez fixés">
        {card.budgets.length ? (
          <ul className="ait-score__budgets">
            {card.budgets.map((b) => (
              <li key={String(b.id)}>
                <Link href={`/admin/collections/ad-campaigns/${b.id}`} prefetch={false}>
                  {b.name}
                </Link>{" "}
                · {b.platform} · {b.status} · {b.dailyEur != null ? `${eur0(b.dailyEur)} / jour` : "pas de budget quotidien saisi"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ait-text">Aucune campagne.</p>
        )}
      </Detail>
      {card.caveats.length > 0 && (
        <Detail label="Les limites de cette lecture">
          {card.caveats.map((c) => (
            <p key={c} className="ait-text">
              {c}
            </p>
          ))}
          <p className="ait-text">
            Période comparée : depuis le {card.window.from}, face aux {months} mois d&apos;avant (depuis le {card.window.previousFrom}).
          </p>
        </Detail>
      )}
    </section>
  );
}

/* ─── Ce que lit Thomas (Google Ads) ────────────────────────────────────── */

const eur2 = (n: number | null) => euro(n, 2);

/** Les tendances lues dans les photos du lundi (vide : pas encore assez de photos). */
function Trends({ lines }: { lines: string[] }) {
  if (!lines.length) return <p className="ait-meta">📈 Les tendances apparaîtront après deux photos du lundi (une par semaine).</p>;
  return (
    <section className="ait-score">
      <h3 className="ait-h3">📈 Les tendances, semaine après semaine</h3>
      <ul className="ait-score__headlines">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

/** Ce que Thomas lit de Google Ads : ses chiffres clés et ses onglets — ou ce qui empêche de lire. */
function googleAdsFiche(gads: SourceResult<GoogleAdsView> | null, chief: MemberView | undefined): { problem: React.ReactNode | null; kpis: Kpi[]; panes: Pane[]; footer: React.ReactNode } {
  const empty = { kpis: [] as Kpi[], panes: [] as Pane[], footer: null };
  if (!gads) return { problem: <p className="ait-empty">Google Ads n&apos;a pas pu être lu pour l&apos;instant.</p>, ...empty };
  if (gads.status === "missing") return { problem: <p className="ait-paused">🔌 Le connecteur Google Ads n&apos;est pas branché : variable(s) {gads.missing.join(", ")} (Système › Connexions du support).</p>, ...empty };
  if (gads.status === "error") return { problem: <p className="ait-paused">⚠️ Google Ads n&apos;a pas répondu : {gads.message}</p>, ...empty };
  const g = gads.data;
  return {
    problem: null,
    kpis: [
      { label: "💶 Dépensé sur 30 jours", value: eur0(g.last30.cost), sub: `${g.campaigns.length} campagne${g.campaigns.length > 1 ? "s" : ""}` },
      { label: "🖱️ Clics", value: g.last30.clicks.toLocaleString("fr-FR"), sub: `${eur2(g.last30.cpc)} le clic` },
      { label: "🎯 Conversions remontées", value: g.last30.conversions, sub: g.activeConversionActions ? `${g.activeConversionActions} action(s) de conversion active(s)` : "aucune action de conversion active", alert: !g.activeConversionActions },
      { label: `📝 Constats pour ${chief?.name ?? "sa cheffe"}`, value: g.findings.length, sub: g.findings.length ? "repris dans sa revue du lundi" : "rien à signaler", alert: g.findings.length > 0 },
    ],
    panes: [
      {
        key: "constats",
        label: "📝 Constats",
        badge: g.findings.length,
        body: g.findings.length ? (
          <section className="ait-score">
            <ul className="ait-score__headlines">
              {g.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="ait-meta">{chief?.name ?? "Sa cheffe"} les reprend dans sa revue du lundi, en recommandations pour vous.</p>
          </section>
        ) : (
          <p className="ait-empty">Aucun constat : rien d&apos;anormal sur le compte.</p>
        ),
      },
      {
        key: "campagnes",
        label: "📈 Campagnes",
        body: (
          <div className="ait-score__scroll">
            <table className="ait-table">
              <thead>
                <tr>
                  <th>Campagne</th>
                  <th>État</th>
                  <th>Budget / jour</th>
                  <th>Dépense</th>
                  <th>Clics</th>
                  <th>€ / clic</th>
                  <th>Conversions</th>
                </tr>
              </thead>
              <tbody>
                {g.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong> <span className="ait-score__rate">· {c.type}</span>
                    </td>
                    <td>{c.status}</td>
                    <td>{eur0(c.dailyBudget)}</td>
                    <td>{eur0(c.cost)}</td>
                    <td>{c.clicks}</td>
                    <td>{eur2(c.cpc)}</td>
                    <td>{c.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      },
      {
        key: "recherches",
        label: "🔎 Recherches",
        badge: g.searchTerms.length,
        body: (
          <div className="ait-score__scroll">
            <table className="ait-table">
              <thead>
                <tr>
                  <th>Recherche</th>
                  <th>Dépense</th>
                  <th>Clics</th>
                  <th>Conversions</th>
                  <th>Concurrent</th>
                </tr>
              </thead>
              <tbody>
                {g.searchTerms.map((t) => (
                  <tr key={t.term}>
                    <td>{t.term}</td>
                    <td>{eur2(t.cost)}</td>
                    <td>{t.clicks}</td>
                    <td>{t.conversions}</td>
                    <td>{t.competitor ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      },
      {
        key: "mots-cles",
        label: "🔑 Mots-clés",
        badge: g.keywords.length,
        body: (
          <div className="ait-score__scroll">
            <table className="ait-table">
              <thead>
                <tr>
                  <th>Mot-clé</th>
                  <th>Correspondance</th>
                  <th>État</th>
                  <th>Dépense</th>
                  <th>Clics</th>
                  <th>Conversions</th>
                  <th>Qualité /10</th>
                </tr>
              </thead>
              <tbody>
                {g.keywords.map((k) => (
                  <tr key={`${k.text}-${k.match}`}>
                    <td>{k.text}</td>
                    <td>{k.match}</td>
                    <td>{k.status}</td>
                    <td>{eur2(k.cost)}</td>
                    <td>{k.clicks}</td>
                    <td>{k.conversions}</td>
                    <td>{k.quality ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      },
    ],
    footer: <p className="seo-fetched">Google Ads lu le {new Date(gads.fetchedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} · lecture seule · relu toutes les 3 h</p>,
  };
}

/* ─── Ce que lit Sarah (ChatGPT Ads) ────────────────────────────────────── */

/** Ce que Sarah lit de ChatGPT Ads : ses chiffres clés et ses onglets — ou ce qui empêche de lire. */
function openAiAdsFiche(oads: SourceResult<OpenAiAdsView> | null, chief: MemberView | undefined): { problem: React.ReactNode | null; kpis: Kpi[]; panes: Pane[]; footer: React.ReactNode } {
  const empty = { kpis: [] as Kpi[], panes: [] as Pane[], footer: null };
  if (!oads) return { problem: <p className="ait-empty">ChatGPT Ads n&apos;a pas pu être lu pour l&apos;instant.</p>, ...empty };
  if (oads.status === "missing") return { problem: <p className="ait-paused">🔌 Le connecteur ChatGPT Ads n&apos;est pas branché : variable(s) {oads.missing.join(", ")} (Système › Connexions du support).</p>, ...empty };
  if (oads.status === "error") return { problem: <p className="ait-paused">⚠️ ChatGPT Ads n&apos;a pas répondu : {oads.message}</p>, ...empty };
  const o = oads.data;
  return {
    problem: null,
    kpis: [
      { label: "💶 Dépensé sur 30 jours", value: eur0(o.last30.spend), sub: `${o.last30.impressions.toLocaleString("fr-FR")} affichages` },
      { label: "🖱️ Clics", value: o.last30.clicks.toLocaleString("fr-FR"), sub: `${eur2(o.last30.cpc)} le clic` },
      { label: "🎯 Conversions du pixel", value: o.last30.conversions, sub: o.last30.costPerConversion != null ? `${eur0(o.last30.costPerConversion)} chacune · pas un lead qualifié` : "pas un lead qualifié" },
      { label: `📝 Constats pour ${chief?.name ?? "sa cheffe"}`, value: o.findings.length, sub: o.findings.length ? "repris dans sa revue du lundi" : "rien à signaler", alert: o.findings.length > 0 },
    ],
    panes: [
      {
        key: "constats",
        label: "📝 Constats",
        badge: o.findings.length,
        body: o.findings.length ? (
          <section className="ait-score">
            <ul className="ait-score__headlines">
              {o.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="ait-meta">{chief?.name ?? "Sa cheffe"} les reprend dans sa revue du lundi, en recommandations pour vous.</p>
          </section>
        ) : (
          <p className="ait-empty">Aucun constat : rien d&apos;anormal sur le compte.</p>
        ),
      },
      {
        key: "campagnes",
        label: "📈 Campagnes",
        body: (
          <div className="ait-score__scroll">
            <table className="ait-table">
              <thead>
                <tr>
                  <th>Campagne</th>
                  <th>Dépense</th>
                  <th>Affichages</th>
                  <th>Clics</th>
                  <th>€ / clic</th>
                  <th>Conversions</th>
                  <th>€ / conversion</th>
                </tr>
              </thead>
              <tbody>
                {o.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>{eur0(c.spend)}</td>
                    <td>{c.impressions.toLocaleString("fr-FR")}</td>
                    <td>{c.clicks}</td>
                    <td>{eur2(c.cpc)}</td>
                    <td>{c.conversions}</td>
                    <td>{eur0(c.costPerConversion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      },
    ],
    footer: <p className="seo-fetched">ChatGPT Ads lu le {new Date(oads.fetchedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} · lecture seule · relu toutes les 3 h</p>,
  };
}

/* ─── Sa maîtrise, sur 100 ──────────────────────────────────────────────── */

const deltaOf = (x: MemberMastery) => (x.history.length >= 2 ? x.mastery.score - x.history[x.history.length - 2].score : null);
const deltaText = (d: number | null) => (d == null ? null : d === 0 ? "= depuis lundi dernier" : `${d > 0 ? "▲ +" : "▼ "}${d} depuis lundi dernier`);

/** La jauge : le score sur 100, sans couleur d'état (le chiffre dit tout). */
function MasteryBar({ score, label }: { score: number; label: string }) {
  return (
    <span className="ait-mastery__bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label={label}>
      <span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </span>
  );
}

/** Sur la carte de l'organigramme : « Maîtrise 42/100 ▲ +5 ». */
function CardMastery({ x }: { x: MemberMastery }) {
  const d = deltaOf(x);
  return (
    <span className="ait-card__mastery" title="Score de maîtrise : résultats, à jour, preuves, apprentissage — la cible est 100">
      <span>
        🎓 Maîtrise <strong>{x.mastery.score}</strong>/100
        {d != null && d !== 0 ? <span className="ait-card__mastery-delta">{d > 0 ? ` ▲ +${d}` : ` ▼ ${d}`}</span> : null}
      </span>
      <MasteryBar score={x.mastery.score} label={`Maîtrise de ${x.name} : ${x.mastery.score} sur 100`} />
    </span>
  );
}

/** Dans la fiche : le score, ses quatre parts (constat, et comment gagner des points), la courbe. */
function MasteryView({ m, x }: { m: MemberView; x: MemberMastery | undefined }) {
  if (!x) return null;
  const d = deltaText(deltaOf(x));
  return (
    <section className="ait-score ait-mastery">
      <h3 className="ait-h3">🎓 Maîtrise de {m.name}</h3>
      <div className="ait-mastery__head">
        <span className="ait-mastery__score">
          {x.mastery.score}
          <span>/100</span>
        </span>
        {d && <span className="ait-mastery__delta">{d}</span>}
      </div>
      <MasteryBar score={x.mastery.score} label={`Maîtrise de ${m.name} : ${x.mastery.score} sur 100`} />
      <p className="ait-mastery__why">
        La cible est 100 pour toute l&apos;équipe. Personne ne l&apos;atteint pour de bon : les plateformes et les méthodes changent chaque semaine, alors {m.name} doit sans cesse apprendre pour s&apos;en approcher — et redescend s&apos;il s&apos;arrête.
      </p>
      <ul className="ait-mastery__parts">
        {x.mastery.parts.map((p) => (
          <li key={p.key} className="ait-mastery__part">
            <span className="ait-mastery__part-top">
              <strong>{p.label}</strong>
              <span>
                {p.points}/{p.max}
              </span>
            </span>
            <MasteryBar score={(p.points / p.max) * 100} label={`${p.label} : ${p.points} sur ${p.max}`} />
            <span className="ait-mastery__detail">{p.detail}</span>
            {p.next && <span className="ait-mastery__next">Pour gagner des points : {p.next.charAt(0).toLowerCase() + p.next.slice(1)}</span>}
          </li>
        ))}
      </ul>
      {x.history.length > 1 ? (
        <ProgressChart points={x.history.map((h) => ({ week: h.week, value: h.score }))} unit="pts" target={100} benchmark={null} label={`Maîtrise de ${m.name}, semaine après semaine`} />
      ) : (
        <p className="ait-mastery__hint">La courbe semaine après semaine apparaîtra après deux lundis (le score est photographié chaque lundi matin).</p>
      )}
    </section>
  );
}

/* ─── Sa méthode (veille de la semaine) ─────────────────────────────────── */

type MethodDoc = { id: string; week: string; status: string; method: string | null; changes: string | null; ideas: { titre: string; pourquoi: string; source: string; test: string }[]; sources: { url: string; title: string }[]; searches: number | null; costEur: number | null; error: string | null; at: string };
export type MethodState = { current: MethodDoc | null; latest: MethodDoc | null; versions: number; running: boolean };

const dateFr = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Un Markdown simple (titres, puces, paragraphes), sans HTML injecté. */
function MethodText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`}>{list.map((li, i) => <li key={i}>{li}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      flush();
      blocks.push(<h4 key={`h${blocks.length}`} className="ait-method__h">{line.replace(/^#{1,4}\s/, "")}</h4>);
    } else if (/^[-*•]\s/.test(line)) list.push(line.replace(/^[-*•]\s/, "").replace(/\*\*/g, ""));
    else {
      flush();
      blocks.push(<p key={`p${blocks.length}`}>{line.replace(/\*\*/g, "")}</p>);
    }
  }
  flush();
  return <div className="ait-method__text">{blocks}</div>;
}

function MethodView({ m, state }: { m: MemberView; state: MethodState | null }) {
  const domain = VEILLE_DOMAINS[m.key];
  if (!domain) return null;
  const cur = state?.current ?? null;
  const latest = state?.latest ?? null;
  const running = Boolean(state?.running);
  const failed = latest?.status === "echec" && (!cur || Date.parse(latest.at) > Date.parse(cur.at)) ? latest : null;
  return (
    <section className="ait-score ait-method">
      <h3 className="ait-h3">📘 {domain.title} — pour TIM</h3>
      {m.active && <VeilleButton memberKey={m.key} name={m.name} />}
      {running && <p className="ait-meta">🔎 Veille en cours depuis le {dateFr(latest!.at)}…</p>}
      {failed && <p className="ait-paused">⚠️ La dernière veille n&apos;a pas abouti ({dateFr(failed.at)}) : {failed.error ?? "incident technique"}</p>}
      {cur ? (
        <>
          <p className="ait-meta">
            Version du {dateFr(cur.at)} · {state!.versions} version{state!.versions > 1 ? "s" : ""}
            {cur.searches != null ? ` · ${cur.searches} recherche${cur.searches > 1 ? "s" : ""} web` : ""}
            {cur.costEur != null ? ` · ${eur3(cur.costEur)}` : ""}
          </p>
          {cur.changes && (
            <>
              <h4 className="ait-method__h">Ce qui a changé cette semaine</h4>
              <MethodText text={cur.changes} />
            </>
          )}
          {cur.ideas.length > 0 && (
            <>
              <h4 className="ait-method__h">💡 Ses idées à tester chez TIM</h4>
              <ul className="ait-score__headlines">
                {cur.ideas.map((i) => (
                  <li key={i.titre}>
                    <strong>{i.titre}</strong> — {i.test}
                    {i.pourquoi ? <span className="ait-score__rate"> · {i.pourquoi}</span> : null}
                    {i.source ? (
                      <>
                        {" "}
                        <a href={i.source} target="_blank" rel="noopener noreferrer nofollow">
                          ({hostOf(i.source)})
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="ait-meta">{domain.team === "seo" ? "Serge les reprend en objectifs quand elles passent devant, dans sa revue du lundi." : "Margaux choisit lesquelles tester, dans sa revue du lundi."}</p>
            </>
          )}
          <Detail label="Lire sa méthode complète">{cur.method ? <MethodText text={cur.method} /> : null}</Detail>
          {cur.sources.length > 0 && (
            <Detail label={`Ses sources (${cur.sources.length})`}>
              <ul className="ait-method__sources">
                {cur.sources.map((x) => (
                  <li key={x.url}>
                    <a href={x.url} target="_blank" rel="noopener noreferrer nofollow">
                      {x.title}
                    </a>{" "}
                    <span className="ait-score__rate">· {hostOf(x.url)}</span>
                  </li>
                ))}
              </ul>
            </Detail>
          )}
        </>
      ) : (
        !running && <p className="ait-empty">Pas encore de méthode : sa première veille aura lieu dimanche soir, ou maintenant avec le bouton.</p>
      )}
    </section>
  );
}

/* ─── Ses recommandations, et ce qu'elles ont donné ─────────────────────── */

export type RecoView = { id: string; at: string; title: string; channel: string | null; status: string; outcome: string | null; verdict: string | null };
const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(REQUEST_OUTCOMES.map((o) => [o.value, o.label]));
const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(REQUEST_CHANNELS.map((c) => [c.value, c.label]));
const RECO_STATE: Record<string, string> = { ouverte: "⏳ attend votre décision", faite: "👍 appliquée", repondue: "💬 répondue", retiree: "🚫 retirée" };

function Recos({ recos, name }: { recos: RecoView[]; name: string }) {
  const judged = recos.filter((r) => r.outcome);
  const worked = judged.filter((r) => r.outcome === "a-marche").length;
  return (
    <section className="ait-score">
      <h3 className="ait-h3">📏 Ses recommandations, et ce qu&apos;elles ont donné</h3>
      {recos.length ? (
        <>
          <p className="ait-meta">
            {judged.length ? `${worked} sur ${judged.length} jugée${judged.length > 1 ? "s" : ""} ont marché` : "Aucune encore jugée"} · {name} juge chaque recommandation appliquée deux semaines après, chiffres avant / après à l&apos;appui
          </p>
          <ul className="ait-score__headlines">
            {recos.map((r) => (
              <li key={r.id}>
                <strong>{r.title}</strong>
                <span className="ait-score__rate">
                  {" "}
                  · {CHANNEL_LABEL[r.channel ?? "tous"] ?? "Tous canaux"} · {new Date(r.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })} · {r.outcome ? OUTCOME_LABEL[r.outcome] : (RECO_STATE[r.status] ?? r.status)}
                </span>
                {r.verdict ? <span className="ait-text"> — {r.verdict}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="ait-empty">Pas encore de recommandation suivie : elles arrivent avec sa revue du lundi.</p>
      )}
    </section>
  );
}

/* ─── Serge, directeur SEO & GEO ───────────────────────────────────────── */

export type SeoChiefView = {
  /** Le premier jour du dernier plan (« AAAA-MM-JJ »), ou null sans plan. */
  week: string | null;
  objectives: BoardObjective[];
  monthEur: number;
  budgetEur: number | null;
  hours: number | null;
  agenda: string | null;
  daysElapsed: number;
  daysInMonth: number;
};

/** Sur sa carte : où en sont les objectifs de la semaine, et ce que coûte l'équipe ce mois. */
function SeoCardExtra({ m, seo }: { m: MemberView; seo: SeoChiefView }) {
  const open = seo.objectives.filter((o) => o.status === "a-faire").length;
  const done = seo.objectives.filter((o) => o.status === "fait").length;
  const daily = seo.monthEur / Math.max(1, seo.daysElapsed);
  return (
    <div className="ait-card__spend">
      <span className="ait-card__spend-main">
        🎯 {seo.objectives.length ? `${done}/${seo.objectives.length} objectif${seo.objectives.length > 1 ? "s" : ""} fait${done > 1 ? "s" : ""}${open ? ` · ${open} à faire` : ""}` : "Pas encore d'objectifs cette semaine"}
      </span>
      <span className="ait-card__spend-sub">
        💶 {eur(seo.monthEur)} ce mois · {eur3(daily)}/jour{seo.budgetEur != null ? ` · ${Math.min(100, Math.round((seo.monthEur / Math.max(0.01, seo.budgetEur)) * 100))} % du budget` : ""}
      </span>
      <BudgetEditor id={m.id} name={m.name} budgetEur={seo.budgetEur} capMonthEur={null} />
    </div>
  );
}

function SeoChiefPanel({ m, seo, chat, notes, members, mastery, method }: { m: MemberView; seo: SeoChiefView; chat: ChatMessage[]; notes: NoteRow[]; members: MemberView[]; mastery: TeamMastery; method: MethodState | null }) {
  const planFr = seo.week ? new Date(`${seo.week}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : null;
  const dueLast = seo.objectives.map((o) => o.dueDate).filter((d): d is string => Boolean(d)).sort().at(-1);
  const planned = seo.objectives.reduce((n, o) => n + (o.minutes ?? 0), 0);
  const done = seo.objectives.filter((o) => o.status === "fait").length;
  const open = seo.objectives.filter((o) => o.status === "a-faire").length;
  const hours = seo.hours ?? 5;
  const budgetPct = seo.budgetEur ? Math.min(100, Math.round((seo.monthEur / Math.max(0.01, seo.budgetEur)) * 100)) : null;
  const consignes = notes.filter((n) => n.kind === "consigne" && n.status === "active").length;
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={<p className="ait-reports">{m.name} suit la visibilité gratuite de TIM — Google, les IA, YouTube, LinkedIn, Instagram — jusqu&apos;au lead qualifié. Il recommande et vous fixe des objectifs ; il ne rédige pas : ses prompts sont prêts à coller dans ChatGPT ou Claude.</p>}
      />
      <PausedNote m={m} />
      <Kpis
        items={[
          { label: "🎯 Objectifs de la semaine", value: seo.objectives.length ? `${done} / ${seo.objectives.length}` : "—", sub: seo.objectives.length ? (open ? `${open} à faire${dueLast ? ` d'ici ${shortDate(dueLast)}` : ""}` : "tout est fait") : "ils arrivent lundi matin", alert: open > 0 },
          { label: "⏱️ Votre temps", value: `${Math.round((planned / 60) * 10) / 10} h`, sub: `prévues sur vos ${hours.toLocaleString("fr-FR")} h`, gauge: hours ? Math.round((planned / 60 / hours) * 100) : null },
          { label: "💶 Budget IA du mois", value: eur(seo.monthEur), sub: budgetPct != null ? `${budgetPct} % de ${eur(seo.budgetEur!)}` : "pas de budget fixé", gauge: budgetPct },
          { label: "📣 Consignes à l'équipe", value: consignes, sub: consignes ? "jointes à leurs missions" : "aucune en cours" },
        ]}
      />
      {m.active && <SeoWeeklyButton name={m.name} />}
      {m.active ? <ChatBox memberKey={m.key} name={m.name} portrait={m.portrait} initial={chat} /> : null}
      <Panes
        panes={[
          {
            key: "objectifs",
            label: "🎯 Vos objectifs",
            badge: open,
            body: seo.objectives.length ? (
              <section className="ait-score">
                <p className="ait-meta">
                  {planFr ? `À partir du ${planFr} · ` : ""}classés par importance
                </p>
                <ObjectivesBoard objectives={seo.objectives} />
              </section>
            ) : (
              <p className="ait-empty">Pas encore d&apos;objectifs : ils arrivent lundi matin, ou maintenant avec le bouton.</p>
            ),
          },
          { key: "carnet", label: "🧠 Carnet", badge: consignes, body: <CarnetView m={m} notes={notes} members={members} /> },
          { key: "maitrise", label: "🎓 Maîtrise", body: mastery[m.key] ? <MasteryView m={m} x={mastery[m.key]} /> : null },
          { key: "methode", label: "📘 Méthode", body: <MethodView m={m} state={method} /> },
          {
            key: "reglages",
            label: "⚙️ Réglages",
            body: (
              <section className="ait-score">
                <HoursEditor id={m.id} name={m.name} hours={seo.hours} />
                <p className="ait-meta">📅 Agenda : {seo.agenda ?? `aucun agenda Google utilisable — ${m.name} ne pose pas de créneaux (Connexions des agendas).`}</p>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}

/* ─── Ana, analyste de bout en bout ─────────────────────────────────────── */

export type AnalystView = { funnel: Funnel | null; audit: { at: string; summary: string; findings: Finding[] } | null };
const KIND_LABEL: Record<string, string> = { search: "Moteur", ai: "IA", social: "Réseau" };
const IMPACT_LABEL: Record<string, string> = { fort: "🔴 impact fort", moyen: "🟠 impact moyen", faible: "⚪ impact faible" };
const TYPE_LABEL: Record<string, string> = { technique: "Technique", contenu: "Contenu", conversion: "Conversion" };
const pctFr = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR")} %`);

function AnalystPanel({ m, chief, view, extra = [] }: { m: MemberView; chief: MemberView | undefined; extra?: Pane[]; view: AnalystView }) {
  const f = view.funnel;
  const strong = view.audit?.findings.filter((x) => x.impact === "fort").length ?? 0;
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> {m.name} suit tout le parcours gratuit, de la première visite au client signé, et remet à {chief.name} ce qui marche vraiment et ce qui fuit.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      {m.active && <AuditButton name={m.name} />}
      {f && f.rows.length ? (
        <Kpis
          items={[
            { label: "👀 Visites gratuites", value: f.totals.sessions.toLocaleString("fr-FR"), sub: `depuis le ${new Date(`${f.since}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}` },
            { label: "📝 Leads", value: f.totals.leads, sub: `${pctFr(f.totals.leadRate)} des visites` },
            { label: "✅ Qualifiés", value: f.totals.qualified, sub: `${pctFr(f.totals.qualifiedRate)} des leads · ${f.totals.won} client${f.totals.won > 1 ? "s" : ""}` },
            { label: "🕳️ Pages qui fuient", value: f.attractWithoutConverting.length, sub: "attirent sans aucun lead", alert: f.attractWithoutConverting.length > 0 },
          ]}
        />
      ) : (
        <p className="ait-empty">L&apos;entonnoir n&apos;a pas pu être calculé (GA4 ou les leads ne répondent pas).</p>
      )}
      <Panes
        panes={[
          {
            key: "audit",
            label: "🔬 Son audit",
            badge: strong,
            body: view.audit ? (
              <section className="ait-score">
                <p className="ait-meta">Audit du {shortDate(view.audit.at)}</p>
                <p className="ait-obj__text">{view.audit.summary}</p>
            <ol className="ait-objs">
              {view.audit.findings.map((x, i) => (
                <li key={i} className="ait-obj">
                  <div className="ait-obj__top">
                    <span className="ait-obj__rank">{i + 1}</span>
                    <div className="ait-obj__head">
                      <strong className="ait-obj__title">{x.problem}</strong>
                      <span className="ait-obj__meta">
                        {IMPACT_LABEL[x.impact]} · {TYPE_LABEL[x.type]}
                      </span>
                      {x.page && <span className="ait-obj__page">{x.page}</span>}
                    </div>
                  </div>
                  {x.evidence && <p className="ait-obj__text">📊 {x.evidence}</p>}
                  <p className="ait-obj__text">➡️ {x.action}</p>
                  {x.prompt && <CopyPromptButton prompt={x.prompt} />}
                </li>
              ))}
            </ol>
              </section>
            ) : (
              <p className="ait-empty">Pas encore d&apos;audit : le premier aura lieu au début du mois, ou maintenant avec le bouton.</p>
            ),
          },
          {
            key: "entonnoir",
            label: "🧭 Entonnoir par source",
            body:
              f && f.rows.length ? (
                <section className="ait-score">
            <div className="ait-score__scroll">
              <table className="ait-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Visites</th>
                    <th>Leads</th>
                    <th>Lead / visite</th>
                    <th>Qualifiés</th>
                    <th>Qualifiés / lead</th>
                    <th>Clients</th>
                  </tr>
                </thead>
                <tbody>
                  {f.rows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <strong>{r.label}</strong> <span className="ait-score__rate">· {KIND_LABEL[r.kind]}</span>
                      </td>
                      <td>{r.sessions.toLocaleString("fr-FR")}</td>
                      <td>{r.leads}</td>
                      <td>{pctFr(r.leadRate)}</td>
                      <td>{r.qualified}</td>
                      <td>{pctFr(r.qualifiedRate)}</td>
                      <td>{r.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {f.otherLeads > 0 && <p className="ait-meta">+ {f.otherLeads} lead{f.otherLeads > 1 ? "s" : ""} d&apos;autres sources (publicité, direct, inconnue) — hors de cet entonnoir.</p>}
                </section>
              ) : null,
          },
          {
            key: "pages",
            label: "📄 Pages",
            body:
              f && f.rows.length ? (
                <section className="ait-score">
            <div className="ait-cols">
              <section>
                <h4 className="ait-method__h">Les pages qui convertissent</h4>
                {f.pages.length ? (
                  <ul className="ait-score__headlines">
                    {f.pages.slice(0, 8).map((p) => (
                      <li key={p.path}>
                        <strong>{p.path}</strong> — {p.leads} lead{p.leads > 1 ? "s" : ""}, {p.qualified} qualifié{p.qualified > 1 ? "s" : ""}
                        {p.sessions ? <span className="ait-score__rate"> · {p.sessions.toLocaleString("fr-FR")} visites</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ait-empty">Aucune page d&apos;arrivée connue pour les leads gratuits.</p>
                )}
              </section>
              <section>
                <h4 className="ait-method__h">Celles qui attirent sans convertir</h4>
                {f.attractWithoutConverting.length ? (
                  <ul className="ait-score__headlines">
                    {f.attractWithoutConverting.slice(0, 8).map((p) => (
                      <li key={p.path}>
                        <strong>{p.path}</strong> — {p.sessions.toLocaleString("fr-FR")} visites, aucun lead
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ait-empty">Aucune page avec 30 visites gratuites et zéro lead.</p>
                )}
              </section>
            </div>
                </section>
              ) : null,
          },
          ...extra,
        ]}
      />
    </div>
  );
}

/* ─── Guy, chargé de la concurrence ─────────────────────────────────────── */

export type CompetitionView = { rows: CompetitorRow[]; report: { at: string; summary: string; findings: CompetitionFinding[] } | null };
const COMPETITOR_KIND: Record<string, string> = { editeur: "Éditeur", comparateur: "Comparateur", media: "Média BTP" };
const HAS_IT: Record<string, string> = { oui: "TIM l'a", partiel: "TIM l'a en partie", non: "TIM ne l'a pas" };

function CompetitionPanel({ m, chief, view, extra = [] }: { m: MemberView; chief: MemberView | undefined; extra?: Pane[]; view: CompetitionView }) {
  const withoutSite = view.rows.filter((r) => !r.website).length;
  const read = view.rows.filter((r) => r.status === "lu");
  const moved = read.filter((r) => (r.added ?? 0) + (r.removed ?? 0) > 0).length;
  const findings = view.report?.findings ?? [];
  const missing = findings.filter((x) => x.timHasIt === "non").length;
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> {m.name} lit chaque semaine les sites des concurrents et remet à {chief.name} ce qui a bougé et ce que TIM n&apos;a pas — pour faire mieux, jamais pour recopier.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      {m.active && <CompetitionButton name={m.name} />}
      <Kpis
        items={[
          { label: "📚 Concurrents suivis", value: view.rows.length, sub: withoutSite ? `${withoutSite} sans site : illisible${withoutSite > 1 ? "s" : ""}` : `${read.length} lu${read.length > 1 ? "s" : ""} cette semaine`, alert: withoutSite > 0 },
          { label: "🔄 Ont bougé", value: moved, sub: "pages ajoutées ou retirées cette semaine" },
          { label: "🧭 Pistes", value: findings.length, sub: view.report ? `rapport du ${shortDate(view.report.at)}` : "pas encore de rapport" },
          { label: "🚫 Ce que TIM n'a pas", value: missing, sub: "vu chez un concurrent", alert: missing > 0 },
        ]}
      />
      <Panes
        panes={[
          {
            key: "rapport",
            label: "🔭 Son rapport",
            badge: findings.length,
            body: view.report ? (
              <section className="ait-score">
                <p className="ait-obj__text">{view.report.summary}</p>
            <ol className="ait-objs">
              {view.report.findings.map((x, i) => (
                <li key={i} className="ait-obj">
                  <div className="ait-obj__top">
                    <span className="ait-obj__rank">{i + 1}</span>
                    <div className="ait-obj__head">
                      <strong className="ait-obj__title">
                        {x.competitor} — {x.what}
                      </strong>
                      <span className="ait-obj__meta">
                        {IMPACT_LABEL[x.impact]} · {x.intent === "achat" ? "intention d'achat" : "information"} · {HAS_IT[x.timHasIt]}
                      </span>
                      {x.url && <span className="ait-obj__page">{x.url}</span>}
                    </div>
                  </div>
                  <p className="ait-obj__text">➡️ {x.action}</p>
                  {x.prompt && <CopyPromptButton prompt={x.prompt} />}
                </li>
              ))}
            </ol>
              </section>
            ) : (
              <p className="ait-empty">Pas encore de rapport : le premier arrive lundi matin, ou maintenant avec le bouton.</p>
            ),
          },
          {
            key: "concurrents",
            label: "📚 Concurrents suivis",
            badge: withoutSite,
            body: (
              <section className="ait-score">
        {withoutSite > 0 && <p className="ait-paused">{withoutSite} concurrent{withoutSite > 1 ? "s" : ""} sans site : {m.name} ne peut pas les lire. Renseignez leur site dans la liste.</p>}
        <div className="ait-score__scroll">
          <table className="ait-table">
            <thead>
              <tr>
                <th>Concurrent</th>
                <th>Type</th>
                <th>Pages</th>
                <th>Cette semaine</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.website ? <span className="ait-score__rate"> · {r.website.replace(/^https?:\/\/(www\.)?/, "")}</span> : <span className="ait-score__rate"> · pas de site</span>}
                  </td>
                  <td>{COMPETITOR_KIND[r.kind ?? ""] ?? "—"}</td>
                  <td>{r.status === "lu" ? (r.pages ?? 0).toLocaleString("fr-FR") : r.status === "illisible" ? "illisible" : "—"}</td>
                  <td>{r.status !== "lu" ? (r.error ? <span className="ait-score__rate">{r.error}</span> : "pas encore lu") : r.added == null ? "première photo" : r.added || r.removed ? `+${r.added} / −${r.removed ?? 0}` : "rien de neuf"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ait-meta">
          <Link href="/admin/collections/ad-competitors" prefetch={false} className="ait-obj__link">
            Ajouter ou corriger un concurrent (site, usage, type)
          </Link>
        </p>
              </section>
            ),
          },
          ...extra,
        ]}
      />
    </div>
  );
}

/* ─── Paige, stratège de contenu ────────────────────────────────────────── */

export type ContentView = { plan: { at: string; summary: string; findings: ContentItem[] } | null };
const CONTENT_TYPE: Record<string, string> = { creer: "✨ Créer", rafraichir: "🔄 Rafraîchir", fusionner: "🔗 Fusionner", supprimer: "🗑️ Supprimer" };
const SOURCE_LABEL: Record<string, string> = { guy: "vu par Guy", ana: "vu par Ana", "search-console": "Search Console" };

function ContentPanel({ m, chief, view, extra = [] }: { m: MemberView; chief: MemberView | undefined; extra?: Pane[]; view: ContentView }) {
  const items = view.plan?.findings ?? [];
  const total = items.reduce((n, x) => n + x.minutes, 0);
  const count = (t: string) => items.filter((x) => x.type === t).length;
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> {m.name} prépare le plan de contenu de la semaine et le remet à {chief.name}. Elle ne rédige pas : chaque action vient avec sa structure et un prompt prêt.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      {m.active && <ContentPlanButton name={m.name} />}
      <Kpis
        items={[
          { label: "📝 Actions du plan", value: items.length, sub: view.plan ? `plan du ${shortDate(view.plan.at)}` : "pas encore de plan" },
          { label: "⏱️ Effort total", value: `${Math.round((total / 60) * 10) / 10} h`, sub: `${chief?.name ?? "Son chef"} en retient ce qui tient dans votre semaine` },
          { label: "✨ À créer", value: count("creer"), sub: `${count("rafraichir")} à rafraîchir` },
          { label: "🔴 Impact fort", value: items.filter((x) => x.impact === "fort").length, sub: "à faire en premier" },
        ]}
      />
      <Panes
        panes={[
          {
            key: "plan",
            label: "📝 Son plan",
            badge: items.length,
            body: view.plan ? (
              <section className="ait-score">
                <p className="ait-obj__text">{view.plan.summary}</p>
                  <ol className="ait-objs">
                    {view.plan.findings.map((x, i) => (
                      <li key={i} className="ait-obj">
                        <div className="ait-obj__top">
                          <span className="ait-obj__rank">{i + 1}</span>
                          <div className="ait-obj__head">
                            <strong className="ait-obj__title">
                              {CONTENT_TYPE[x.type]} — {x.title}
                            </strong>
                            <span className="ait-obj__meta">
                              {IMPACT_LABEL[x.impact]} · {x.intent === "achat" ? "intention d'achat" : "information"} · {x.minutes} min{x.source ? ` · ${SOURCE_LABEL[x.source] ?? x.source}` : ""}
                            </span>
                            {x.query && <span className="ait-obj__page">🔎 « {x.query} »{x.page ? ` · ${x.page}` : ""}</span>}
                          </div>
                        </div>
                        {x.why && <p className="ait-obj__text">💡 {x.why}</p>}
                        {x.outline.length > 0 && (
                          <details className="ait-obj__more">
                            <summary>La structure proposée ({x.outline.length} intertitres)</summary>
                            <ol className="ait-method__sources">
                              {x.outline.map((h) => (
                                <li key={h}>{h}</li>
                              ))}
                            </ol>
                          </details>
                        )}
                        <CopyPromptButton prompt={x.prompt} />
                      </li>
                    ))}
                  </ol>
              </section>
            ) : (
              <p className="ait-empty">Pas encore de plan : le premier arrive lundi matin, ou maintenant avec le bouton.</p>
            ),
          },
          ...extra,
        ]}
      />
    </div>
  );
}

/* ─── Georges, visibilité IA ────────────────────────────────────────────── */

const ACTION_TYPE: Record<string, string> = { page: "📄 Page", source: "🌐 Source tierce", technique: "⚙️ Technique", marque: "🏷️ Marque" };
const rank = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR")}ᵉ`);

function VisibilityPanel({ m, chief, view, extra = [] }: { m: MemberView; chief: MemberView | undefined; extra?: Pane[]; view: VisibilityState }) {
  const v = view.measure;
  const month = new Date(`${view.period}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const left = view.progress.total - view.progress.done;
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> {m.name} pose chaque mois {view.questions} questions d&apos;acheteur aux IA, deux fois chacune, et remet à {chief.name} où TIM est recommandé, où il se perd, et quoi faire.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      {m.active && view.engines.length > 0 && <VisibilityButton name={m.name} />}
      <p className="ait-meta">
        {month}{left > 0 ? ` · mesure en cours : ${view.progress.done} / ${view.progress.total}` : ""} · IA interrogées : {view.engines.length ? view.engines.join(", ") : "aucune"}
        {view.missing.length ? ` · à brancher (Paramètres › Connexions) : ${view.missing.join(", ")}` : ""} · Google AI Overviews n&apos;est pas mesurable sans outil payant.
      </p>
      {v.answers ? (
        <Kpis
          items={[
            { label: "🗣️ TIM nommé", value: pctFr(v.overall.mentionPct), sub: `dans ${v.answers} réponses d'IA` },
            { label: "🔗 TIM cité en source", value: pctFr(v.overall.citationPct), sub: "lien vers le site" },
            { label: "📣 Part de voix", value: pctFr(v.overall.shareOfVoicePct), sub: "face aux concurrents nommés" },
            { label: "🥊 Questions perdues", value: v.lost.length, sub: "des concurrents recommandés, pas TIM", alert: v.lost.length > 0 },
          ]}
        />
      ) : (
        <p className="ait-empty">{view.engines.length ? "La mesure du mois commence : les premières réponses arrivent dans quelques minutes, ou maintenant avec le bouton." : "Aucune IA branchée pour l'instant."}</p>
      )}
      <Panes
        panes={[
          {
            key: "rapport",
            label: "🧭 Ses actions",
            badge: view.report?.findings.length,
            body: view.report ? (
              <section className="ait-score">
                <p className="ait-meta">Rapport du {shortDate(view.report.at)}</p>
                <p className="ait-obj__text">{view.report.summary}</p>
            <ol className="ait-objs">
              {view.report.findings.map((x, i) => (
                <li key={i} className="ait-obj">
                  <div className="ait-obj__top">
                    <span className="ait-obj__rank">{i + 1}</span>
                    <div className="ait-obj__head">
                      <strong className="ait-obj__title">
                        {ACTION_TYPE[x.type]} — {x.title}
                      </strong>
                      <span className="ait-obj__meta">
                        {IMPACT_LABEL[x.impact]} · {x.minutes} min
                      </span>
                      {x.target && <span className="ait-obj__page">🎯 {x.target}</span>}
                    </div>
                  </div>
                  {x.why && <p className="ait-obj__text">💡 {x.why}</p>}
                  {x.questions.length > 0 && <p className="ait-meta">Questions : {x.questions.map((q) => `« ${q} »`).join(" · ")}</p>}
                  <CopyPromptButton prompt={x.prompt} />
                </li>
              ))}
            </ol>
              </section>
            ) : (
              <p className="ait-empty">Pas encore de rapport : il s&apos;écrit dès que la mesure du mois est complète.</p>
            ),
          },
          {
            key: "ia",
            label: "✨ Par IA et par thème",
            body: v.answers ? (
              <section className="ait-score">
                <p className="ait-chips">
                  <span>🏅 Rang moyen de TIM : {rank(v.overall.avgPosition)}</span>
                </p>
            <div className="ait-score__scroll">
              <table className="ait-table">
                <thead>
                  <tr>
                    <th>IA / thème</th>
                    <th>Réponses</th>
                    <th>TIM nommé</th>
                    <th>TIM cité</th>
                    <th>Part de voix</th>
                    <th>Rang moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {[...v.engines.map((e) => ({ key: e.engine, label: e.label, r: e as Rates })), ...v.themes.map((t) => ({ key: t.theme, label: `↳ ${t.label}`, r: t as Rates }))].map(({ key, label, r }) => (
                    <tr key={key}>
                      <td>
                        <strong>{label}</strong>
                      </td>
                      <td>{r.answers}</td>
                      <td>{pctFr(r.mentionPct)}</td>
                      <td>{pctFr(r.citationPct)}</td>
                      <td>{pctFr(r.shareOfVoicePct)}</td>
                      <td>{rank(r.avgPosition)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ait-meta">Une IA ne répond jamais deux fois pareil : ce sont des tendances, à lire d&apos;un mois sur l&apos;autre.</p>
              </section>
            ) : null,
          },
          {
            key: "concurrents",
            label: "🥊 Concurrents et sources",
            // Les concurrents nommés, et les sites où les IA vont chercher.
            body: v.answers ? <section className="ait-score">
            <div className="ait-cols">
              <section>
                <h4 className="ait-method__h">Les concurrents nommés</h4>
                {v.competitors.length ? (
                  <ul className="ait-score__headlines">
                    {v.competitors.slice(0, 10).map((c) => (
                      <li key={c.name}>
                        <strong>{c.name}</strong> — {pctFr(c.mentionPct)} des réponses
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ait-empty">Aucun concurrent de la liste n&apos;est nommé.</p>
                )}
              </section>
              <section>
                <h4 className="ait-method__h">Où les IA vont chercher</h4>
                {v.sources.length ? (
                  <ul className="ait-score__headlines">
                    {v.sources.slice(0, 10).map((s) => (
                      <li key={s.host}>
                        <strong>{s.host}</strong> — {s.count} réponse{s.count > 1 ? "s" : ""}
                        {s.tim ? <span className="ait-score__rate"> · TIM</span> : s.competitor ? <span className="ait-score__rate"> · {s.competitor}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ait-empty">Pas encore de sources.</p>
                )}
              </section>
            </div>
              </section> : null,
          },
          {
            key: "perdues",
            label: "❓ Questions perdues",
            badge: v.lost.length,
            body: v.lost.length ? (
              <section className="ait-score">
                <ul className="ait-score__headlines">
                  {v.lost.map((l) => (
                    <li key={l.id}>
                      « {l.question} » — {l.competitors.join(", ")}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          },
          ...extra,
        ]}
      />
    </div>
  );
}

/* ─── Robert, technique ─────────────────────────────────────────────────── */

type TechView = Awaited<ReturnType<typeof latestTech>>;

function TechPanel({ m, chief, view, extra = [] }: { m: MemberView; chief: MemberView | undefined; extra?: Pane[]; view: TechView }) {
  const h = view?.health ?? null;
  const blocked = h ? h.bots.filter((b) => !b.allowed).length : 0;
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> {m.name} contrôle chaque mois toutes les pages du site et remet à {chief.name} ce qui empêche Google et les IA de les lire. Chaque tâche vient avec ses étapes et un prompt prêt pour votre outil de code.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      {m.active && <TechButton name={m.name} />}
      {h ? (
        <Kpis
          items={[
            { label: "📄 Pages lues", value: `${h.read} / ${h.sitemapCount}`, sub: `contrôle du ${shortDate(view!.at)}` },
            { label: "🔎 Indexées par Google", value: h.indexed == null ? "—" : `${h.indexed} / ${h.inspected}`, sub: h.indexed == null ? "indexation non lue" : "pages vérifiées" },
            { label: "⏱️ Temps de réponse", value: h.avgMs == null ? "—" : `${(h.avgMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`, sub: "en moyenne" },
            { label: "⚠️ Problèmes relevés", value: h.issues.length, sub: blocked ? `${blocked} robot(s) bloqué(s)` : "tous les robots passent", alert: h.issues.some((x) => x.impact === "fort") || blocked > 0 },
          ]}
        />
      ) : (
        <p className="ait-empty">Pas encore de contrôle : le premier arrive le premier jour ouvré du mois, ou maintenant avec le bouton.</p>
      )}
      <Panes
        panes={[
          {
            key: "taches",
            label: "🛠️ Ses tâches",
            badge: view?.findings.length,
            body: view ? (
              <section className="ait-score">
                <p className="ait-obj__text">{view.summary}</p>
          <ol className="ait-objs">
            {view.findings.map((t, i) => (
              <li key={i} className="ait-obj">
                <div className="ait-obj__top">
                  <span className="ait-obj__rank">{i + 1}</span>
                  <div className="ait-obj__head">
                    <strong className="ait-obj__title">{t.title}</strong>
                    <span className="ait-obj__meta">
                      {IMPACT_LABEL[t.impact]} · {t.minutes} min
                    </span>
                  </div>
                </div>
                {t.why && <p className="ait-obj__text">💡 {t.why}</p>}
                {t.steps.length > 0 && (
                  <ol className="ait-method__sources">
                    {t.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                )}
                {t.pages.length > 0 && (
                  <details className="ait-obj__more">
                    <summary>Les pages concernées ({t.pages.length})</summary>
                    <ul className="ait-method__sources">
                      {t.pages.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <CopyPromptButton prompt={t.prompt} />
              </li>
            ))}
          </ol>
              </section>
            ) : null,
          },
          {
            key: "problemes",
            label: "🔧 Problèmes",
            badge: h?.issues.length,
            body: h ? (
              <section className="ait-score">
            {h.issues.length ? (
              <ul className="ait-score__headlines">
                {h.issues.map((i) => (
                  <li key={i.code}>
                    <details>
                      <summary>
                        {IMPACT_LABEL[i.impact]} · <strong>{i.label}</strong> — {i.count}
                      </summary>
                      <ul className="ait-method__sources">
                        {i.pages.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                        {i.count > i.pages.length && <li>… et {i.count - i.pages.length} autre(s)</li>}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ait-empty">Aucun problème relevé.</p>
            )}
              </section>
            ) : null,
          },
          {
            key: "robots",
            label: "🤖 Robots",
            badge: blocked,
            body: h ? (
              <section className="ait-score">
                <p className="ait-meta">Les robots des moteurs et des IA : {h.bots.filter((b) => b.allowed).length} / {h.bots.length} autorisés.</p>
              <ul className="ait-method__sources">
                {h.bots.map((b) => (
                  <li key={b.token}>
                    {b.allowed ? "✅" : "⛔"} <strong>{b.token}</strong> — {b.who}
                    {b.role === "entrainement" ? " (entraînement : un choix)" : ""}
                  </li>
                ))}
              </ul>
              </section>
            ) : null,
          },
          ...extra,
        ]}
      />
    </div>
  );
}

/* ─── Linda, autorité ───────────────────────────────────────────────────── */

type AuthorityView = Awaited<ReturnType<typeof latestAuthority>>;
const TARGET_TYPE: Record<string, string> = { comparateur: "⚖️ Comparateur", annuaire: "📒 Annuaire", avis: "⭐ Avis", media: "📰 Média", forum: "💬 Forum", entite: "🪪 Fiche d'entité", partenaire: "🤝 Partenaire" };
const TARGET_STATE: Record<string, string> = { absent: "TIM absent", incomplet: "fiche incomplète", present: "TIM présent" };
const TONE: Record<string, string> = { positif: "🙂", neutre: "😐", negatif: "🙁" };

function AuthorityPanel({ m, chief, view, extra = [] }: { m: MemberView; chief: MemberView | undefined; extra?: Pane[]; view: AuthorityView }) {
  const absent = view ? view.findings.filter((t) => t.state === "absent").length : 0;
  const negative = view ? view.mentions.filter((x) => x.tone === "negatif").length : 0;
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> {m.name} cherche chaque mois où TIM est nommé sur le web, et où il manque, et remet à {chief.name} les cibles une à une. Jamais de faux avis ni de message déguisé.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      {m.active && <AuthorityButton name={m.name} />}
      {view ? (
        <>
          <Kpis
            items={[
              { label: "🎯 Cibles", value: view.findings.length, sub: `rapport du ${shortDate(view.at)}` },
              { label: "🚫 TIM absent", value: absent, sub: "sites où TIM devrait être", alert: absent > 0 },
              { label: "🗞️ Pages qui nomment TIM", value: view.mentions.length, sub: "trouvées sur le web" },
              { label: "🙁 Mentions négatives", value: negative, sub: negative ? "à lire en premier" : "aucune", alert: negative > 0 },
            ]}
          />
          <Panes
            panes={[
              {
                key: "cibles",
                label: "🔗 Ses cibles",
                badge: view.findings.length,
                body: (
                  <section className="ait-score">
                    <p className="ait-obj__text">{view.summary}</p>
            <ol className="ait-objs">
              {view.findings.map((t, i) => (
                <li key={i} className="ait-obj">
                  <div className="ait-obj__top">
                    <span className="ait-obj__rank">{i + 1}</span>
                    <div className="ait-obj__head">
                      <strong className="ait-obj__title">
                        {TARGET_TYPE[t.type]} — {t.site}
                      </strong>
                      <span className="ait-obj__meta">
                        {IMPACT_LABEL[t.impact]} · {TARGET_STATE[t.state]} · {t.minutes} min
                      </span>
                      {t.url && (
                        <a className="ait-obj__page" href={t.url} target="_blank" rel="noreferrer noopener">
                          {t.url}
                        </a>
                      )}
                    </div>
                  </div>
                  {t.why && <p className="ait-obj__text">💡 {t.why}</p>}
                  {t.steps.length > 0 && (
                    <ol className="ait-method__sources">
                      {t.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  )}
                  <CopyPromptButton prompt={t.prompt} />
                </li>
              ))}
            </ol>
                  </section>
                ),
              },
              {
                key: "mentions",
                label: "🗞️ Où TIM est nommé",
                badge: view.mentions.length,
                body: (
                  <section className="ait-score">
            {view.mentions.length ? (
              <ul className="ait-score__headlines">
                {view.mentions.map((x) => (
                  <li key={x.url}>
                    {TONE[x.tone]}{" "}
                    <a href={x.url} target="_blank" rel="noreferrer noopener">
                      {x.title || x.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ait-empty">Aucune page extérieure trouvée qui nomme TIM.</p>
            )}
                  </section>
                ),
              },
              ...extra,
            ]}
          />
        </>
      ) : (
        <>
          <p className="ait-empty">Pas encore de rapport : le premier arrive après la mesure de Georges, au plus tard le 7 du mois — ou maintenant avec le bouton.</p>
          <Panes panes={extra} />
        </>
      )}
    </div>
  );
}

/* ─── Cléo, réseaux & vidéo ─────────────────────────────────────────────── */

const SOCIAL_TYPE: Record<string, string> = { relance: "📣 Relance", contenu: "🎬 Contenu", format: "🧩 Format", rythme: "📅 Rythme", reglage: "🔧 Réglage" };
const NET_LABEL: Record<string, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", tous: "Tous réseaux" };
const nFr = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fr-FR"));

type SocialView = SocialState & { notice: string | null };

function SocialPanel({ m, chief, view, extra = [] }: { m: MemberView; chief: MemberView | undefined; extra?: Pane[]; view: SocialView }) {
  const r = view.report;
  const ms = r?.measure ?? null;
  const top = ms ? [...ms.posts].sort((a, b) => (b.views ?? b.likes) - (a.views ?? a.likes)).slice(0, 12) : [];
  const known = ms ? ms.people.filter((p) => p.match) : [];
  const others = ms ? ms.people.filter((p) => !p.match).slice(0, 15) : [];
  const sum = (f: (n: NonNullable<typeof ms>["networks"][number]) => number | null | undefined) => (ms ? ms.networks.reduce((t, n) => t + (f(n) ?? 0), 0) : 0);
  const views = sum((n) => n.views);
  const before = sum((n) => n.previousViews);
  const broken = view.accounts.filter((a) => a.status === "erreur").length;
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> {m.name} lit chaque semaine vos réseaux et vos vidéos, rapproche du CRM ceux qui commentent, et remet à {chief.name} les contenus à faire et les personnes à relancer. Elle ne publie rien.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      {m.active && <SocialButton name={m.name} />}
      {ms && (
        <Kpis
          items={[
            { label: "👥 Abonnés", value: nFr(sum((n) => n.followers)), sub: ms.networks.map((n) => NET_LABEL[n.network]).join(" · ") || "aucun réseau lu" },
            { label: "👀 Vues sur 28 jours", value: nFr(views), sub: before ? `avant : ${nFr(before)}` : "pas de période d'avant" },
            { label: "💬 Interactions", value: nFr(sum((n) => n.interactions)), sub: `${sum((n) => n.posts)} publication(s) sur la période` },
            { label: "⭐ Clients ou prospects qui réagissent", value: known.length, sub: known.length ? "déjà dans votre CRM : à relancer" : `${ms.people.length} commentaire(s) au total`, alert: known.length > 0 },
          ]}
        />
      )}
      <Panes
        panes={[
          {
            key: "actions",
            label: "🎬 Ses actions",
            badge: r?.findings.length,
            body: r ? (
              <section className="ait-score">
                <p className="ait-meta">Rapport du {shortDate(r.at)}</p>
                <p className="ait-obj__text">{r.summary}</p>
            <ol className="ait-objs">
              {r.findings.map((x, i) => (
                <li key={i} className="ait-obj">
                  <div className="ait-obj__top">
                    <span className="ait-obj__rank">{i + 1}</span>
                    <div className="ait-obj__head">
                      <strong className="ait-obj__title">
                        {SOCIAL_TYPE[x.type]} — {x.title}
                      </strong>
                      <span className="ait-obj__meta">
                        {NET_LABEL[x.network]} · {IMPACT_LABEL[x.impact]} · {x.minutes} min
                      </span>
                      {x.person && <span className="ait-obj__page">👤 {x.person}</span>}
                    </div>
                  </div>
                  {x.why && <p className="ait-obj__text">💡 {x.why}</p>}
                  {x.steps.length > 0 && (
                    <ol className="ait-method__sources">
                      {x.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  )}
                  <CopyPromptButton prompt={x.prompt} />
                </li>
              ))}
            </ol>
              </section>
            ) : (
              <p className="ait-empty">Pas encore de rapport : le premier arrive le prochain jour ouvré dès 5 h — ou maintenant avec le bouton.</p>
            ),
          },
          {
            key: "publications",
            label: "📊 Publications",
            body: ms ? (
              <section className="ait-score">
                {ms.networks.length ? (
                  <p className="ait-chips">
                    {ms.networks.map((n) => (
                      <span key={n.network}>
                        {NET_LABEL[n.network]} · {n.account} : {nFr(n.followers)} abonnés · {n.posts} publication{n.posts > 1 ? "s" : ""} · {nFr(n.views)} vues
                        {n.previousViews != null ? ` (avant : ${nFr(n.previousViews)})` : ""} · {nFr(n.interactions)} interactions
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="ait-empty">Aucun réseau branché lors de ce rapport : il s&apos;appuie sur l&apos;entonnoir et le web.</p>
                )}
                {ms.errors.length > 0 && <p className="ait-meta">⚠️ {ms.errors.join(" · ")}</p>}
                {top.length > 0 && (
                  <div className="ait-score__scroll">
                    <table className="ait-table">
                      <thead>
                        <tr>
                          <th>Publication</th>
                          <th>Vues</th>
                          <th>Réactions</th>
                          <th>Commentaires</th>
                          <th>Partages</th>
                          <th>Vu en moyenne</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((p) => (
                          <tr key={`${p.network}-${p.id}`}>
                            <td>
                              {NET_LABEL[p.network]} · {p.format} —{" "}
                              {p.url ? (
                                <a href={p.url} target="_blank" rel="noreferrer noopener">
                                  {p.title}
                                </a>
                              ) : (
                                p.title
                              )}
                            </td>
                            <td>{nFr(p.views)}</td>
                            <td>{nFr(p.likes)}</td>
                            <td>{nFr(p.comments)}</td>
                            <td>{nFr(p.shares)}</td>
                            <td>{p.avgViewPct != null ? `${p.avgViewPct} %` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(ms.youtubeSources.length > 0 || ms.youtubeSearches.length > 0) && (
                  <div className="ait-cols">
                    <section>
                      <h4 className="ait-method__h">D&apos;où viennent les vues YouTube</h4>
                      <ul className="ait-score__headlines">
                        {ms.youtubeSources.slice(0, 8).map((s) => (
                          <li key={s.source}>
                            <strong>{s.source}</strong> — {nFr(s.views)} vues
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4 className="ait-method__h">Ce qu&apos;on tape dans YouTube pour vous trouver</h4>
                      {ms.youtubeSearches.length ? (
                        <ul className="ait-score__headlines">
                          {ms.youtubeSearches.slice(0, 10).map((s) => (
                            <li key={s.term}>
                              « {s.term} » — {nFr(s.views)} vues
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="ait-empty">Pas encore de recherche mesurée.</p>
                      )}
                    </section>
                  </div>
                )}
              </section>
            ) : null,
          },
          {
            key: "personnes",
            label: "👥 Qui réagit",
            badge: known.length,
            body: ms ? (
              <section className="ait-score">
                <p className="ait-meta">Les réseaux ne disent pas qui regarde : seulement qui commente. Ceux qui sont déjà dans votre CRM d&apos;abord.</p>
                {known.length > 0 && (
                  <ul className="ait-score__headlines">
                    {known.map((p, i) => (
                      <li key={`k${i}`}>
                        ⭐ <strong>{p.name}</strong> ({NET_LABEL[p.network]}) — {p.match!.company}
                        {p.match!.status ? ` · ${p.match!.status}` : ""} : « {p.text} »{" "}
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noreferrer noopener">
                            voir
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {others.length > 0 ? (
                  <details className="ait-obj__more">
                    <summary>Les autres commentaires ({ms.people.length - known.length})</summary>
                    <ul className="ait-score__headlines">
                      {others.map((p, i) => (
                        <li key={`o${i}`}>
                          <strong>{p.name}</strong> ({NET_LABEL[p.network]}) : « {p.text} »
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  known.length === 0 && <p className="ait-empty">Aucun commentaire sur la période.</p>
                )}
              </section>
            ) : null,
          },
          { key: "comptes", label: "🔌 Comptes", badge: broken, body: <SocialConnect accounts={view.accounts} youtubeReady={view.youtubeReady} notice={view.notice} /> },
          ...extra,
        ]}
        initial={view.notice ? "comptes" : undefined}
      />
    </div>
  );
}

/* ─── Fiches ────────────────────────────────────────────────────────────── */

/** L'en-tête de la fiche — figé en haut du panneau ; `note` : la phrase qui dit comment il travaille. */
/** Une fiche ouverte porte, pour un sous-agent, les consignes que son chef lui a données (carnet du chef). */
type WithConsignes = MemberView & { consignes?: NoteRow[]; consignesFrom?: string };

function Head({ m, note }: { m: WithConsignes; note?: React.ReactNode }) {
  return (
    <header className="ait-panel__head">
      <Face m={m} size={64} />
      <div className="ait-panel__who">
        <h2 className="ait-panel__title">
          {m.name} <span>· {m.jobTitle}</span>
        </h2>
        <p className="ait-chips">
          <span>🎯 {m.monthMissions} mission{m.monthMissions > 1 ? "s" : ""} ce mois</span>
          <span>💶 {eur(m.monthCostEur)} d&apos;IA</span>
          {m.lastAt && <span>🕒 vu {ago(m.lastAt, new Date())}</span>}
        </p>
      </div>
      <Detail label="Son rôle">
        <p className="ait-text">{m.specialty}</p>
      </Detail>
      {note ? <div className="ait-panel__note">{note}</div> : null}
      {m.consignes && m.consignes.length > 0 && (
        <div className="ait-consignes">
          <strong>📣 Consignes reçues de {m.consignesFrom ?? "son chef"}</strong>
          <ul>
            {m.consignes.map((c) => (
              <li key={c.id}>
                {c.text}
                <span className="ait-consignes__meta">
                  {" "}
                  · depuis le {dayFr(c.createdAt)}
                  {c.reason ? ` · ${c.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}

/** Une nouvelle de la cheffe à la direction : un passage, en une phrase. */
function RunMessage({ r, chief, now }: { r: RunView; chief: MemberView; now: Date }) {
  return (
    <li className="ait-msg">
      <Face m={chief} size={34} />
      <div className="ait-bubble">
        <div className="ait-bubble__top">
          <strong>
            {RUN_ICONS[r.kindKey] ?? "💬"} {chief.name} {RUN_VERBS[r.kindKey] ?? r.kind.toLowerCase()}
          </strong>
          <span className="ait-bubble__when">{ago(r.at, now)}</span>
        </div>
        <span className="ait-bubble__tag">
          {r.campaign} · {STATUS_PHRASES[r.status] ?? r.status}
        </span>
        <p className="ait-bubble__text">{r.headline ?? "Pas de bilan écrit."}</p>
        {r.summary && r.summary !== r.headline && (
          <Detail>
            <p className="ait-text">{r.summary}</p>
            <p className="ait-meta">Coût IA du passage : {eur(r.costEur)}</p>
          </Detail>
        )}
      </div>
    </li>
  );
}

/** Un échange cheffe → sous-agent : la mission reçue, ce qu'il a rendu. */
function MissionThread({ x, m, chief, now }: { x: MissionView; m: MemberView; chief: MemberView | undefined; now: Date }) {
  return (
    <li className="ait-thread">
      <div className="ait-thread__meta">
        <span>📣 {x.campaign}</span>
        <span>{ago(x.at, now)}</span>
        <span className={`ait-thread__status ait-thread__status--${x.status}`}>{STATUS_PHRASES[x.status] ?? x.status}</span>
      </div>
      <div className="ait-msg">
        {chief && <Face m={chief} size={30} />}
        <div className="ait-bubble">
          <strong className="ait-bubble__from">{chief?.name ?? "Sa cheffe"}</strong>
          <p className="ait-bubble__text">
            {m.name}, {lcFirst(x.ask)}
          </p>
        </div>
      </div>
      {x.answer && (
        <div className="ait-msg ait-msg--reply">
          <div className={`ait-bubble ait-bubble--reply${x.error ? " ait-bubble--error" : ""}`}>
            <strong className="ait-bubble__from">{m.name}</strong>
            <p className="ait-bubble__text">{x.answer}</p>
          </div>
          <Face m={m} size={30} />
        </div>
      )}
      <Detail>
        <p className="ait-meta">La mission complète</p>
        <p className="ait-text">{x.mission}</p>
        {(x.result || x.error) && (
          <>
            <p className="ait-meta">{x.error ? "Ce qui a bloqué" : `Ce que ${m.name} a rendu`}</p>
            <p className="ait-text">{x.error ?? x.result}</p>
          </>
        )}
        <p className="ait-meta">
          Budget confié : {eur(x.budgetEur)} · dépensé : {eur3(x.costEur)}
        </p>
      </Detail>
    </li>
  );
}

function More({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link href={href} prefetch={false} className="ait-more-link">
      {label} ({count}) →
    </Link>
  );
}

function PausedNote({ m, chief }: { m: MemberView; chief?: MemberView }) {
  if (m.state === "bientot") {
    return <p className="ait-paused">🚧 Le travail de {m.name} n&apos;est pas encore branché : il arrive aux prochaines étapes (fiche chiffrée multi-canal, puis connecteurs).</p>;
  }
  if (m.active) return null;
  const what = m.engineRoles.includes("orchestrateur")
    ? "aucune préparation de campagne ne démarre"
    : m.engineRoles.includes("analyste")
      ? "aucun suivi des campagnes en ligne ne démarre"
      : `${chief?.name ?? "sa cheffe"} ne peut plus lui confier de mission`;
  return (
    <p className="ait-paused">
      ⏸️ {m.name} est en pause : {what}. Rebasculez la case de sa carte pour remettre cet agent en service.
    </p>
  );
}

/**
 * Ses campagnes : une pastille par campagne ; au clic, le panneau de pilotage
 * qui vivait dans l'onglet « Agent » de la campagne (lancer une préparation,
 * salle de contrôle, suivi, question) — déplacé ici le 12/11/2026.
 */
function Campaigns({ m, campaigns, open }: { m: MemberView; campaigns: CampaignChip[]; open: string | null }) {
  const current = campaigns.find((c) => String(c.id) === open) ?? null;
  return (
    <section className="ait-campaigns">
      <h3 className="ait-h3">Ses campagnes</h3>
      {campaigns.length ? (
        <ul className="ait-campaigns__list">
          {campaigns.map((c) => {
            const on = current?.id === c.id;
            return (
              <li key={String(c.id)}>
                <Link href={on ? `${BASE}?membre=${m.key}` : `${BASE}?membre=${m.key}&campagne=${c.id}`} prefetch={false} className={`ait-campaign${on ? " ait-campaign--on" : ""}`} aria-current={on ? "true" : undefined}>
                  <strong>{c.name}</strong>
                  <span>{campaignPhase(c)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ait-empty">Aucune campagne pour l&apos;instant : créez-en une dans Publicité.</p>
      )}
      {current && (
        <div className="ait-campaign__panel">
          <div className="ait-campaign__head">
            <strong>{current.name}</strong>
            <Link href={`/admin/collections/ad-campaigns/${current.id}`} prefetch={false}>
              Ouvrir la fiche de la campagne →
            </Link>
          </div>
          {m.active ? <AgentPanel campaignId={current.id} /> : <p className="ait-paused">⏸️ {m.name} est en pause : remettez cet agent en service pour lancer ou suivre cette campagne.</p>}
        </div>
      )}
    </section>
  );
}

/* ─── Le carnet d'un chef ───────────────────────────────────────────────── */

const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
const IDEA_BADGE: Record<string, string> = { retenue: "✅ retenue", "a-tester": "🧪 à tester", ecartee: "❌ écartée", imposee: "🫡 appliquée à votre demande" };
const NOTE_GROUPS: { kind: NoteRow["kind"]; title: string; empty: string }[] = [
  { kind: "consigne", title: "📣 Ses consignes à l'équipe", empty: "Aucune consigne en cours." },
  { kind: "decision", title: "🏛️ Ses décisions", empty: "Aucune décision notée." },
  { kind: "idee", title: "💬 Vos idées, et son verdict", empty: "Aucune idée de votre part notée." },
  { kind: "conviction", title: "💡 Ses convictions", empty: "Aucune conviction notée." },
  { kind: "suivi", title: "📌 À suivre", empty: "Rien à suivre." },
];

function NoteItem({ n, names }: { n: NoteRow; names: Map<string, string> }) {
  const closed = n.status !== "active";
  return (
    <li className={`ait-note${closed ? " ait-note--closed" : ""}`}>
      <div className="ait-note__top">
        <span className="ait-note__text">
          {n.kind === "consigne" && n.target ? <strong>{names.get(n.target) ?? "?"} · </strong> : null}
          {n.text}
        </span>
        <span className="ait-note__badges">
          {n.verdict && <span className={`ait-note__badge ait-note__badge--${n.verdict}`}>{IDEA_BADGE[n.verdict]}</span>}
          {closed && <span className="ait-note__badge">{n.status === "terminee" ? "terminée" : "abandonnée"}</span>}
        </span>
      </div>
      {n.reason && <p className="ait-note__why">{n.reason}</p>}
      {n.disagreement && <p className="ait-note__why">⚠️ Son désaccord : {n.disagreement}</p>}
      <p className="ait-note__meta">
        {n.kind === "suivi" && n.dueAt ? `à revoir le ${dayFr(n.dueAt)} · ` : ""}noté le {dayFr(n.createdAt)}
        {n.updatedAt.slice(0, 10) !== n.createdAt.slice(0, 10) ? ` · revu le ${dayFr(n.updatedAt)}` : ""} ·{" "}
        <Link href={`/admin/collections/ai-team-notes/${n.id}`} prefetch={false}>
          corriger
        </Link>
      </p>
      {n.history.length > 1 && (
        <Detail label={`Son histoire (${n.history.length})`}>
          <ol className="ait-note__history">
            {n.history.map((h, i) => (
              <li key={i}>
                <span className="ait-note__meta">{h.at ? dayFr(h.at) : ""}</span> {h.change}
              </li>
            ))}
          </ol>
        </Detail>
      )}
    </li>
  );
}

/** Ce que le chef retient : ses consignes, décisions, vos idées et son verdict, convictions, points à suivre — et ce qui est clos. */
function CarnetView({ m, notes, members }: { m: MemberView; notes: NoteRow[]; members: MemberView[] }) {
  const names = new Map(members.map((x) => [String(x.id), x.name]));
  const open = notes.filter((n) => n.status === "active" || (n.kind === "idee" && n.verdict === "ecartee"));
  const closed = notes.filter((n) => !open.includes(n));
  if (!notes.length) {
    return <p className="ait-empty">Le carnet de {m.name} est vide : il se remplit au fil de vos échanges et de ses revues — vos idées, ses décisions, ses consignes à l&apos;équipe, ce que les chiffres lui apprennent.</p>;
  }
  return (
    <section className="ait-carnet">
      <p className="ait-meta">Ce que {m.name} retient d&apos;un échange à l&apos;autre. Vos idées, {m.name} les juge — et peut dire non ; ses décisions évoluent avec les chiffres.</p>
      {NOTE_GROUPS.map((g) => {
        const rows = open.filter((n) => n.kind === g.kind);
        if (!rows.length) return null;
        return (
          <div key={g.kind} className="ait-carnet__group">
            <h4 className="ait-method__h">{g.title}</h4>
            <ul className="ait-notes">
              {rows.map((n) => (
                <NoteItem key={n.id} n={n} names={names} />
              ))}
            </ul>
          </div>
        );
      })}
      {closed.length > 0 && (
        <Detail label={`Clos depuis 60 jours (${closed.length})`}>
          <ul className="ait-notes">
            {closed.map((n) => (
              <NoteItem key={n.id} n={n} names={names} />
            ))}
          </ul>
        </Detail>
      )}
    </section>
  );
}

/**
 * La fiche d'un chef, à lire en quelques coups d'œil (14/11/2026) : quatre chiffres en haut (budget, meilleur
 * canal, maîtrise, ce qui vous attend), ce qu'il faut décider, la conversation — et le détail rangé en onglets.
 */
function ChiefKpis({ m, team, spend, scorecard, mastery, openRecos }: { m: MemberView; team: TeamView; spend: TeamSpend; scorecard: Scorecard | null; mastery: MemberMastery | undefined; openRecos: number }) {
  const budgetPct = spend.budgetEur ? Math.min(100, Math.round((spend.teamMonthEur / spend.budgetEur) * 100)) : null;
  const best = scorecard?.rows.find((r) => r.key === scorecard.best);
  const delta = mastery ? deltaOf(mastery) : null;
  const waiting = team.pendingValidations + openRecos;
  return (
    <ul className="ait-kpis">
      <li className="ait-kpi">
        <span className="ait-kpi__label">💶 Budget IA du mois</span>
        <strong className="ait-kpi__value">{eur(spend.teamMonthEur)}</strong>
        <span className="ait-kpi__sub">{budgetPct != null ? `${budgetPct} % de ${eur(spend.budgetEur!)}` : "pas de budget fixé"}</span>
        {budgetPct != null && (
          <span className={`ait-kpi__gauge${budgetPct >= 80 ? " ait-kpi__gauge--high" : ""}`} aria-hidden>
            <span style={{ width: `${budgetPct}%` }} />
          </span>
        )}
      </li>
      <li className="ait-kpi">
        <span className="ait-kpi__label">🏆 Meilleur canal</span>
        <strong className="ait-kpi__value">{best ? best.label : "—"}</strong>
        <span className="ait-kpi__sub">{best?.now.costPerQualified != null ? `${eur0(best.now.costPerQualified)} le lead qualifié` : "pas encore assez de chiffres"}</span>
      </li>
      <li className="ait-kpi">
        <span className="ait-kpi__label">🎓 Maîtrise</span>
        <strong className="ait-kpi__value">
          {mastery ? mastery.mastery.score : "—"}
          <small>/100</small>
        </strong>
        <span className="ait-kpi__sub">{delta == null ? "courbe après deux lundis" : delta === 0 ? "stable depuis lundi" : `${delta > 0 ? "▲ +" : "▼ "}${delta} depuis lundi`}</span>
      </li>
      <li className={`ait-kpi${waiting ? " ait-kpi--alert" : ""}`}>
        <span className="ait-kpi__label">🙋 Vous attend</span>
        <strong className="ait-kpi__value">{waiting}</strong>
        <span className="ait-kpi__sub">
          {waiting ? [team.pendingValidations ? `${team.pendingValidations} créa${team.pendingValidations > 1 ? "s" : ""} à valider` : null, openRecos ? `${openRecos} reco${openRecos > 1 ? "s" : ""} à trancher` : null].filter(Boolean).join(" · ") : `rien à décider · ${m.monthMissions} mission${m.monthMissions > 1 ? "s" : ""} ce mois`}
        </span>
      </li>
    </ul>
  );
}

function ChiefPanel({ m, team, all, campaigns, campaign, chat, spend, scorecard, method, recos, mastery, notes }: { m: MemberView; team: TeamView; all: boolean; campaigns: CampaignChip[]; campaign: string | null; chat: ChatMessage[]; spend: TeamSpend; scorecard: Scorecard | null; method: MethodState | null; recos: RecoView[]; mastery: TeamMastery; notes: NoteRow[] }) {
  const now = new Date();
  const byKey = new Map(team.members.map((x) => [x.key, x]));
  const runs = all ? m.runs : m.runs.slice(0, SHORT);
  const feed = team.feed.slice(0, all ? 30 : 8);
  const openRecos = recos.filter((r) => r.status === "ouverte").length;
  const isSea = m.key === "chef-sea";
  const tabs: FicheTab[] = [
    { key: "nouvelles", label: "📰 Nouvelles" },
    { key: "carnet", label: "🧠 Carnet", badge: notes.filter((n) => n.kind === "consigne" && n.status === "active").length || undefined },
    ...(scorecard ? [{ key: "canaux", label: "📊 Canaux" }] : []),
    { key: "campagnes", label: "📣 Campagnes", badge: campaigns.length || undefined },
    ...(isSea ? [{ key: "recos", label: "📏 Recommandations", badge: openRecos || undefined }] : []),
    ...(VEILLE_DOMAINS[m.key] ? [{ key: "methode", label: "📘 Méthode" }] : []),
    ...(mastery[m.key] ? [{ key: "maitrise", label: "🎓 Maîtrise" }] : []),
    { key: "budget", label: "💶 Budget" },
  ];
  const panes: Record<string, React.ReactNode> = {
    nouvelles: (
      <div className="ait-cols">
        <section>
          <h3 className="ait-h3">Ses nouvelles</h3>
          {runs.length ? (
            <ol className="ait-msgs">
              {runs.map((r) => (
                <RunMessage key={String(r.id)} r={r} chief={m} now={now} />
              ))}
            </ol>
          ) : (
            <p className="ait-empty">Pas encore de nouvelles.</p>
          )}
          {!all && m.runs.length > SHORT && <More href={`${BASE}?membre=${m.key}&tout=1`} count={m.runs.length} label="Toutes ses nouvelles" />}
        </section>
        <section>
          <h3 className="ait-h3">En coulisses</h3>
          {feed.length ? (
            <ol className="ait-feed">
              {feed.map((f, i) => {
                const who = f.memberKey ? byKey.get(f.memberKey) : undefined;
                return (
                  <li key={`${f.at}-${i}`}>
                    {who ? <Face m={who} size={24} /> : <span className="ait-feed__dot" aria-hidden />}
                    <span className="ait-feed__line">{f.line}</span>
                    <time className="ait-feed__at">{ago(f.at, now)}</time>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="ait-empty">Calme plat pour l&apos;instant.</p>
          )}
          {!all && team.feed.length > 8 && <More href={`${BASE}?membre=${m.key}&tout=1`} count={team.feed.length} label="Tout le fil" />}
        </section>
      </div>
    ),
    carnet: <CarnetView m={m} notes={notes} members={team.members} />,
    canaux: scorecard ? <ScorecardView card={scorecard} members={team.members} /> : null,
    campagnes: <Campaigns m={m} campaigns={campaigns} open={campaign} />,
    recos: <Recos recos={recos} name={m.name} />,
    methode: <MethodView m={m} state={method} />,
    maitrise: <MasteryView m={m} x={mastery[m.key]} />,
    budget: <Budget spend={spend} members={team.members} />,
  };
  return (
    <div className="ait-panel">
      <Head m={m} />
      <PausedNote m={m} />
      <ChiefKpis m={m} team={team} spend={spend} scorecard={scorecard} mastery={mastery[m.key]} openRecos={openRecos} />
      {team.pendingValidations > 0 && (
        <Link href="/admin/publicite/a-valider" prefetch={false} className="ait-cta">
          🙋 {team.pendingValidations} créa{team.pendingValidations > 1 ? "s" : ""} à valider →
        </Link>
      )}
      {m.active && isSea && <ReviewButton name={m.name} />}
      {m.active ? <ChatBox memberKey={m.key} name={m.name} portrait={m.portrait} initial={chat} /> : null}
      <FicheTabs tabs={tabs} initial={campaign ? "campagnes" : all ? "nouvelles" : undefined}>
        {tabs.map((t) => (
          <div key={t.key}>{panes[t.key]}</div>
        ))}
      </FicheTabs>
    </div>
  );
}

function SubPanel({ m, chief, all, spend, scorecard, members, gads, oads, method, trends, mastery, analyst, competition, content, visibility, tech, authority, social }: { m: WithConsignes; chief: MemberView | undefined; all: boolean; spend: MemberSpend | undefined; scorecard: Scorecard | null; members: MemberView[]; gads: SourceResult<GoogleAdsView> | null; oads: SourceResult<OpenAiAdsView> | null; method: MethodState | null; trends: string[]; mastery: TeamMastery; analyst: AnalystView | null; competition: CompetitionView | null; content: ContentView | null; visibility: VisibilityState | null; tech: TechView | undefined; authority: AuthorityView | undefined; social: SocialView | undefined }) {
  // Comme toute l'équipe : sa maîtrise sur 100, et sa méthode réécrite chaque semaine après sa veille.
  const grow: Pane[] = [
    { key: "maitrise", label: "🎓 Maîtrise", body: mastery[m.key] ? <MasteryView m={m} x={mastery[m.key]} /> : null },
    { key: "methode", label: "📘 Méthode", body: VEILLE_DOMAINS[m.key] ? <MethodView m={m} state={method} /> : null },
  ];
  if (m.key === "seo-reseaux" && social !== undefined) return <SocialPanel m={m} chief={chief} extra={grow} view={social} />;
  if (m.key === "seo-autorite" && authority !== undefined) return <AuthorityPanel m={m} chief={chief} extra={grow} view={authority} />;
  if (m.key === "seo-technique" && tech !== undefined) return <TechPanel m={m} chief={chief} extra={grow} view={tech} />;
  if (m.key === "seo-visibilite-ia" && visibility) return <VisibilityPanel m={m} chief={chief} extra={grow} view={visibility} />;
  if (m.key === "seo-contenu" && content) return <ContentPanel m={m} chief={chief} extra={grow} view={content} />;
  if (m.key === "seo-concurrence" && competition) return <CompetitionPanel m={m} chief={chief} extra={grow} view={competition} />;
  if (m.key === "seo-analyste" && analyst) return <AnalystPanel m={m} chief={chief} extra={grow} view={analyst} />;
  // Thomas et Sarah lisent une régie en lecture seule ; Yanis tient la fiche des canaux.
  if (m.key === "sea-google" || m.key === "sea-chatgpt") {
    const google = m.key === "sea-google";
    const f = google ? googleAdsFiche(gads, chief) : openAiAdsFiche(oads, chief);
    return (
      <div className="ait-panel">
        <Head
          m={m}
          note={
            chief && (
              <p className="ait-reports">
                <Face m={chief} size={22} /> {m.name} lit le compte {google ? "Google Ads" : "ChatGPT Ads"} en lecture seule et remet ses constats à {chief.name} ; les changements passent par vous, dans {google ? "la console Google Ads" : "le Gestionnaire de publicités"}.
              </p>
            )
          }
        />
        <PausedNote m={m} chief={chief} />
        {f.problem}
        {f.kpis.length > 0 && <Kpis items={f.kpis} />}
        <Panes
          panes={[
            ...f.panes,
            { key: "tendances", label: "📈 Tendances", body: <Trends lines={trends} /> },
            { key: "maitrise", label: "🎓 Maîtrise", body: mastery[m.key] ? <MasteryView m={m} x={mastery[m.key]} /> : null },
            { key: "methode", label: "📘 Méthode", body: VEILLE_DOMAINS[m.key] ? <MethodView m={m} state={method} /> : null },
          ]}
        />
        {f.footer}
      </div>
    );
  }
  if (m.key === "sea-mesure") {
    const rows = scorecard?.rows ?? [];
    const best = rows.find((r) => r.key === scorecard?.best);
    const leads = rows.reduce((n, r) => n + r.now.leads, 0);
    const qualified = rows.reduce((n, r) => n + r.now.qualified, 0);
    const won = rows.reduce((n, r) => n + r.now.won, 0);
    return (
      <div className="ait-panel">
        <Head
          m={m}
          note={
            chief && (
              <p className="ait-reports">
                <Face m={chief} size={22} /> {chief.name} lit cette fiche pour vous recommander où déplacer le budget.
              </p>
            )
          }
        />
        <PausedNote m={m} chief={chief} />
        {scorecard ? (
          <Kpis
            items={[
              { label: "🏆 Meilleur canal", value: best?.label ?? "—", sub: best?.now.costPerQualified != null ? `${eur0(best.now.costPerQualified)} le lead qualifié` : "pas encore assez de chiffres" },
              { label: `📝 Leads sur ${scorecard.window.months} mois`, value: leads, sub: "tous canaux" },
              { label: "✅ Leads qualifiés", value: qualified, sub: leads ? `${Math.round((qualified / leads) * 100)} % des leads` : "—" },
              { label: "🤝 Clients signés", value: won, sub: qualified ? `${Math.round((won / qualified) * 100)} % des qualifiés` : "—" },
            ]}
          />
        ) : (
          <p className="ait-empty">La fiche n&apos;a pas pu être calculée pour l&apos;instant.</p>
        )}
        <Panes
          panes={[
            { key: "fiche", label: "📊 Fiche des canaux", body: scorecard ? <ScorecardView card={scorecard} members={members} /> : null },
            { key: "maitrise", label: "🎓 Maîtrise", body: mastery[m.key] ? <MasteryView m={m} x={mastery[m.key]} /> : null },
          ]}
        />
      </div>
    );
  }
  const now = new Date();
  const missions = all ? m.missions : m.missions.slice(0, SHORT);
  const x = mastery[m.key];
  const tabs: FicheTab[] = [
    { key: "echanges", label: `💬 Échanges avec ${chief?.name ?? "sa cheffe"}`, badge: m.missions.length || undefined },
    ...(x ? [{ key: "maitrise", label: "🎓 Maîtrise" }] : []),
    ...(VEILLE_DOMAINS[m.key] ? [{ key: "methode", label: "📘 Méthode" }] : []),
  ];
  const panes: Record<string, React.ReactNode> = {
    echanges: (
      <>
        {missions.length ? (
          <ol className="ait-threads">
            {missions.map((t) => (
              <MissionThread key={String(t.id)} x={t} m={m} chief={chief} now={now} />
            ))}
          </ol>
        ) : (
          <p className="ait-empty">Pas encore de mission.</p>
        )}
        {!all && m.missions.length > SHORT && <More href={`${BASE}?membre=${m.key}&tout=1`} count={m.missions.length} label="Tous ses échanges" />}
      </>
    ),
    maitrise: <MasteryView m={m} x={x} />,
    methode: <MethodView m={m} state={method} />,
  };
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> {m.name} reçoit ses missions de {chief.name} et lui rend son travail. Une consigne pour {m.name} ? Dites-la à {chief.name}.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      <SubKpis m={m} chief={chief} spend={spend} mastery={x} now={now} />
      <FicheTabs tabs={tabs} initial={all ? "echanges" : undefined}>
        {tabs.map((t) => (
          <div key={t.key}>{panes[t.key]}</div>
        ))}
      </FicheTabs>
    </div>
  );
}

/** Les quatre chiffres d'un sous-agent : son budget confié, ses missions, sa maîtrise, les consignes en cours de son chef. */
function SubKpis({ m, chief, spend, mastery, now }: { m: WithConsignes; chief: MemberView | undefined; spend: MemberSpend | undefined; mastery: MemberMastery | undefined; now: Date }) {
  const used = spend?.month.usedPct ?? null;
  const delta = mastery ? deltaOf(mastery) : null;
  const last = m.missions[0];
  const consignes = m.consignes?.length ?? 0;
  return (
    <ul className="ait-kpis">
      <li className="ait-kpi">
        <span className="ait-kpi__label">💼 Budget confié ce mois</span>
        <strong className="ait-kpi__value">{spend ? eur3(spend.month.spentEur) : "—"}</strong>
        <span className="ait-kpi__sub">{spend && spend.month.budgetEur ? `dépensés sur ${eur(spend.month.budgetEur)} confiés` : "rien de confié ce mois"}</span>
        {used != null && (
          <span className={`ait-kpi__gauge${used >= 80 ? " ait-kpi__gauge--high" : ""}`} aria-hidden>
            <span style={{ width: `${Math.min(100, used)}%` }} />
          </span>
        )}
      </li>
      <li className="ait-kpi">
        <span className="ait-kpi__label">🎯 Missions ce mois</span>
        <strong className="ait-kpi__value">{m.monthMissions}</strong>
        <span className="ait-kpi__sub">{last ? `dernière ${ago(last.at, now)} · ${STATUS_PHRASES[last.status] ?? last.status}` : "aucune mission encore"}</span>
      </li>
      <li className="ait-kpi">
        <span className="ait-kpi__label">🎓 Maîtrise</span>
        <strong className="ait-kpi__value">
          {mastery ? mastery.mastery.score : "—"}
          <small>/100</small>
        </strong>
        <span className="ait-kpi__sub">{delta == null ? "courbe après deux lundis" : delta === 0 ? "stable depuis lundi" : `${delta > 0 ? "▲ +" : "▼ "}${delta} depuis lundi`}</span>
      </li>
      <li className={`ait-kpi${consignes ? " ait-kpi--alert" : ""}`}>
        <span className="ait-kpi__label">📣 Consignes en cours</span>
        <strong className="ait-kpi__value">{consignes}</strong>
        <span className="ait-kpi__sub">{consignes ? `de ${chief?.name ?? "son chef"}, jointes à chaque mission` : `aucune consigne de ${chief?.name ?? "son chef"}`}</span>
      </li>
    </ul>
  );
}

function Report({
  team,
  selected,
  bureau,
  all,
  campaigns,
  campaign,
  chat,
  inbox,
  scorecard,
  gads,
  oads,
  method,
  trends,
  recos,
  mastery,
  seo,
  analyst,
  competition,
  content,
  visibility,
  tech,
  authority,
  social,
  notes,
}: {
  team: TeamView & { spend: TeamSpend };
  selected: string | null;
  bureau: string | null;
  all: boolean;
  campaigns: CampaignChip[];
  campaign: string | null;
  chat: ChatMessage[];
  inbox: Awaited<ReturnType<typeof loadInbox>>;
  scorecard: Scorecard | null;
  gads: SourceResult<GoogleAdsView> | null;
  oads: SourceResult<OpenAiAdsView> | null;
  method: MethodState | null;
  trends: string[];
  recos: RecoView[];
  mastery: TeamMastery;
  seo: SeoChiefView | null;
  analyst: AnalystView | null;
  competition: CompetitionView | null;
  content: ContentView | null;
  visibility: VisibilityState | null;
  tech: TechView | undefined;
  authority: AuthorityView | undefined;
  social: SocialView | undefined;
  notes: NoteRow[];
}) {
  // Un chef par domaine (SEA, SEO/GEO), chacun avec son équipe.
  const chiefs = team.members.filter((m) => m.level === "chef");
  // La fiche ne s'ouvre (en panneau) que sur un agent choisi : sans choix, l'organigramme seul.
  const current = team.members.find((m) => m.key === selected);
  // Un bureau par chef : on en ouvre un à la fois, et son équipe prend toute la largeur. Le bureau ouvert est celui
  // de l'adresse (?bureau=…), sinon celui de l'agent dont la fiche est ouverte (lien d'une demande, d'un e-mail).
  const office = chiefs.find((c) => c.key === bureau) ?? (current ? chiefs.find((c) => c.key === current.key || String(c.id) === String(current.chiefId)) : undefined);
  const missions = team.members.reduce((n, m) => n + m.monthMissions, 0);
  const working = team.members.filter((m) => m.state === "travail");
  const people = Object.fromEntries(team.members.map((m) => [m.key, { name: m.name, portrait: m.portrait }]));
  return (
    <>
      <Inbox open={inbox.open} closed={inbox.closed} people={people} />
      <p className="ait-hello">
        👋 {working.length ? `${working.map((m) => m.name).join(" et ")} ${working.length > 1 ? "sont" : "est"} au travail en ce moment. ` : "Toute l'équipe est disponible. "}
        {missions} mission{missions > 1 ? "s" : ""} menée{missions > 1 ? "s" : ""} ce mois-ci.
      </p>
      <div className="ait-orgs" aria-label="Organigramme">
        <span className="ait-org__direction">Direction</span>
        <div className="ait-orgs__teams">
          {chiefs.map((chief) => {
            const open = office?.key === chief.key;
            return (
              <div key={chief.key} className={`ait-office${open ? " ait-office--open" : ""}`}>
                <span className="ait-org__line" aria-hidden />
                <span className="ait-office__plate">Bureau de {chief.name}</span>
                <MemberCard m={chief} on={open} big spend={team.spend} mastery={mastery[chief.key]} expanded={open} extra={chief.key === "chef-seo" && seo ? <SeoCardExtra m={chief} seo={seo} /> : undefined} />
              </div>
            );
          })}
        </div>
        {office && (
          <section className="ait-staff" aria-label={`L'équipe de ${office.name}`}>
            <span className="ait-org__line" aria-hidden />
            <h2 className="ait-staff__title">L&apos;équipe de {office.name}</h2>
            {TEAM_GROUPS.map((g) => {
              const row = team.members.filter((m) => m.level === "sous-agent" && String(m.chiefId) === String(office.id) && m.group === g.value);
              if (!row.length) return null;
              return (
                <div key={g.value} className="ait-org__group">
                  <span className="ait-org__label">{g.label}</span>
                  <div className="ait-org__subs">
                    {row.map((m) => (
                      <MemberCard key={m.key} m={m} on={current?.key === m.key} wide spend={team.spend} mastery={mastery[m.key]} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
      {current && (
        <Drawer label={`Fiche de ${current.name}`} closeHref={office ? `${BASE}?bureau=${office.key}` : BASE}>
          {current.key === "chef-seo" && seo ? <SeoChiefPanel m={current} seo={seo} chat={chat} notes={notes} members={team.members} mastery={mastery} method={method} /> : current.level === "chef" ? <ChiefPanel m={current} team={team} all={all} campaigns={campaigns} campaign={campaign} chat={chat} spend={team.spend} scorecard={scorecard} method={method} recos={recos} mastery={mastery} notes={notes} /> : <SubPanel m={{ ...current, consignes: notes, consignesFrom: team.members.find((x) => x.id === current.chiefId)?.name }} chief={team.members.find((x) => x.id === current.chiefId)} all={all} spend={team.spend.members.find((x) => x.key === current.key)} scorecard={scorecard} members={team.members} gads={gads} oads={oads} method={method} trends={trends} mastery={mastery} analyst={analyst} competition={competition} content={content} visibility={visibility} tech={tech} authority={authority} social={social} />}
        </Drawer>
      )}
    </>
  );
}

/** Serge : les objectifs de la semaine, ce que coûte son équipe ce mois, son budget, le temps de la direction, l'agenda. */
async function loadSeoChief(payload: Payload, chief: MemberView | undefined): Promise<SeoChiefView | null> {
  if (!chief) return null;
  const now = new Date();
  // Le dernier plan de Serge (cinq jours ouvrés à partir de sa revue).
  const [objectives, doc, spent, budget] = await Promise.all([
    latestPlan(payload, chief.id),
    payload.findByID({ collection: "ai-team-members", id: chief.id, depth: 0, overrideAccess: true }).catch(() => null) as Promise<{ weeklyHours?: number | null; calendarConnection?: unknown } | null>,
    spentOf(payload, "seo", now).catch(() => ({ day: 0, month: 0 })),
    teamMonthlyBudget(payload, "chef-seo"),
  ]);
  const agenda = await directionAgenda(payload, doc?.calendarConnection ?? null).catch(() => null);
  const { day, daysInMonth } = parisMonthDays(now);
  return {
    week: objectives.length ? String(objectives[0].week ?? "") : null,
    objectives: objectives.map((o) => ({
      id: String(o.id),
      rank: Number(o.rank ?? 0),
      title: String(o.title ?? ""),
      page: (o.page as string | null) || null,
      diagnosis: (o.diagnosis as string | null) || null,
      benchmark: (o.benchmark as string | null) || null,
      why: (o.why as string | null) || null,
      measure: (o.measure as string | null) || null,
      evidence: (o.evidence as string | null) || null,
      dueDate: (o.dueDate as string | null) || null,
      minutes: typeof o.minutes === "number" ? o.minutes : null,
      status: String(o.status ?? "a-faire"),
      steps: (Array.isArray(o.steps) ? (o.steps as Record<string, unknown>[]) : []).map((st) => ({ text: String(st.text ?? ""), minutes: typeof st.minutes === "number" ? st.minutes : null, prompt: (st.prompt as string | null) || null, done: Boolean(st.done) })),
      slots: Array.isArray(o.slots) ? (o.slots as { start: string; end: string; link: string | null }[]) : [],
    })),
    monthEur: spent.month,
    budgetEur: budget?.budgetEur ?? null,
    hours: typeof doc?.weeklyHours === "number" ? doc.weeklyHours : null,
    agenda: agenda ? String(agenda.connection.accountEmail ?? agenda.calendarId) : null,
    daysElapsed: day,
    daysInMonth,
  };
}

/** Les campagnes, pour les puces de la fiche de Margaux. */
const loadCampaignChips = (payload: Payload): Promise<CampaignChip[]> =>
  payload
    .find({ collection: "ad-campaigns", sort: "-updatedAt", limit: 40, depth: 0, overrideAccess: true, select: { name: true, status: true, publicationStatus: true } as never })
    .then((r) =>
      (r.docs as unknown as { id: number; name?: string; status?: string; publicationStatus?: string | null }[]).map((c) => ({
        id: c.id,
        name: c.name ?? "Sans nom",
        status: c.status ?? "brouillon",
        publication: c.publicationStatus ?? null,
      })),
    );

/** Les recommandations suivies de Margaux (les 12 dernières). */
const loadRecos = (payload: Payload): Promise<RecoView[]> =>
  payload
    .find({ collection: "ai-team-requests", where: { origin: { equals: "revue" } }, sort: "-createdAt", limit: 12, depth: 0, overrideAccess: true, select: { createdAt: true, title: true, channel: true, status: true, outcome: true, verdict: true } as never })
    .then((r) =>
      (r.docs as unknown as Record<string, unknown>[]).map((d) => ({
        id: String(d.id),
        at: String(d.createdAt),
        title: String(d.title ?? ""),
        channel: (d.channel as string | null) ?? null,
        status: String(d.status ?? ""),
        outcome: (d.outcome as string | null) ?? null,
        verdict: (d.verdict as string | null) ?? null,
      })),
    )
    .catch(() => []);

/** La conversation d'un chef : ses 40 derniers messages, dans l'ordre. */
const loadChat = (payload: Payload, memberId: number | string): Promise<ChatMessage[]> =>
  payload
    .find({ collection: "ai-team-messages", where: { member: { equals: memberId } }, sort: "-createdAt", limit: 40, depth: 0, overrideAccess: true, select: { from: true, text: true, createdAt: true, noted: true } as never })
    .then((r) =>
      (r.docs as unknown as { id: number; from: "direction" | "agent"; text: string; createdAt: string; noted?: unknown }[])
        .reverse()
        .map((d) => ({ id: String(d.id), from: d.from, text: d.text, at: d.createdAt, ...(Array.isArray(d.noted) ? { noted: d.noted.map(String) } : {}) })),
    );

/** La méthode d'un agent : sa version du moment, sa dernière veille (en cours, en échec), combien de versions faites. */
async function loadMethodState(payload: Payload, memberId: number | string): Promise<MethodState | null> {
  const toDoc = (d: Record<string, unknown> | undefined): MethodDoc | null =>
    d
      ? {
          id: String(d.id),
          week: String(d.week ?? ""),
          status: String(d.status ?? ""),
          method: (d.method as string | null) ?? null,
          changes: (d.changes as string | null) ?? null,
          ideas: Array.isArray(d.ideas) ? (d.ideas as MethodDoc["ideas"]) : [],
          sources: Array.isArray(d.sources) ? (d.sources as MethodDoc["sources"]) : [],
          searches: typeof d.searches === "number" ? d.searches : null,
          costEur: typeof d.costEur === "number" ? d.costEur : null,
          error: (d.error as string | null) ?? null,
          at: String(d.createdAt ?? ""),
        }
      : null;
  try {
    const common = { depth: 0, overrideAccess: true } as const;
    const [latest, current] = await Promise.all([
      payload.find({ collection: "ai-team-methods", where: { member: { equals: memberId } }, sort: "-createdAt", limit: 1, ...common }),
      payload.find({ collection: "ai-team-methods", where: { and: [{ member: { equals: memberId } }, { status: { equals: "faite" } }] }, sort: "-createdAt", limit: 1, ...common }),
    ]);
    const last = toDoc(latest.docs[0] as unknown as Record<string, unknown>);
    // Une veille « en cours » depuis plus de 15 minutes a été coupée : on ne l'affiche plus comme en cours.
    const running = last?.status === "en-cours" && Date.now() - Date.parse(last.at) < 15 * 60_000;
    return { latest: last, current: toDoc(current.docs[0] as unknown as Record<string, unknown>), versions: current.totalDocs, running };
  } catch {
    return null;
  }
}

export default async function TeamPage({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const allowed = isDirection(req.user);
  const sp = await searchParams;
  const selected = typeof sp?.membre === "string" ? sp.membre : null;
  const all = sp?.tout === "1";
  const campaign = typeof sp?.campagne === "string" ? sp.campagne : null;
  const only = (key: string) => allowed && selected === key;
  // Première vague, en parallèle : l'équipe, les demandes, la fiche des canaux, les photos du lundi —
  // et ce que lisent Thomas, Sarah, Margaux, seulement quand on ouvre leur fiche (chaque régie gardée 3 h).
  const [[team, campaigns], inbox, gads, oads, recos, scorecard, snaps] = await Promise.all([
    allowed ? Promise.all([loadTeamView(req.payload), loadCampaignChips(req.payload)]) : Promise.resolve([null, [] as CampaignChip[]] as const),
    allowed ? loadInbox(req.payload) : { open: [], closed: [] },
    only("sea-google") ? loadCompetitorNames(req.payload).then((names) => loadGoogleAds(names)) : null,
    only("sea-chatgpt") ? loadOpenAiAds() : null,
    only("chef-sea") ? loadRecos(req.payload) : ([] as RecoView[]),
    allowed ? cachedScorecard(req.payload) : null,
    allowed ? loadSnapshots(req.payload, 12) : [],
  ]);
  // Seconde vague : ce qui dépend de l'agent ouvert ou de la fiche.
  const member = team?.members.find((x) => x.key === selected);
  const [method, mastery, chat, seo, analyst, competition, content, visibility, tech, authority, social, notes] = await Promise.all([
    member && VEILLE_DOMAINS[member.key] ? loadMethodState(req.payload, member.id) : null,
    allowed ? loadTeamMastery(req.payload, scorecard, new Date(), snaps) : ({} as TeamMastery),
    member?.level === "chef" ? loadChat(req.payload, member.id) : ([] as ChatMessage[]),
    allowed && team ? loadSeoChief(req.payload, team.members.find((x) => x.key === "chef-seo")) : null,
    // Ana : l'entonnoir (GA4 gardé 6 h) et son dernier audit, seulement quand on ouvre sa fiche.
    only("seo-analyste") ? Promise.all([loadFunnel(req.payload).catch(() => null), latestAudit(req.payload)]).then(([funnel, audit]) => ({ funnel, audit })) : null,
    // Guy : les concurrents suivis, leur dernière photo, son dernier rapport.
    only("seo-concurrence") ? Promise.all([loadCompetitorRows(req.payload), latestCompetition(req.payload)]).then(([rows, report]) => ({ rows, report })) : null,
    // Paige : son dernier plan de contenu.
    only("seo-contenu") ? latestContentPlan(req.payload).then((plan) => ({ plan })) : null,
    // Georges : la mesure du mois (même en cours) et son dernier rapport.
    only("seo-visibilite-ia") ? visibilityState(req.payload) : null,
    // Robert : son dernier contrôle et ses tâches (null : pas encore de contrôle).
    only("seo-technique") ? latestTech(req.payload) : undefined,
    // Linda : son dernier rapport et les mentions trouvées (null : pas encore de rapport).
    only("seo-autorite") ? latestAuthority(req.payload) : undefined,
    // Cléo : les comptes branchés, son dernier rapport et la mesure qu'il a lue.
    only("seo-reseaux") ? socialState(req.payload).then((v) => ({ ...v, notice: typeof sp?.youtube === "string" ? sp.youtube : null })) : undefined,
    // Le carnet du chef ouvert ; pour un sous-agent, les consignes que son chef lui a données.
    !allowed || !member ? ([] as NoteRow[]) : member.level === "chef" ? loadCarnet(req.payload, member.id, new Date()) : consignesOf(req.payload, member.id),
  ]);
  const trends = only("sea-google") || only("sea-chatgpt") ? adsTrends(snaps, selected === "sea-google" ? "google" : "chatgpt") : [];

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
            <h1 className="ait-title">Équipe IA</h1>
            <p className="ait-sub">Vous parlez aux chefs ; chaque sous-agent reçoit ses missions de son chef et lui rend son travail.</p>
          </header>
          {team ? <Report team={team} selected={selected} bureau={typeof sp?.bureau === "string" ? sp.bureau : null} all={all} campaigns={campaigns} campaign={campaign} chat={chat} inbox={inbox} scorecard={scorecard} gads={gads} oads={oads} method={method} trends={trends} recos={recos} mastery={mastery} seo={seo} analyst={analyst} competition={competition} content={content} visibility={visibility} tech={tech} authority={authority} social={social} notes={notes} /> : <p className="ait-empty">Cet écran est réservé à la direction.</p>}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
