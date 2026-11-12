import type { AdminViewServerProps } from "payload";
import Link from "next/link";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { isDirection } from "@/core/access";
import { AgentPanel } from "@/modules/ads/admin/AgentPanel";
import { ActiveToggle } from "@/modules/ai-team/admin/ActiveToggle";
import { BudgetEditor } from "@/modules/ai-team/admin/BudgetEditor";
import { ChatBox, type ChatMessage } from "@/modules/ai-team/admin/ChatBox";
import { Inbox } from "@/modules/ai-team/admin/Inbox";
import { ReviewButton } from "@/modules/ai-team/admin/ReviewButton";
import { loadInbox } from "@/modules/ai-team/lib/inbox";
import { loadTeamView, type MemberView, type MissionView, type RunView, type TeamView } from "@/modules/ai-team/lib/activity";
import { Portrait } from "@/modules/ai-team/lib/portraits";
import { TEAM_GROUPS } from "@/modules/ai-team/lib/team";
import { cached } from "@/modules/analytics/lib/seo-cache";
import { loadScorecard, type Scorecard } from "@/modules/ai-team/lib/scorecard";
import { loadGoogleAds, type GoogleAdsView } from "@/modules/analytics/lib/google-ads";
import { loadOpenAiAds, type OpenAiAdsView } from "@/modules/analytics/lib/openai-ads";
import type { SourceResult } from "@/modules/analytics/lib/seo-cache";
import { monthTotal, perDay, type MemberSpend, type TeamSpend } from "@/modules/ai-team/lib/spend";

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

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
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

function MemberCard({ m, on, big, spend }: { m: MemberView; on: boolean; big?: boolean; spend: TeamSpend }) {
  return (
    <div className={`ait-card${big ? " ait-card--chef" : ""}${on ? " ait-card--on" : ""}${m.active ? "" : " ait-card--off"}`}>
      <Link href={`${BASE}?membre=${m.key}`} prefetch={false} className="ait-card__link" aria-current={on ? "true" : undefined}>
        <Face m={m} size={big ? 104 : 76} />
        <span className="ait-card__name">{m.name}</span>
        <span className="ait-card__job">{m.jobTitle}</span>
        <StateChip m={m} />
        <span className="ait-card__line">{m.stateLine}</span>
      </Link>
      {m.engineRoles.length > 0 && <CardSpend m={m} spend={spend} />}
      {m.engineRoles.length > 0 && <ActiveToggle id={m.id} name={m.name} active={m.active} />}
    </div>
  );
}

/* ─── Budget IA ─────────────────────────────────────────────────────────── */

const HINT_ICONS = { info: "ℹ️", save: "💡", warn: "⚠️" } as const;
const eur3 = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 3 });

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

const eur0 = (n: number | null) => (n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));

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

const eur2 = (n: number | null) => (n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }));

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

/* ─── Fiches ────────────────────────────────────────────────────────────── */

