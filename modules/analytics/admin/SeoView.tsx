import type { AdminViewServerProps } from "payload";
import Link from "next/link";
import { Suspense } from "react";

import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { CountBars, MonthlyChart } from "@/modules/analytics/admin/charts";
import { DataTable, type Column, type Row } from "@/modules/analytics/admin/DataTable";
import { BarList, Card, Fold, Kpi, type BarItem } from "@/modules/analytics/admin/ui";
import { loadBing, type BingAnalytics } from "@/modules/analytics/lib/seo-bing";
import type { SourceResult } from "@/modules/analytics/lib/seo-cache";
import { loadGa4, type Ga4Analytics } from "@/modules/analytics/lib/seo-ga4";
import { loadGsc, type GscAnalytics } from "@/modules/analytics/lib/seo-gsc";
import { periodBounds } from "@/modules/analytics/lib/growth";
import { loadPageSpeed, type PageSpeedData } from "@/modules/analytics/lib/seo-pagespeed";
import { buildOrganicAnalytics, type LeadClient, type OrganicAnalytics, type SourceRow } from "@/modules/analytics/lib/seo-sources";

/**
 * Écran « Analyses → SEO & GEO » (/admin/analyses/seo-geo).
 *
 * Trois onglets, un sujet chacun, et chacun dit d'abord CE QUE C'EST en une
 * phrase — SEO et GEO se confondent facilement :
 *  - SEO : être trouvé sur Google et Bing quand quelqu'un cherche ;
 *  - GEO : être recommandé par les assistants IA (ChatGPT, Perplexity…) ;
 *  - Santé du site : la vitesse et la stabilité, qui servent les deux.
 *
 * Dans chaque onglet, le même ordre de lecture : trois grands chiffres en mots
 * simples, un graphique, une ou deux listes, ce qu'il faut faire — et tout le
 * détail replié en bas, pour qui veut creuser.
 *
 * Une source pas connectée affiche ce qui manque, jamais un chiffre inventé.
 */

type Tab = "seo" | "geo" | "sante";
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "seo", label: "SEO", hint: "Google et Bing" },
  { key: "geo", label: "GEO", hint: "Assistants IA" },
  { key: "sante", label: "Santé du site", hint: "Vitesse et stabilité" },
];
const PERIODS = [3, 6, 12] as const;
const BASE = "/admin/analyses/seo-geo";
const href = (tab: Tab, months: number) => `${BASE}?vue=${tab}&p=${months}`;

