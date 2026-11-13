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
 * En haut, l'organigramme, avec sur chaque carte la case « en service ». Au
 * clic sur une carte :
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

function MemberCard({ m, on, big, spend, mastery, extra }: { m: MemberView; on: boolean; big?: boolean; spend: TeamSpend; mastery?: MemberMastery; extra?: React.ReactNode }) {
  return (
    <div className={`ait-card${big ? " ait-card--chef" : ""}${on ? " ait-card--on" : ""}${m.active ? "" : " ait-card--off"}`}>
      <Link href={`${BASE}?membre=${m.key}`} prefetch={false} scroll={false} className="ait-card__link" aria-current={on ? "true" : undefined}>
        <Face m={m} size={big ? 104 : 76} />
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

function GoogleAdsPanel({ gads, chief }: { gads: SourceResult<GoogleAdsView>; chief: MemberView | undefined }) {
  if (gads.status === "missing") return <p className="ait-paused">🔌 Le connecteur Google Ads n&apos;est pas branché : variable(s) {gads.missing.join(", ")} (Système › Connexions du support).</p>;
  if (gads.status === "error") return <p className="ait-paused">⚠️ Google Ads n&apos;a pas répondu : {gads.message}</p>;
  const g = gads.data;
  return (
    <>
      {g.findings.length > 0 && (
        <section className="ait-score">
          <h3 className="ait-h3">📝 Ses constats pour {chief?.name ?? "sa cheffe"}</h3>
          <ul className="ait-score__headlines">
            {g.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="ait-meta">{chief?.name ?? "Sa cheffe"} les reprend dans sa revue du lundi, en recommandations pour vous.</p>
        </section>
      )}
      <section className="ait-score">
        <h3 className="ait-h3">📈 Les 30 derniers jours</h3>
        <p className="ait-chips">
          <span>💶 {eur0(g.last30.cost)} dépensés</span>
          <span>🖱️ {g.last30.clicks} clics · {eur2(g.last30.cpc)} le clic</span>
          <span>🎯 {g.last30.conversions} conversion{g.last30.conversions > 1 ? "s" : ""} remontée{g.last30.conversions > 1 ? "s" : ""}</span>
          <span>{g.activeConversionActions ? `✅ ${g.activeConversionActions} action(s) de conversion active(s)` : "⚠️ aucune action de conversion active"}</span>
        </p>
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
      </section>
      <Detail label={`Les recherches qui ont coûté (${g.searchTerms.length})`}>
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
      </Detail>
      <Detail label={`Les mots-clés (${g.keywords.length})`}>
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
      </Detail>
      <p className="seo-fetched">Google Ads lu le {new Date(gads.fetchedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} · lecture seule · relu toutes les 3 h</p>
    </>
  );
}

/* ─── Ce que lit Sarah (ChatGPT Ads) ────────────────────────────────────── */

function OpenAiAdsPanel({ oads, chief }: { oads: SourceResult<OpenAiAdsView>; chief: MemberView | undefined }) {
  if (oads.status === "missing") return <p className="ait-paused">🔌 Le connecteur ChatGPT Ads n&apos;est pas branché : variable(s) {oads.missing.join(", ")} (Système › Connexions du support).</p>;
  if (oads.status === "error") return <p className="ait-paused">⚠️ ChatGPT Ads n&apos;a pas répondu : {oads.message}</p>;
  const o = oads.data;
  return (
    <>
      {o.findings.length > 0 && (
        <section className="ait-score">
          <h3 className="ait-h3">📝 Ses constats pour {chief?.name ?? "sa cheffe"}</h3>
          <ul className="ait-score__headlines">
            {o.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="ait-meta">{chief?.name ?? "Sa cheffe"} les reprend dans sa revue du lundi, en recommandations pour vous.</p>
        </section>
      )}
      <section className="ait-score">
        <h3 className="ait-h3">📈 Les 30 derniers jours</h3>
        <p className="ait-chips">
          <span>💶 {eur0(o.last30.spend)} dépensés</span>
          <span>🖱️ {o.last30.clicks} clics · {eur2(o.last30.cpc)} le clic</span>
          <span>👀 {o.last30.impressions.toLocaleString("fr-FR")} affichages</span>
          <span>🎯 {o.last30.conversions} conversion{o.last30.conversions > 1 ? "s" : ""} du pixel{o.last30.costPerConversion != null ? ` · ${eur0(o.last30.costPerConversion)} chacune` : ""}</span>
        </p>
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
      </section>
      <p className="seo-fetched">ChatGPT Ads lu le {new Date(oads.fetchedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} · lecture seule · relu toutes les 3 h</p>
    </>
  );
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
              <p className="ait-meta">Margaux choisit lesquelles tester, dans sa revue du lundi.</p>
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

function SeoChiefPanel({ m, seo, chat }: { m: MemberView; seo: SeoChiefView; chat: ChatMessage[] }) {
  const planFr = seo.week ? new Date(`${seo.week}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : null;
  const dueLast = seo.objectives.map((o) => o.dueDate).filter((d): d is string => Boolean(d)).sort().at(-1);
  const planned = seo.objectives.reduce((n, o) => n + (o.minutes ?? 0), 0);
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={<p className="ait-reports">{m.name} suit la visibilité gratuite de TIM — Google, les IA, YouTube, LinkedIn, Instagram — jusqu&apos;au lead qualifié. Il recommande et vous fixe des objectifs ; il ne rédige pas : ses prompts sont prêts à coller dans ChatGPT ou Claude.</p>}
      />
      <PausedNote m={m} />
      {m.active && <SeoWeeklyButton name={m.name} />}
      <section className="ait-score">
        <h3 className="ait-h3">🎯 Vos objectifs{planFr ? ` — à partir du ${planFr}` : ""}{dueLast ? `, jusqu'au ${new Date(dueLast).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" })}` : ""}</h3>
        {seo.objectives.length ? (
          <>
            <p className="ait-meta">
              {seo.objectives.length} objectif{seo.objectives.length > 1 ? "s" : ""} · {Math.round((planned / 60) * 10) / 10} h prévues sur vos {(seo.hours ?? 5).toLocaleString("fr-FR")} h · classés par importance
            </p>
            <ObjectivesBoard objectives={seo.objectives} />
          </>
        ) : (
          <p className="ait-empty">Pas encore d&apos;objectifs : ils arrivent lundi matin, ou maintenant avec le bouton.</p>
        )}
      </section>
      <section className="ait-score">
        <h3 className="ait-h3">⚙️ Réglages</h3>
        <HoursEditor id={m.id} name={m.name} hours={seo.hours} />
        <p className="ait-meta">📅 Agenda : {seo.agenda ?? `aucun agenda Google utilisable — ${m.name} ne pose pas de créneaux (Connexions des agendas).`}</p>
      </section>
      {m.active ? <ChatBox memberKey={m.key} name={m.name} portrait={m.portrait} initial={chat} /> : null}
    </div>
  );
}

/* ─── Ana, analyste de bout en bout ─────────────────────────────────────── */

export type AnalystView = { funnel: Funnel | null; audit: { at: string; summary: string; findings: Finding[] } | null };
const KIND_LABEL: Record<string, string> = { search: "Moteur", ai: "IA", social: "Réseau" };
const IMPACT_LABEL: Record<string, string> = { fort: "🔴 impact fort", moyen: "🟠 impact moyen", faible: "⚪ impact faible" };
const TYPE_LABEL: Record<string, string> = { technique: "Technique", contenu: "Contenu", conversion: "Conversion" };
const pctFr = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR")} %`);

function AnalystPanel({ m, chief, view }: { m: MemberView; chief: MemberView | undefined; view: AnalystView }) {
  const f = view.funnel;
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
      <section className="ait-score">
        <h3 className="ait-h3">🧭 L&apos;entonnoir gratuit, source par source{f ? ` — depuis le ${new Date(`${f.since}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}` : ""}</h3>
        {f && f.rows.length ? (
          <>
            <p className="ait-chips">
              <span>👀 {f.totals.sessions.toLocaleString("fr-FR")} visites</span>
              <span>📝 {f.totals.leads} leads ({pctFr(f.totals.leadRate)})</span>
              <span>✅ {f.totals.qualified} qualifiés ({pctFr(f.totals.qualifiedRate)})</span>
              <span>🤝 {f.totals.won} clients</span>
            </p>
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
          </>
        ) : (
          <p className="ait-empty">L&apos;entonnoir n&apos;a pas pu être calculé (GA4 ou les leads ne répondent pas).</p>
        )}
      </section>
      {m.active && <AuditButton name={m.name} />}
      <section className="ait-score">
        <h3 className="ait-h3">🔬 Son dernier audit du site{view.audit ? ` — ${new Date(view.audit.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}` : ""}</h3>
        {view.audit ? (
          <>
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
          </>
        ) : (
          <p className="ait-empty">Pas encore d&apos;audit : le premier aura lieu au début du mois, ou maintenant avec le bouton.</p>
        )}
      </section>
    </div>
  );
}

/* ─── Guy, chargé de la concurrence ─────────────────────────────────────── */

export type CompetitionView = { rows: CompetitorRow[]; report: { at: string; summary: string; findings: CompetitionFinding[] } | null };
const COMPETITOR_KIND: Record<string, string> = { editeur: "Éditeur", comparateur: "Comparateur", media: "Média BTP" };
const HAS_IT: Record<string, string> = { oui: "TIM l'a", partiel: "TIM l'a en partie", non: "TIM ne l'a pas" };

function CompetitionPanel({ m, chief, view }: { m: MemberView; chief: MemberView | undefined; view: CompetitionView }) {
  const withoutSite = view.rows.filter((r) => !r.website).length;
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
      <section className="ait-score">
        <h3 className="ait-h3">🔭 Son dernier rapport{view.report ? ` — ${new Date(view.report.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}` : ""}</h3>
        {view.report ? (
          <>
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
          </>
        ) : (
          <p className="ait-empty">Pas encore de rapport : le premier arrive lundi matin, ou maintenant avec le bouton.</p>
        )}
      </section>
      <section className="ait-score">
        <h3 className="ait-h3">📚 Les concurrents suivis ({view.rows.length})</h3>
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
    </div>
  );
}

/* ─── Paige, stratège de contenu ────────────────────────────────────────── */

export type ContentView = { plan: { at: string; summary: string; findings: ContentItem[] } | null };
const CONTENT_TYPE: Record<string, string> = { creer: "✨ Créer", rafraichir: "🔄 Rafraîchir", fusionner: "🔗 Fusionner", supprimer: "🗑️ Supprimer" };
const SOURCE_LABEL: Record<string, string> = { guy: "vu par Guy", ana: "vu par Ana", "search-console": "Search Console" };

function ContentPanel({ m, chief, view }: { m: MemberView; chief: MemberView | undefined; view: ContentView }) {
  const total = view.plan?.findings.reduce((n, x) => n + x.minutes, 0) ?? 0;
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
      <section className="ait-score">
        <h3 className="ait-h3">📝 Son plan de contenu{view.plan ? ` — ${new Date(view.plan.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}` : ""}</h3>
        {view.plan ? (
          <>
            <p className="ait-obj__text">{view.plan.summary}</p>
            <p className="ait-meta">
              {view.plan.findings.length} action{view.plan.findings.length > 1 ? "s" : ""} · {Math.round((total / 60) * 10) / 10} h d&apos;effort au total · Serge en retient ce qui tient dans votre semaine
            </p>
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
          </>
        ) : (
          <p className="ait-empty">Pas encore de plan : le premier arrive lundi matin, ou maintenant avec le bouton.</p>
        )}
      </section>
    </div>
  );
}

/* ─── Georges, visibilité IA ────────────────────────────────────────────── */

const ACTION_TYPE: Record<string, string> = { page: "📄 Page", source: "🌐 Source tierce", technique: "⚙️ Technique", marque: "🏷️ Marque" };
const rank = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR")}ᵉ`);

function VisibilityPanel({ m, chief, view }: { m: MemberView; chief: MemberView | undefined; view: VisibilityState }) {
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
        IA interrogées : {view.engines.length ? view.engines.join(", ") : "aucune"}
        {view.missing.length ? ` · à brancher (Paramètres › Connexions) : ${view.missing.join(", ")}` : ""} · Google AI Overviews n&apos;est pas mesurable sans outil payant.
      </p>
      <section className="ait-score">
        <h3 className="ait-h3">
          ✨ La place de TIM dans les IA — {month}
          {left > 0 ? ` (mesure en cours : ${view.progress.done} / ${view.progress.total})` : ""}
        </h3>
        {v.answers ? (
          <>
            <p className="ait-chips">
              <span>🗣️ Nommé dans {pctFr(v.overall.mentionPct)} des réponses</span>
              <span>🔗 Cité en source dans {pctFr(v.overall.citationPct)}</span>
              <span>📣 Part de voix {pctFr(v.overall.shareOfVoicePct)}</span>
              <span>🏅 Rang moyen {rank(v.overall.avgPosition)}</span>
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
            {v.lost.length > 0 && (
              <details className="ait-obj__more">
                <summary>
                  Les {v.lost.length} question{v.lost.length > 1 ? "s" : ""} où des concurrents sont recommandés, et pas TIM
                </summary>
                <ul className="ait-score__headlines">
                  {v.lost.map((l) => (
                    <li key={l.id}>
                      « {l.question} » — {l.competitors.join(", ")}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p className="ait-empty">{view.engines.length ? "La mesure du mois commence : les premières réponses arrivent dans quelques minutes, ou maintenant avec le bouton." : "Aucune IA branchée pour l'instant."}</p>
        )}
      </section>
      <section className="ait-score">
        <h3 className="ait-h3">🧭 Son rapport{view.report ? ` — ${new Date(view.report.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}` : ""}</h3>
        {view.report ? (
          <>
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
          </>
        ) : (
          <p className="ait-empty">Pas encore de rapport : il s&apos;écrit dès que la mesure du mois est complète.</p>
        )}
      </section>
    </div>
  );
}

/* ─── Robert, technique ─────────────────────────────────────────────────── */

type TechView = Awaited<ReturnType<typeof latestTech>>;

function TechPanel({ m, chief, view }: { m: MemberView; chief: MemberView | undefined; view: TechView }) {
  const h = view?.health ?? null;
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
      <section className="ait-score">
        <h3 className="ait-h3">🔧 L&apos;état du site{view ? ` — ${new Date(view.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}` : ""}</h3>
        {h ? (
          <>
            <p className="ait-chips">
              <span>
                📄 {h.read} / {h.sitemapCount} pages lues
              </span>
              <span>🔎 {h.indexed == null ? "indexation non lue" : `${h.indexed} / ${h.inspected} indexées par Google`}</span>
              <span>⏱️ {h.avgMs == null ? "—" : `${(h.avgMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`} de réponse en moyenne</span>
              <span>🤖 {h.bots.filter((b) => !b.allowed).length ? `${h.bots.filter((b) => !b.allowed).length} robot(s) bloqué(s)` : "tous les robots passent"}</span>
            </p>
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
            <details className="ait-obj__more">
              <summary>Les robots des moteurs et des IA ({h.bots.filter((b) => b.allowed).length} / {h.bots.length} autorisés)</summary>
              <ul className="ait-method__sources">
                {h.bots.map((b) => (
                  <li key={b.token}>
                    {b.allowed ? "✅" : "⛔"} <strong>{b.token}</strong> — {b.who}
                    {b.role === "entrainement" ? " (entraînement : un choix)" : ""}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p className="ait-empty">Pas encore de contrôle : le premier arrive le premier jour ouvré du mois, ou maintenant avec le bouton.</p>
        )}
      </section>
      {view && (
        <section className="ait-score">
          <h3 className="ait-h3">🛠️ Ses tâches</h3>
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
      )}
    </div>
  );
}

/* ─── Linda, autorité ───────────────────────────────────────────────────── */

type AuthorityView = Awaited<ReturnType<typeof latestAuthority>>;
const TARGET_TYPE: Record<string, string> = { comparateur: "⚖️ Comparateur", annuaire: "📒 Annuaire", avis: "⭐ Avis", media: "📰 Média", forum: "💬 Forum", entite: "🪪 Fiche d'entité", partenaire: "🤝 Partenaire" };
const TARGET_STATE: Record<string, string> = { absent: "TIM absent", incomplet: "fiche incomplète", present: "TIM présent" };
const TONE: Record<string, string> = { positif: "🙂", neutre: "😐", negatif: "🙁" };

function AuthorityPanel({ m, chief, view }: { m: MemberView; chief: MemberView | undefined; view: AuthorityView }) {
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
          <section className="ait-score">
            <h3 className="ait-h3">🔗 Ses cibles — {new Date(view.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}</h3>
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
          <section className="ait-score">
            <h3 className="ait-h3">🗞️ Là où TIM est nommé ({view.mentions.length})</h3>
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
        </>
      ) : (
        <section className="ait-score">
          <p className="ait-empty">Pas encore de rapport : le premier arrive après la mesure de Georges, au plus tard le 7 du mois — ou maintenant avec le bouton.</p>
        </section>
      )}
    </div>
  );
}

/* ─── Cléo, réseaux & vidéo ─────────────────────────────────────────────── */

const SOCIAL_TYPE: Record<string, string> = { relance: "📣 Relance", contenu: "🎬 Contenu", format: "🧩 Format", rythme: "📅 Rythme", reglage: "🔧 Réglage" };
const NET_LABEL: Record<string, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", tous: "Tous réseaux" };
const nFr = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fr-FR"));

type SocialView = SocialState & { notice: string | null };

function SocialPanel({ m, chief, view }: { m: MemberView; chief: MemberView | undefined; view: SocialView }) {
  const r = view.report;
  const ms = r?.measure ?? null;
  const top = ms ? [...ms.posts].sort((a, b) => (b.views ?? b.likes) - (a.views ?? a.likes)).slice(0, 12) : [];
  const known = ms ? ms.people.filter((p) => p.match) : [];
  const others = ms ? ms.people.filter((p) => !p.match).slice(0, 15) : [];
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
      <SocialConnect accounts={view.accounts} youtubeReady={view.youtubeReady} notice={view.notice} />
      {m.active && <SocialButton name={m.name} />}
      {r ? (
        <>
          <section className="ait-score">
            <h3 className="ait-h3">🎬 Ses actions — {new Date(r.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}</h3>
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
          {ms && (
            <>
              <section className="ait-score">
                <h3 className="ait-h3">📊 Les 28 derniers jours</h3>
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
              <section className="ait-score">
                <h3 className="ait-h3">👥 Qui réagit ({ms.people.length})</h3>
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
            </>
          )}
        </>
      ) : (
        <section className="ait-score">
          <p className="ait-empty">Pas encore de rapport : le premier arrive le prochain jour ouvré dès 5 h — ou maintenant avec le bouton.</p>
        </section>
      )}
    </div>
  );
}

/* ─── Fiches ────────────────────────────────────────────────────────────── */

/** L'en-tête de la fiche — figé en haut du panneau ; `note` : la phrase qui dit comment il travaille. */
function Head({ m, note }: { m: MemberView; note?: React.ReactNode }) {
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

function ChiefPanel({ m, team, all, campaigns, campaign, chat, spend, scorecard, method, recos, mastery }: { m: MemberView; team: TeamView; all: boolean; campaigns: CampaignChip[]; campaign: string | null; chat: ChatMessage[]; spend: TeamSpend; scorecard: Scorecard | null; method: MethodState | null; recos: RecoView[]; mastery: TeamMastery }) {
  const now = new Date();
  const byKey = new Map(team.members.map((x) => [x.key, x]));
  const runs = all ? m.runs : m.runs.slice(0, SHORT);
  const feed = team.feed.slice(0, all ? 30 : 8);
  return (
    <div className="ait-panel">
      <Head m={m} />
      <PausedNote m={m} />
      {team.pendingValidations > 0 && (
        <Link href="/admin/publicite/a-valider" prefetch={false} className="ait-cta">
          🙋 {m.name} attend votre avis sur {team.pendingValidations} créa{team.pendingValidations > 1 ? "s" : ""} — voir « À valider » →
        </Link>
      )}
      {m.active && m.key === "chef-sea" && <ReviewButton name={m.name} />}
      {m.active ? <ChatBox memberKey={m.key} name={m.name} portrait={m.portrait} initial={chat} /> : null}

      {scorecard && <ScorecardView card={scorecard} members={team.members} />}

      <MasteryView m={m} x={mastery[m.key]} />

      {m.key === "chef-sea" && <Recos recos={recos} name={m.name} />}

      <MethodView m={m} state={method} />

      <Campaigns m={m} campaigns={campaigns} open={campaign} />

      <Budget spend={spend} members={team.members} />

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
    </div>
  );
}

function SubPanel({ m, chief, all, spend, scorecard, members, gads, oads, method, trends, mastery, analyst, competition, content, visibility, tech, authority, social }: { m: MemberView; chief: MemberView | undefined; all: boolean; spend: MemberSpend | undefined; scorecard: Scorecard | null; members: MemberView[]; gads: SourceResult<GoogleAdsView> | null; oads: SourceResult<OpenAiAdsView> | null; method: MethodState | null; trends: string[]; mastery: TeamMastery; analyst: AnalystView | null; competition: CompetitionView | null; content: ContentView | null; visibility: VisibilityState | null; tech: TechView | undefined; authority: AuthorityView | undefined; social: SocialView | undefined }) {
  if (m.key === "seo-reseaux" && social !== undefined) return <SocialPanel m={m} chief={chief} view={social} />;
  if (m.key === "seo-autorite" && authority !== undefined) return <AuthorityPanel m={m} chief={chief} view={authority} />;
  if (m.key === "seo-technique" && tech !== undefined) return <TechPanel m={m} chief={chief} view={tech} />;
  if (m.key === "seo-visibilite-ia" && visibility) return <VisibilityPanel m={m} chief={chief} view={visibility} />;
  if (m.key === "seo-contenu" && content) return <ContentPanel m={m} chief={chief} view={content} />;
  if (m.key === "seo-concurrence" && competition) return <CompetitionPanel m={m} chief={chief} view={competition} />;
  if (m.key === "seo-analyste" && analyst) return <AnalystPanel m={m} chief={chief} view={analyst} />;
  if (m.key === "sea-chatgpt") {
    return (
      <div className="ait-panel">
        <Head
          m={m}
          note={
            chief && (
              <p className="ait-reports">
                <Face m={chief} size={22} /> Sarah lit le compte ChatGPT Ads en lecture seule et remet ses constats à {chief.name} ; les changements passent par vous, dans le Gestionnaire de publicités.
              </p>
            )
          }
        />
        <MasteryView m={m} x={mastery[m.key]} />
        {oads ? <OpenAiAdsPanel oads={oads} chief={chief} /> : <p className="ait-empty">ChatGPT Ads n&apos;a pas pu être lu pour l&apos;instant.</p>}
        <Trends lines={trends} />
        <MethodView m={m} state={method} />
      </div>
    );
  }
  if (m.key === "sea-google") {
    return (
      <div className="ait-panel">
        <Head
          m={m}
          note={
            chief && (
              <p className="ait-reports">
                <Face m={chief} size={22} /> Thomas lit le compte Google Ads en lecture seule et remet ses constats à {chief.name} ; les changements passent par vous, dans la console Google Ads.
              </p>
            )
          }
        />
        <MasteryView m={m} x={mastery[m.key]} />
        {gads ? <GoogleAdsPanel gads={gads} chief={chief} /> : <p className="ait-empty">Google Ads n&apos;a pas pu être lu pour l&apos;instant.</p>}
        <Trends lines={trends} />
        <MethodView m={m} state={method} />
      </div>
    );
  }
  if (m.key === "sea-mesure") {
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
        <MasteryView m={m} x={mastery[m.key]} />
        {scorecard ? <ScorecardView card={scorecard} members={members} /> : <p className="ait-empty">La fiche n&apos;a pas pu être calculée pour l&apos;instant.</p>}
      </div>
    );
  }
  const now = new Date();
  const missions = all ? m.missions : m.missions.slice(0, SHORT);
  return (
    <div className="ait-panel">
      <Head
        m={m}
        note={
          chief && (
            <p className="ait-reports">
              <Face m={chief} size={22} /> Pas de conversation directe : les missions viennent de {chief.name}, et le travail lui est rendu.
            </p>
          )
        }
      />
      <PausedNote m={m} chief={chief} />
      {spend && (
        <p className="ait-budget__mine">
          💼 Ce mois, {chief?.name ?? "sa cheffe"} lui a confié <strong>{eur(spend.month.budgetEur)}</strong> pour {spend.month.missions} mission{spend.month.missions > 1 ? "s" : ""} : <strong>{eur3(spend.month.spentEur)}</strong> dépensés
          {spend.month.usedPct != null ? ` (${spend.month.usedPct} %)` : ""}.
        </p>
      )}
      <MasteryView m={m} x={mastery[m.key]} />
      <MethodView m={m} state={method} />
      <h3 className="ait-h3">Ses échanges avec {chief?.name ?? "sa cheffe"}</h3>
      {missions.length ? (
        <ol className="ait-threads">
          {missions.map((x) => (
            <MissionThread key={String(x.id)} x={x} m={m} chief={chief} now={now} />
          ))}
        </ol>
      ) : (
        <p className="ait-empty">Pas encore de mission.</p>
      )}
      {!all && m.missions.length > SHORT && <More href={`${BASE}?membre=${m.key}&tout=1`} count={m.missions.length} label="Tous ses échanges" />}
    </div>
  );
}

function Report({
  team,
  selected,
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
}: {
  team: TeamView & { spend: TeamSpend };
  selected: string | null;
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
}) {
  // Un chef par domaine (SEA, SEO/GEO), chacun avec son équipe.
  const chiefs = team.members.filter((m) => m.level === "chef");
  // La fiche ne s'ouvre (en panneau) que sur un agent choisi : sans choix, l'organigramme seul.
  const current = team.members.find((m) => m.key === selected);
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
            const subs = team.members.filter((m) => m.level === "sous-agent" && String(m.chiefId) === String(chief.id));
            return (
              <div key={chief.key} className="ait-org">
                <span className="ait-org__line" aria-hidden />
                <MemberCard m={chief} on={current?.key === chief.key} big spend={team.spend} mastery={mastery[chief.key]} extra={chief.key === "chef-seo" && seo ? <SeoCardExtra m={chief} seo={seo} /> : undefined} />
                {subs.length > 0 && <span className="ait-org__line" aria-hidden />}
                {TEAM_GROUPS.map((g) => {
                  const row = subs.filter((m) => m.group === g.value);
                  if (!row.length) return null;
                  return (
                    <div key={g.value} className="ait-org__group">
                      <span className="ait-org__label">{g.label}</span>
                      <div className="ait-org__subs">
                        {row.map((m) => (
                          <MemberCard key={m.key} m={m} on={current?.key === m.key} spend={team.spend} mastery={mastery[m.key]} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {current && (
        <Drawer label={`Fiche de ${current.name}`} closeHref={BASE}>
          {current.key === "chef-seo" && seo ? <SeoChiefPanel m={current} seo={seo} chat={chat} /> : current.level === "chef" ? <ChiefPanel m={current} team={team} all={all} campaigns={campaigns} campaign={campaign} chat={chat} spend={team.spend} scorecard={scorecard} method={method} recos={recos} mastery={mastery} /> : <SubPanel m={current} chief={team.members.find((x) => x.id === current.chiefId)} all={all} spend={team.spend.members.find((x) => x.key === current.key)} scorecard={scorecard} members={team.members} gads={gads} oads={oads} method={method} trends={trends} mastery={mastery} analyst={analyst} competition={competition} content={content} visibility={visibility} tech={tech} authority={authority} social={social} />}
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
    .find({ collection: "ai-team-messages", where: { member: { equals: memberId } }, sort: "-createdAt", limit: 40, depth: 0, overrideAccess: true, select: { from: true, text: true, createdAt: true } as never })
    .then((r) =>
      (r.docs as unknown as { id: number; from: "direction" | "agent"; text: string; createdAt: string }[])
        .reverse()
        .map((d) => ({ id: String(d.id), from: d.from, text: d.text, at: d.createdAt })),
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
  const [method, mastery, chat, seo, analyst, competition, content, visibility, tech, authority, social] = await Promise.all([
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
          {team ? <Report team={team} selected={selected} all={all} campaigns={campaigns} campaign={campaign} chat={chat} inbox={inbox} scorecard={scorecard} gads={gads} oads={oads} method={method} trends={trends} recos={recos} mastery={mastery} seo={seo} analyst={analyst} competition={competition} content={content} visibility={visibility} tech={tech} authority={authority} social={social} /> : <p className="ait-empty">Cet écran est réservé à la direction.</p>}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