function Head({ m }: { m: MemberView }) {
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

function ChiefPanel({ m, team, all, campaigns, campaign, chat, spend, scorecard }: { m: MemberView; team: TeamView; all: boolean; campaigns: CampaignChip[]; campaign: string | null; chat: ChatMessage[]; spend: TeamSpend; scorecard: Scorecard | null }) {
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

function SubPanel({ m, chief, all, spend, scorecard, members, gads, oads }: { m: MemberView; chief: MemberView | undefined; all: boolean; spend: MemberSpend | undefined; scorecard: Scorecard | null; members: MemberView[]; gads: SourceResult<GoogleAdsView> | null; oads: SourceResult<OpenAiAdsView> | null }) {
  if (m.key === "sea-chatgpt") {
    return (
      <div className="ait-panel">
        <Head m={m} />
        {chief && (
          <p className="ait-reports">
            <Face m={chief} size={22} /> Sarah lit le compte ChatGPT Ads en lecture seule et remet ses constats à {chief.name} ; les changements passent par vous, dans le Gestionnaire de publicités.
          </p>
        )}
        {oads ? <OpenAiAdsPanel oads={oads} chief={chief} /> : <p className="ait-empty">ChatGPT Ads n&apos;a pas pu être lu pour l&apos;instant.</p>}
      </div>
    );
  }
  if (m.key === "sea-google") {
    return (
      <div className="ait-panel">
        <Head m={m} />
        {chief && (
          <p className="ait-reports">
            <Face m={chief} size={22} /> Thomas lit le compte Google Ads en lecture seule et remet ses constats à {chief.name} ; les changements passent par vous, dans la console Google Ads.
          </p>
        )}
        {gads ? <GoogleAdsPanel gads={gads} chief={chief} /> : <p className="ait-empty">Google Ads n&apos;a pas pu être lu pour l&apos;instant.</p>}
      </div>
    );
  }
  if (m.key === "sea-mesure") {
    return (
      <div className="ait-panel">
        <Head m={m} />
        <PausedNote m={m} chief={chief} />
        {chief && (
          <p className="ait-reports">
            <Face m={chief} size={22} /> {chief.name} lit cette fiche pour vous recommander où déplacer le budget.
          </p>
        )}
        {scorecard ? <ScorecardView card={scorecard} members={members} /> : <p className="ait-empty">La fiche n&apos;a pas pu être calculée pour l&apos;instant.</p>}
      </div>
    );
  }
  const now = new Date();
  const missions = all ? m.missions : m.missions.slice(0, SHORT);
  return (
    <div className="ait-panel">
      <Head m={m} />
      <PausedNote m={m} chief={chief} />
      {chief && (
        <p className="ait-reports">
          <Face m={chief} size={22} /> Pas de conversation directe : les missions viennent de {chief.name}, et le travail lui est rendu.
        </p>
      )}
      {spend && (
        <p className="ait-budget__mine">
          💼 Ce mois, {chief?.name ?? "sa cheffe"} lui a confié <strong>{eur(spend.month.budgetEur)}</strong> pour {spend.month.missions} mission{spend.month.missions > 1 ? "s" : ""} : <strong>{eur3(spend.month.spentEur)}</strong> dépensés
          {spend.month.usedPct != null ? ` (${spend.month.usedPct} %)` : ""}.
        </p>
      )}
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
}) {
  const chief = team.members.find((m) => m.level === "chef");
  const subs = team.members.filter((m) => m.level === "sous-agent");
  const current = team.members.find((m) => m.key === selected) ?? chief;
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
      <div className="ait-org" aria-label="Organigramme">
        <span className="ait-org__direction">Direction</span>
        <span className="ait-org__line" aria-hidden />
        {chief && <MemberCard m={chief} on={current?.key === chief.key} big spend={team.spend} />}
        {subs.length > 0 && <span className="ait-org__line" aria-hidden />}
        {TEAM_GROUPS.map((g) => {
          const row = subs.filter((m) => m.group === g.value);
          if (!row.length) return null;
          return (
            <div key={g.value} className="ait-org__group">
              <span className="ait-org__label">{g.label}</span>
              <div className="ait-org__subs">
                {row.map((m) => (
                  <MemberCard key={m.key} m={m} on={current?.key === m.key} spend={team.spend} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {current && (current.level === "chef" ? <ChiefPanel m={current} team={team} all={all} campaigns={campaigns} campaign={campaign} chat={chat} spend={team.spend} scorecard={scorecard} /> : <SubPanel m={current} chief={team.members.find((x) => x.id === current.chiefId)} all={all} spend={team.spend.members.find((x) => x.key === current.key)} scorecard={scorecard} members={team.members} gads={gads} oads={oads} />)}
    </>
  );
}

export default async function TeamPage({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const allowed = isDirection(req.user);
  const sp = await searchParams;
  const selected = typeof sp?.membre === "string" ? sp.membre : null;
  const all = sp?.tout === "1";
  const campaign = typeof sp?.campagne === "string" ? sp.campagne : null;
  const [team, campaigns] = allowed
    ? await Promise.all([
        loadTeamView(req.payload),
        req.payload
          .find({ collection: "ad-campaigns", sort: "-updatedAt", limit: 40, depth: 0, overrideAccess: true, select: { name: true, status: true, publicationStatus: true } as never })
          .then((r) =>
            (r.docs as unknown as { id: number; name?: string; status?: string; publicationStatus?: string | null }[]).map((c) => ({
              id: c.id,
              name: c.name ?? "Sans nom",
              status: c.status ?? "brouillon",
              publication: c.publicationStatus ?? null,
            })),
          ),
      ])
    : [null, [] as CampaignChip[]];
  // La conversation du chef affiché (le chef par défaut) : ses 40 derniers messages, dans l'ordre.
  const inbox = allowed ? await loadInbox(req.payload) : { open: [], closed: [] };
  // Ce que lit Thomas, seulement quand on ouvre sa fiche (le compte Google Ads se lit en direct, gardé 3 h).
  const gads =
    allowed && selected === "sea-google"
      ? await loadGoogleAds(
          ((await req.payload.find({ collection: "ad-competitors", pagination: false, depth: 0, overrideAccess: true, select: { name: true } as never })).docs as unknown as { name?: string }[]).map((c) => String(c.name ?? "")).filter(Boolean),
        )
      : null;
  // Ce que lit Sarah, seulement quand on ouvre sa fiche (ChatGPT Ads, lu en direct, gardé 3 h).
  const oads = allowed && selected === "sea-chatgpt" ? await loadOpenAiAds() : null;
  // La fiche des canaux lit Pennylane : gardée 30 minutes, et une erreur ne casse pas la page.
  const scorecard = allowed
    ? await cached(`scorecard:${new Date().toISOString().slice(0, 13)}`, 30 * 60_000, () => loadScorecard(req.payload)).catch((e) => {
        req.payload.logger.warn(`[équipe IA] fiche des canaux : ${e instanceof Error ? e.message : String(e)}`);
        return null;
      })
    : null;
  const chiefOf = team ? (team.members.find((m) => m.key === selected && m.level === "chef") ?? team.members.find((m) => m.level === "chef")) : null;
  const chat: ChatMessage[] = chiefOf
    ? (
        (
          await req.payload.find({ collection: "ai-team-messages", where: { member: { equals: chiefOf.id } }, sort: "-createdAt", limit: 40, depth: 0, overrideAccess: true })
        ).docs as unknown as { id: number; from: "direction" | "agent"; text: string; createdAt: string }[]
      )
        .reverse()
        .map((d) => ({ id: String(d.id), from: d.from, text: d.text, at: d.createdAt }))
    : [];

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
          {team ? <Report team={team} selected={selected} all={all} campaigns={campaigns} campaign={campaign} chat={chat} inbox={inbox} scorecard={scorecard} gads={gads} oads={oads} /> : <p className="ait-empty">Cet écran est réservé à la direction.</p>}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