/* ─── Formats ─────────────────────────────────────────────────────────────── */
const int = (n: number) => n.toLocaleString("fr-FR");
const dec = (n: number | null | undefined, d = 1) => (n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: d }));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${dec(n)} %`);
const pageName = (u: string) => {
  const path = u.replace(/^https?:\/\/[^/]+/, "") || "/";
  if (path === "/") return "Accueil";
  const last = path.replace(/[?#].*$/, "").replace(/\/$/, "").split("/").pop() || path;
  return last.replace(/-/g, " ");
};
const fetchedLabel = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const plural = (n: number, one: string, many: string) => `${int(n)} ${n > 1 ? many : one}`;

/* ─── Briques ─────────────────────────────────────────────────────────────── */

/** La phrase qui dit de quoi parle l'onglet — avant tout chiffre. */
function Intro({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="seo-intro">
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

/** Ce qu'affiche un onglet quand sa source ne rend rien. */
function Unavailable({ name, result }: { name: string; result: Exclude<SourceResult<unknown>, { status: "ok" }> }) {
  return result.status === "missing" ? (
    <div className="seo-pending">
      <strong>{name} n&apos;est pas encore connecté.</strong>
      <span>
        Variable{result.missing.length > 1 ? "s" : ""} à poser : {result.missing.map((m) => <code key={m}>{m}</code>)}
      </span>
      <Link href="/admin/connexions-support" prefetch={false}>
        Voir la marche à suivre
      </Link>
    </div>
  ) : (
    <p className="an-note">{result.message}</p>
  );
}

/** Une liste d'actions, en phrases : quoi, pourquoi, combien ça peut rapporter. */
type TodoItem = { title: string; detail: string; gain?: string; /** Une perte s'affiche en rouge, un gain en vert. */ tone?: "up" | "down" };

function Todo({ items, empty }: { items: TodoItem[]; empty: string }) {
  if (!items.length) return <p className="an-empty">{empty}</p>;
  return (
    <ol className="seo-todo">
      {items.map((i) => (
        <li key={i.title}>
          <span className="seo-todo__text">
            <strong>{i.title}</strong>
            <span>{i.detail}</span>
          </span>
          {i.gain && <span className={`seo-todo__gain seo-todo__gain--${i.tone ?? "up"}`}>{i.gain}</span>}
        </li>
      ))}
    </ol>
  );
}

/* ─── Colonnes du détail replié ───────────────────────────────────────────── */
const QUERY_COLUMNS: Column[] = [
  { key: "query", label: "Recherche" },
  { key: "brand", label: "Type", format: "badge", tones: { marque: "muted", generique: "ok" }, labels: { marque: "Notre nom", generique: "Générique" } },
  { key: "clicks", label: "Visites", format: "int" },
  { key: "clicksDelta", label: "Évol.", format: "delta" },
  { key: "impressions", label: "Apparitions", format: "int" },
  { key: "ctr", label: "Taux de clic", format: "pct" },
  { key: "position", label: "Place", align: "right" },
];
const PAGE_COLUMNS: Column[] = [
  { key: "page", label: "Page" },
  { key: "clicks", label: "Visites", format: "int" },
  { key: "clicksDelta", label: "Évol.", format: "delta" },
  { key: "impressions", label: "Apparitions", format: "int" },
  { key: "position", label: "Place", align: "right" },
];
const ENGINE_COLUMNS: Column[] = [
  { key: "label", label: "Source" },
  { key: "kind", label: "Type", format: "badge", tones: { ai: "ok", search: "muted" }, labels: { ai: "IA (GEO)", search: "Moteur (SEO)" } },
  { key: "leads", label: "Prospects", format: "int" },
  { key: "won", label: "Clients gagnés", format: "int" },
  { key: "conversion", label: "Prospect → client", format: "pct" },
];
const LANDING_COLUMNS: Column[] = [
  { key: "path", label: "Page d'arrivée" },
  { key: "search", label: "Via moteurs", format: "int" },
  { key: "ai", label: "Via IA", format: "int" },
];
const GA4_PAGE_COLUMNS: Column[] = [
  { key: "page", label: "Page d'arrivée" },
  { key: "sessions", label: "Visites", format: "int" },
  { key: "engagedRate", label: "Engagées", format: "pct" },
  { key: "keyEvents", label: "Conversions", format: "int" },
];
const CWV_TONES = { FAST: "ok", AVERAGE: "warn", SLOW: "bad", none: "muted" } as const;
const CWV_LABELS = { FAST: "Bon", AVERAGE: "Moyen", SLOW: "Mauvais", none: "—" };
const PSI_COLUMNS: Column[] = [
  { key: "page", label: "Page" },
  { key: "lcpCat", label: "Affichage", format: "badge", tones: CWV_TONES, labels: CWV_LABELS },
  { key: "inpCat", label: "Réactivité", format: "badge", tones: CWV_TONES, labels: CWV_LABELS },
  { key: "clsCat", label: "Stabilité", format: "badge", tones: CWV_TONES, labels: CWV_LABELS },
  { key: "performance", label: "Vitesse /100", format: "int" },
  { key: "seo", label: "SEO /100", format: "int" },
  { key: "accessibility", label: "Accessibilité /100", format: "int" },
];

/* ─── Onglet SEO ──────────────────────────────────────────────────────────── */

function SeoTab({ gsc, bing, ga4, months }: { gsc: SourceResult<GscAnalytics>; bing: SourceResult<BingAnalytics>; ga4: SourceResult<Ga4Analytics>; months: number }) {
  if (gsc.status !== "ok")
    return <Unavailable name="Google Search Console" result={gsc} />;
  const g = gsc.data;
  const { kpis } = g;
  const bAll = bing.status === "ok" ? bing.data : null;
  const b = bAll?.hasPeriodData ? bAll : null;
  const posGain = kpis.position != null && kpis.positionPrev != null ? Math.round((kpis.positionPrev - kpis.position) * 10) / 10 : null;

  const monthly = g.monthly.map((m, i) => ({ month: m.month, google: m.clicks, ...(b ? { bing: b.monthly[i]?.clicks ?? 0 } : {}) }));
  const topQueries: BarItem[] = [...g.queries]
    .sort((a, z) => z.clicks - a.clicks)
    .slice(0, 10)
    .map((q) => ({ key: q.query, label: q.query, value: q.clicks, sub: `${dec(q.position)}ᵉ place · ${q.branded ? "notre nom" : "recherche générique"}` }));
  const positions = [
    { key: "1-3", label: "Dans les 3 premiers", count: g.positions[0].count },
    { key: "4-10", label: "Sur la 1re page (4 à 10)", count: g.positions[1].count },
    { key: "11-20", label: "Sur la 2e page", count: g.positions[2].count },
    { key: "21+", label: "Plus loin", count: g.positions[3].count + g.positions[4].count },
  ];
  const todo: TodoItem[] = [
    ...g.opportunities.slice(0, 4).map((o) => ({
      title: `« ${o.query} »`,
      detail: `${dec(o.position)}ᵉ place, vue ${int(o.impressions)} fois mais cliquée ${plural(o.clicks, "fois", "fois")}. Enrichir la page qui y répond, ou revoir son titre.`,
      gain: `+${int(o.potentialClicks)} visites à gagner`,
      tone: "up" as const,
    })),
    ...g.decliningPages.slice(0, 2).map((p) => ({
      title: `Page « ${pageName(p.page)} » en baisse`,
      detail: p.clicks === 0 ? "Elle ne reçoit plus aucune visite de Google : vérifier qu'elle existe toujours et qu'elle est indexée." : `${plural(p.lostClicks, "visite perdue", "visites perdues")} par rapport à la période d'avant.`,
      gain: `−${int(p.lostClicks)} visites perdues`,
      tone: "down" as const,
    })),
  ];

  return (
    <>
      <div className="an-kpis">
        <Kpi tone="blue" label="Visites venues de Google" value={int(kpis.clicks.current)} delta={kpis.clicks} deltaTitle="vs période précédente" sub={[b ? `+ ${int(b.clicks)} depuis Bing` : null, ga4.status === "ok" && ga4.data.search.engagedRate != null ? `${pct(ga4.data.search.engagedRate)} restent sur le site` : null].filter(Boolean).join(" · ") || "sur la période"} spark={g.monthly.map((m) => m.clicks)} />
        <Kpi tone="slate" label="Apparitions dans les résultats" value={int(kpis.impressions.current)} delta={kpis.impressions} deltaTitle="vs période précédente" sub={`cliquées ${pct(kpis.ctr)} du temps`} spark={g.monthly.map((m) => m.impressions)} />
        <Kpi
          tone={posGain == null || posGain >= 0 ? "green" : "amber"}
          label="Place moyenne dans les résultats"
          value={kpis.position != null ? `${dec(kpis.position)}ᵉ` : "—"}
          sub={posGain == null ? "1 = premier résultat" : posGain > 0 ? `▲ ${dec(posGain)} place(s) gagnée(s)` : posGain < 0 ? `▼ ${dec(-posGain)} place(s) perdue(s)` : "stable"}
          // Inversée : une place qui baisse est une bonne nouvelle, la courbe doit monter quand on progresse.
          spark={g.monthly.map((m) => (m.position == null ? null : -m.position))}
        />
      </div>

      <div className="an-grid">
        <Card wide title="Visites venues des moteurs, mois par mois" sub={b ? "Google et Bing." : "Google. Les 3 derniers jours arrivent avec un peu de retard."}>
          <MonthlyChart data={monthly} series={[{ key: "google", label: "Google" }, ...(b ? [{ key: "bing", label: "Bing" }] : [])]} stacked />
        </Card>
        <Card title="Les recherches qui nous amènent le plus de visites" sub="Les 10 premières, et la place qu'on y occupe.">
          <BarList items={topQueries} tone="blue" unit="int" showShare={false} empty="Aucune visite sur la période." />
        </Card>
        <Card title="Où on apparaît" sub={`Sur ${int(kpis.keywords)} recherches où Google nous montre. Peu de gens vont en 2e page : c'est là qu'il y a à gagner.`}>
          <CountBars data={positions} />
        </Card>
        <Card wide title="À travailler en priorité" sub="Les recherches où on est presque bien placé, et les pages qui perdent des visites.">
          <Todo items={todo} empty="Rien d'urgent : aucune recherche à portée de main ni page en baisse." />
        </Card>
      </div>

      {bAll && !bAll.hasPeriodData && (
        <p className="seo-fetched">Bing n&apos;a pas encore de données sur cette période (dernières : {bAll.lastDay ? new Date(`${bAll.lastDay}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "aucune"}).</p>
      )}

      <Fold title="Voir tous les détails" sub="Toutes les recherches, toutes les pages, appareils et pays — avec export CSV.">
        <div className="an-grid">
          <Card wide title="Toutes les recherches" sub={`« Notre nom » : les recherches qui contiennent ${g.brand.terms.slice(0, 1).join("")} — ${pct(g.brand.brandedShare)} des visites.`}>
            <DataTable columns={QUERY_COLUMNS} rows={g.queries.map((q): Row => ({ ...q, id: q.query, brand: q.branded ? "marque" : "generique", branded: undefined }))} sort={{ key: "clicks", dir: "desc" }} csv="seo-recherches" searchKeys={["query"]} maxHeight="480px" />
          </Card>
          <Card wide title="Toutes les pages" sub="Les visites que chaque page reçoit de Google.">
            <DataTable columns={PAGE_COLUMNS} rows={g.pages.map((p): Row => ({ ...p, id: p.page }))} sort={{ key: "clicks", dir: "desc" }} csv="seo-pages" searchKeys={["page"]} maxHeight="400px" />
          </Card>
          {ga4.status === "ok" && (
            <Card wide title="Ce que font les visiteurs venus des moteurs (GA4)" sub="Par page d'arrivée : « engagées » = au moins 10 secondes, 2 pages ou une conversion.">
              <DataTable columns={GA4_PAGE_COLUMNS} rows={ga4.data.searchPages.map((p): Row => ({ ...p, id: p.page }))} sort={{ key: "sessions", dir: "desc" }} csv="seo-pages-visites" searchKeys={["page"]} maxHeight="400px" />
            </Card>
          )}
          <Card title="Par appareil" sub="Google classe d'après la version mobile.">
            <CountBars data={g.devices} />
          </Card>
          <Card title="Par pays">
            <CountBars data={g.countries} />
          </Card>
        </div>
      </Fold>
      <p className="seo-fetched">
        Google lu le {fetchedLabel(gsc.fetchedAt)} · période de {months} mois
      </p>
    </>
  );
}

/* ─── Onglet GEO ──────────────────────────────────────────────────────────── */

function GeoTab({ o, ga4 }: { o: OrganicAnalytics; ga4: SourceResult<Ga4Analytics> }) {
  const ai = o.engines.filter((e) => e.kind === "ai");
  const aiWon = ai.reduce((n, e) => n + e.won, 0);
  const leadsBy = new Map(ai.map((e) => [e.key, e.leads]));
  const g = ga4.status === "ok" ? ga4.data : null;

  // Avec GA4 : toutes les visites IA ; sans, les seuls prospects (formulaires).
  const byAssistant: BarItem[] = g
    ? g.sources
        .filter((s) => s.kind === "ai" && s.sessions > 0)
        .map((s) => ({ key: s.key, label: s.label, value: s.sessions, sub: leadsBy.get(s.key) ? plural(leadsBy.get(s.key)!, "prospect", "prospects") : undefined }))
    : ai.map((e) => ({ key: e.key, label: e.label, value: e.leads, sub: e.won ? plural(e.won, "client gagné", "clients gagnés") : undefined }));
  const aiShare = g && g.ai.sessions.current + g.search.sessions.current ? Math.round((g.ai.sessions.current / (g.ai.sessions.current + g.search.sessions.current)) * 1000) / 10 : null;

  return (
    <>
      <div className="an-kpis">
        {g ? (
          <Kpi tone="green" label="Visites envoyées par une IA" value={int(g.ai.sessions.current)} delta={g.ai.sessions} deltaTitle="vs période précédente" sub={`${pct(aiShare)} des visites gratuites · ${pct(g.ai.engagedRate)} engagées`} spark={g.monthly.map((m) => m.ai)} />
        ) : (
          <Kpi tone="green" label="Visites envoyées par une IA" value="—" sub={ga4.status === "missing" ? "GA4 à connecter" : "GA4 en erreur"} />
        )}
        <Kpi tone="blue" label="Prospects envoyés par une IA" value={int(o.kpis.ai.current)} delta={o.kpis.ai} deltaTitle="vs période précédente" sub="formulaires remplis" spark={o.monthly.map((m) => m.ai)} />
        <Kpi tone="slate" label="Clients gagnés grâce aux IA" value={int(aiWon)} sub={o.kpis.ai.current ? `sur ${plural(o.kpis.ai.current, "prospect", "prospects")} IA` : "aucun prospect IA sur la période"} />
      </div>

      <div className="an-grid">
        {g ? (
          <Card wide title="Visites envoyées par les IA, mois par mois" sub="Toutes les visites venues de ChatGPT, Gemini, Perplexity, Copilot… (GA4).">
            <MonthlyChart data={g.monthly.map((m) => ({ month: m.month, ai: m.ai }))} series={[{ key: "ai", label: "Visites IA" }]} />
          </Card>
        ) : (
          <Card wide title="Prospects gratuits, mois par mois : moteurs ou IA ?" sub="Tous les formulaires venus sans publicité : ce que les IA apportent, à côté de Google et Bing.">
            <MonthlyChart data={o.monthly} series={[{ key: "search", label: "Moteurs (SEO)" }, { key: "ai", label: "Assistants IA (GEO)" }]} stacked />
          </Card>
        )}
        <Card title={g ? "Quelle IA nous envoie des visites" : "Quelle IA nous envoie des prospects"} sub="Un minimum : un clic depuis une application mobile arrive souvent sans dire d'où il vient.">
          <BarList items={byAssistant} tone="green" unit="int" showShare={false} empty="Aucune visite venue d'une IA sur la période." />
        </Card>
        <Card title="Combien de fois les IA nous citent" sub="Aucune ne le transmet par API : ces rapports se lisent sur leur site.">
          <ul className="seo-links">
            <li>
              <a href="https://chatgpt.com/business-hub" target="_blank" rel="noreferrer">
                ChatGPT — Business Hub ↗
              </a>
              <span>Mentions, vues de la fiche, clics, sujets — 28 derniers jours</span>
            </li>
            <li>
              <a href="https://search.google.com/search-console/performance/search-analytics/ai" target="_blank" rel="noreferrer">
                Google (AI Overviews, AI Mode) ↗
              </a>
              <span>Search Console → Performance → IA générative</span>
            </li>
            <li>
              <a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer">
                Copilot ↗
              </a>
              <span>Bing Webmaster Tools → AI Performance</span>
            </li>
          </ul>
        </Card>
      </div>

      <Fold title="Voir tous les détails" sub="Les pages où arrivent les visites IA ; chaque source jusqu'au client gagné.">
        <div className="an-grid">
          {g && (
            <Card wide title="Pages où arrivent les visites IA" sub="Les sujets sur lesquels les IA nous citent : à relier aux pages produit.">
              <DataTable columns={GA4_PAGE_COLUMNS} rows={g.aiPages.map((p): Row => ({ ...p, id: p.page }))} sort={{ key: "sessions", dir: "desc" }} csv="geo-pages-visites-ia" searchKeys={["page"]} emptyText="Aucune visite IA sur la période." maxHeight="360px" />
            </Card>
          )}
          <Card wide title="Prospects par source" sub="Moteurs et IA, jusqu'au client gagné (formulaires).">
            <DataTable columns={ENGINE_COLUMNS} rows={o.engines.map((e): Row => ({ id: e.key, label: e.label, kind: e.kind, leads: e.leads, won: e.won, conversion: e.conversion }))} sort={{ key: "leads", dir: "desc" }} emptyText="Aucun prospect gratuit identifié sur la période." />
          </Card>
          <Card wide title="Pages par lesquelles arrivent les prospects">
            <DataTable columns={LANDING_COLUMNS} rows={o.pages.map((p): Row => ({ ...p, id: p.path }))} sort={{ key: "ai", dir: "desc" }} csv="geo-pages-arrivee" searchKeys={["path"]} emptyText="Aucun prospect gratuit identifié sur la période." maxHeight="360px" />
          </Card>
        </div>
      </Fold>
      {ga4.status === "ok" && <p className="seo-fetched">GA4 lu le {fetchedLabel(ga4.fetchedAt)} · ne compte que les visiteurs qui acceptent les cookies</p>}
    </>
  );
}

/* ─── Onglet Santé du site ────────────────────────────────────────────────── */

function SanteTab({ psi }: { psi: SourceResult<PageSpeedData> }) {
  const intro = (
    <Intro title="Un site rapide et stable est mieux classé.">
      Google mesure la vitesse d&apos;affichage, la réactivité et la stabilité de chaque page, sur mobile. Une page lente perd des places — et les IA la lisent moins bien.
    </Intro>
  );
  if (psi.status !== "ok")
    return (
      <>
        {intro}
        <Unavailable name="PageSpeed Insights" result={psi} />
      </>
    );
  const { pages, failed } = psi.data;
  const known = pages.filter((p) => p.cwvPass != null);
  const passed = known.filter((p) => p.cwvPass).length;
  const avg = (k: "performance" | "seo") => {
    const v = pages.map((p) => p[k]).filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
  };
  const perf = avg("performance");
  const seo = avg("seo");
  const verdict = (s: number | null) => (s == null ? "" : s >= 90 ? "rapide" : s >= 50 ? "à améliorer" : "lente");
  // Les plus lentes d'abord : c'est par elles qu'on commence.
  const speed: BarItem[] = [...pages]
    .sort((a, z) => (a.performance ?? 101) - (z.performance ?? 101))
    .map((p) => ({ key: p.url, label: pageName(p.url), value: p.performance ?? 0, sub: `${p.performance ?? "—"}/100 · ${verdict(p.performance)}` }));
  const slow = pages.filter((p) => (p.performance ?? 100) < 90).sort((a, z) => (a.performance ?? 0) - (z.performance ?? 0));
  const todo = slow.slice(0, 4).map((p) => ({
    title: `Accélérer « ${pageName(p.url)} »`,
    detail: `Vitesse ${p.performance}/100 sur mobile${p.lcp.p75 ? `, contenu affiché en ${dec(p.lcp.p75 / 1000)} s` : ""}. Alléger les images et les scripts de la page.`,
  }));

  return (
    <>
      {intro}
      <div className="an-kpis">
        <Kpi tone={known.length && passed === known.length ? "green" : "amber"} label="Pages qui passent le test de Google" value={known.length ? `${passed} / ${known.length}` : "—"} sub={known.length ? "mesuré sur les vrais visiteurs, 28 jours" : "pas assez de visiteurs pour être mesuré"} />
        <Kpi tone={perf != null && perf >= 90 ? "green" : "amber"} label="Vitesse moyenne sur mobile" value={perf != null ? `${perf} / 100` : "—"} sub={perf != null ? `« ${verdict(perf)} » · 90 et plus = rapide` : undefined} />
        <Kpi tone={seo != null && seo >= 90 ? "green" : "amber"} label="Bases techniques du SEO" value={seo != null ? `${seo} / 100` : "—"} sub="titres, balises, liens, indexation" />
      </div>

      <div className="an-grid">
        <Card title="Vitesse de chaque page (mobile)" sub="Les plus lentes en haut. 90 et plus : rapide ; 50 à 89 : à améliorer ; moins de 50 : lente.">
          <BarList items={speed} tone="green" unit="int" showShare={false} />
        </Card>
        <Card title="À travailler en priorité" sub="Les pages sous 90 sur mobile.">
          <Todo items={todo} empty="Toutes les pages sont rapides sur mobile." />
        </Card>
      </div>

      <Fold title="Voir tous les détails" sub="Affichage, réactivité et stabilité de chaque page, et ses scores.">
        <DataTable
          columns={PSI_COLUMNS}
          rows={pages.map(
            (p): Row => ({
              id: p.url,
              page: pageName(p.url),
              lcpCat: p.lcp.category ?? "none",
              inpCat: p.inp.category ?? "none",
              clsCat: p.cls.category ?? "none",
              performance: p.performance,
              seo: p.seo,
              accessibility: p.accessibility,
            }),
          )}
          csv="sante-pages"
        />
      </Fold>
      {failed.length > 0 && (
        <p className="seo-fetched seo-fetched--left">
          {plural(failed.length, "page n'a pas pu être auditée", "pages n'ont pas pu être auditées")} cette fois ({failed.map(pageName).join(", ")}) : Google limite le nombre d&apos;audits par minute. Réessayé à la prochaine ouverture.
        </p>
      )}
      <p className="seo-fetched">PageSpeed lu le {fetchedLabel(psi.fetchedAt)} · relu une fois par jour</p>
    </>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

type Data = { gsc: SourceResult<GscAnalytics>; bing: SourceResult<BingAnalytics>; ga4: SourceResult<Ga4Analytics>; organic: OrganicAnalytics };

/**
 * L'onglet Santé interroge PageSpeed pour chaque page clé : jusqu'à une minute
 * à froid. Chargé à part, sous <Suspense> : l'onglet s'ouvre aussitôt, avec un
 * message d'attente, et les résultats arrivent quand ils sont prêts — sans quoi
 * le clic semblait ne rien faire.
 */
async function SanteLoader() {
  const psi = await loadPageSpeed();
  return (
    <>
      {psi.status === "error" && <SourceNotice />}
      <SanteTab psi={psi} />
    </>
  );
}

function SanteLoading() {
  return (
    <div className="seo-loading" role="status">
      <span className="seo-loading__spinner" aria-hidden />
      <span>
        <strong>Audit des pages en cours…</strong>
        <span>Google teste chaque page sur mobile : jusqu&apos;à une minute la première fois, instantané ensuite (gardé 24 h).</span>
      </span>
    </div>
  );
}

function SourceNotice() {
  return (
    <p className="seo-fetched seo-fetched--left">
      Une source n&apos;est pas connectée ou répond en erreur —{" "}
      <Link href="/admin/connexions-support" prefetch={false}>
        voir les connexions
      </Link>
      .
    </p>
  );
}

function Report({ d, tab, months }: { d: Data; tab: Tab; months: number }) {
  // Seules les sources de l'onglet ouvert ont été interrogées (Santé : dans son propre chargement).
  const sources = tab === "seo" ? [d.gsc, d.bing, d.ga4] : tab === "geo" ? [d.ga4] : [];
  const broken = sources.some((s) => s.status !== "ok");
  return (
    <>
      <div className="seo-toolbar">
        <nav className="seo-tabs" aria-label="Sujet">
          {TABS.map((t) => (
            <Link key={t.key} href={href(t.key, months)} prefetch={false} className={`seo-tab${t.key === tab ? " seo-tab--on" : ""}`}>
              <span className="seo-tab__label">{t.label}</span>
              <span className="seo-tab__hint">{t.hint}</span>
            </Link>
          ))}
        </nav>
        <nav className="an-filters" aria-label="Période">
          {PERIODS.map((m) => (
            <Link key={m} href={href(tab, m)} prefetch={false} className={`an-filter${m === months ? " an-filter--on" : ""}`}>
              {m} mois
            </Link>
          ))}
        </nav>
      </div>
      {broken && <SourceNotice />}
      {tab === "seo" && <SeoTab gsc={d.gsc} bing={d.bing} ga4={d.ga4} months={months} />}
      {tab === "geo" && <GeoTab o={d.organic} ga4={d.ga4} />}
      {tab === "sante" && (
        <Suspense key={`sante-${months}`} fallback={<SanteLoading />}>
          <SanteLoader />
        </Suspense>
      )}
    </>
  );
}

export default async function SeoView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const sp = await view.searchParams;
  const asked = Number(Array.isArray(sp?.p) ? sp.p[0] : sp?.p);
  const months = (PERIODS as readonly number[]).includes(asked) ? asked : 3;
  const rawTab = Array.isArray(sp?.vue) ? sp.vue[0] : sp?.vue;
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : "seo";
  const now = new Date();

  let data: Data | null = null;
  if (hasAdminRole(user)) {
    // Seul l'onglet ouvert interroge sa source externe : PageSpeed prend jusqu'à
    // une minute à froid, il ne doit pas ralentir l'onglet SEO.
    const skip = { status: "missing" as const, missing: [] };
    const [gsc, bing, ga4, subs, clients] = await Promise.all([
      tab === "seo" ? loadGsc(months, now) : Promise.resolve(skip),
      tab === "seo" ? loadBing(months, now) : Promise.resolve(skip),
      tab === "seo" || tab === "geo" ? loadGa4(months, now) : Promise.resolve(skip),
      tab === "geo"
        ? payload.find({
            collection: "form-submissions",
            // Seule la période et la précédente comptent (buildOrganicAnalytics) : on ne lit pas le reste.
            where: { createdAt: { greater_than_equal: new Date(periodBounds(months, now).prevFrom).toISOString() } },
            limit: 20000,
            depth: 0,
            overrideAccess: true,
            pagination: false,
            select: { createdAt: true, channel: true, referrer: true, utmSource: true, utmMedium: true, gclid: true, msclkid: true, oaiclid: true, fbclid: true, landingPath: true, sourcePagePath: true } as never,
          })
        : Promise.resolve({ docs: [] }),
      // Seules les opportunités nées d'un formulaire servent ici.
      tab === "geo" ? payload.find({ collection: "partner-clients", where: { formSubmission: { exists: true } }, pagination: false, depth: 0, draft: true, overrideAccess: true, select: { formSubmission: true, clientStatus: true } as never }) : Promise.resolve({ docs: [] }),
    ]);
    data = { gsc, bing, ga4, organic: buildOrganicAnalytics(subs.docs as unknown as SourceRow[], clients.docs as LeadClient[], months, now) };
  }

  return (
    <AnalyticsPage view={view} page="seo-geo" title="SEO & GEO">
      {data && <Report d={data} tab={tab} months={months} />}
    </AnalyticsPage>
  );
}
