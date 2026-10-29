/**
 * Le rapport d'une campagne en ligne, tel que l'analyste le lit (plan
 * Publicité, §9 nonies, étape 3) — et tel que l'écran et le récapitulatif du
 * lundi le montrent.
 *
 * Tout ce qui est CALCULÉ l'est ici, par le code : sommes, taux, tendance d'une
 * période sur la précédente, usure d'une pub, phase d'apprentissage. Le modèle
 * interprète ces chiffres ; il ne les fabrique pas.
 *
 * Pure.
 */

export type MetricIn = {
  level: "campaign" | "adset" | "ad";
  externalId: string;
  day: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingViews: number;
  leads: number;
  siteLeads: number;
  qualifiedLeads: number;
  won: number;
};
export type ObjectIn = {
  level: "adset" | "ad";
  externalId: string;
  name: string;
  adsetExternalId: string | null;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  issues: string[];
  frequency7d: number;
  reach7d: number;
};
export type CreativeIn = { id: number | string; angle: string; title: string | null; body: string | null; tests: string[] };
export type ChangeIn = { target: string; kind: string; summary: string; executedAt: string };
export type AlertIn = { kind: string; detail: string; detectedAt: string };

export type Totals = {
  depenseEur: number;
  impressions: number;
  clics: number;
  clicsVersSite: number;
  vuesPage: number;
  leadsMeta: number;
  leadsSite: number;
  leadsQualifies: number;
  gagnes: number;
  /** Clics vers le site / impressions, en %. */
  tauxClicPct: number | null;
  coutParClicEur: number | null;
  /** Vues de la page / clics vers le site : combien arrivent vraiment au bout du clic. */
  arriveePct: number | null;
  /** Leads du site / vues de la page : la page convertit-elle ? */
  conversionPagePct: number | null;
  coutParLeadEur: number | null;
  coutParLeadQualifieEur: number | null;
};

export const FATIGUE_FREQUENCY = 3;
export const FATIGUE_CTR_DROP_PCT = 30;
/** Résultats depuis la dernière modification importante avant de sortir de la phase d'apprentissage (Meta). */
export const LEARNING_RESULTS = 50;

const r2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (a: number, b: number, pct = false) => (b > 0 ? r2((a / b) * (pct ? 100 : 1)) : null);

export function totalsOf(rows: MetricIn[]): Totals {
  const s = (k: keyof MetricIn) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  const spend = r2(s("spend"));
  const impressions = s("impressions");
  const linkClicks = s("linkClicks");
  const views = s("landingViews");
  const leadsSite = s("siteLeads");
  const leadsMeta = s("leads");
  const qualified = s("qualifiedLeads");
  // Un lead du site compte une fois : Meta compte aussi les formulaires du pixel, on prend le plus grand des deux.
  const leads = Math.max(leadsSite, leadsMeta);
  return {
    depenseEur: spend,
    impressions,
    clics: s("clicks"),
    clicsVersSite: linkClicks,
    vuesPage: views,
    leadsMeta,
    leadsSite,
    leadsQualifies: qualified,
    gagnes: s("won"),
    tauxClicPct: ratio(linkClicks, impressions, true),
    coutParClicEur: ratio(spend, linkClicks),
    arriveePct: ratio(views, linkClicks, true),
    conversionPagePct: ratio(leadsSite, views, true),
    coutParLeadEur: ratio(spend, leads),
    coutParLeadQualifieEur: ratio(spend, qualified),
  };
}

const shift = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/** Variation en % d'une valeur sur la précédente ; null si l'une manque. */
export const trendPct = (now: number | null, before: number | null): number | null => (now == null || before == null || before === 0 ? null : Math.round(((now - before) / before) * 100));

export function buildReport(input: {
  campaign: {
    id: number | string;
    name: string;
    externalId: string;
    autonomy: string;
    activatedAt: string | null;
    floorEur: number | null;
    aiDailyEur: number | null;
    /** Le plan publié : objectif et ce sur quoi Meta optimise (« vues-page », « conversions »…). */
    objective: string | null;
    optimisation: string | null;
    /** La page où mène chaque pub : à comparer avec ce que la pub promet. */
    landingUrl: string | null;
  };
  today: string;
  days: number;
  metrics: MetricIn[];
  objects: ObjectIn[];
  /** Pub chez Meta → créa du support. */
  creatives: Map<string, CreativeIn>;
  changes: ChangeIn[];
  alerts: AlertIn[];
  now: Date;
}) {
  const { today, days } = input;
  const since = shift(today, -(days - 1));
  const prevSince = shift(since, -days);
  const prevUntil = shift(since, -1);
  const of = (level: MetricIn["level"], id: string, from: string, to: string) => input.metrics.filter((m) => m.level === level && m.externalId === id && m.day >= from && m.day <= to);
  const cur = (level: MetricIn["level"], id: string) => totalsOf(of(level, id, since, today));
  const prev = (level: MetricIn["level"], id: string) => totalsOf(of(level, id, prevSince, prevUntil));
  const lastChange = (id: string) => input.changes.filter((c) => c.target === id).sort((a, b) => b.executedAt.localeCompare(a.executedAt))[0] ?? null;

  const c = input.campaign;
  const campTotals = cur("campaign", c.externalId);
  const campPrev = prev("campaign", c.externalId);
  const activeDays = c.activatedAt ? Math.floor((input.now.getTime() - Date.parse(c.activatedAt)) / 86_400_000) : null;
  const freezeUntil = c.activatedAt ? new Date(Date.parse(c.activatedAt) + 7 * 86_400_000).toISOString().slice(0, 10) : null;

  const adsets = input.objects
    .filter((o) => o.level === "adset")
    .map((o) => {
      const changed = lastChange(o.externalId);
      // Résultats depuis la dernière modification : sous le seuil de Meta, l'ensemble apprend encore.
      const results = totalsOf(input.metrics.filter((m) => m.level === "adset" && m.externalId === o.externalId && (!changed || m.day >= changed.executedAt.slice(0, 10))));
      // Ce qui compte comme « résultat » pour Meta, c'est ce sur quoi il optimise.
      const resultats = c.optimisation === "conversions" ? Math.max(results.leadsSite, results.leadsMeta) : c.optimisation === "clics" ? results.clicsVersSite : results.vuesPage;
      return {
        id: o.externalId,
        nom: o.name,
        etat: o.effectiveStatus,
        budgetQuotidienEur: o.dailyBudget,
        repetition7j: o.frequency7d,
        portee7j: o.reach7d,
        periode: cur("adset", o.externalId),
        dernierChangement: changed ? { le: changed.executedAt.slice(0, 10), quoi: changed.summary } : null,
        phaseApprentissage: resultats < LEARNING_RESULTS,
      };
    });

  const spendTotal = campTotals.depenseEur;
  const ads = input.objects
    .filter((o) => o.level === "ad")
    .map((o) => {
      const t = cur("ad", o.externalId);
      const p = prev("ad", o.externalId);
      const ctrTrend = trendPct(t.tauxClicPct, p.tauxClicPct);
      const crea = input.creatives.get(o.externalId) ?? null;
      return {
        id: o.externalId,
        nom: o.name,
        ensemble: o.adsetExternalId,
        etat: o.effectiveStatus,
        problemes: o.issues,
        crea: crea ? { id: crea.id, angle: crea.angle, titre: crea.title, texte: crea.body, tests: crea.tests } : null,
        repetition7j: o.frequency7d,
        partDepensePct: spendTotal > 0 ? Math.round((t.depenseEur / spendTotal) * 100) : 0,
        periode: t,
        periodePrecedente: p,
        tendanceTauxClicPct: ctrTrend,
        // Fatigue (§9 quinquies §5) : vue trop souvent ET de moins en moins cliquée.
        usee: o.frequency7d > FATIGUE_FREQUENCY && ctrTrend != null && ctrTrend <= -FATIGUE_CTR_DROP_PCT,
        dernierChangement: lastChange(o.externalId)?.executedAt.slice(0, 10) ?? null,
      };
    })
    .sort((a, b) => b.periode.depenseEur - a.periode.depenseEur);

  return {
    campagne: {
      id: c.id,
      nom: c.name,
      idMeta: c.externalId,
      autonomie: c.autonomy,
      objectif: c.objective,
      optimisation: c.optimisation,
      pageArrivee: c.landingUrl,
      enDiffusionDepuisJours: activeDays,
      gelJusquAu: activeDays != null && activeDays < 7 ? freezeUntil : null,
      budgetQuotidienMetaEur: r2(adsets.filter((a) => a.etat === "ACTIVE").reduce((s, a) => s + (a.budgetQuotidienEur ?? 0), 0)),
      plancherMetaEur: c.floorEur,
      partIaQuotidienneEur: c.aiDailyEur,
    },
    periode: { du: since, au: today, jours: days, precedente: { du: prevSince, au: prevUntil } },
    totaux: campTotals,
    totauxPrecedents: campPrev,
    tendances: {
      depensePct: trendPct(campTotals.depenseEur, campPrev.depenseEur),
      tauxClicPct: trendPct(campTotals.tauxClicPct, campPrev.tauxClicPct),
      coutParClicPct: trendPct(campTotals.coutParClicEur, campPrev.coutParClicEur),
      leadsPct: trendPct(campTotals.leadsSite, campPrev.leadsSite),
    },
    ensembles: adsets,
    publicites: ads,
    alertesOuvertes: input.alerts.map((a) => ({ type: a.kind, constat: a.detail, depuis: a.detectedAt.slice(0, 10) })),
    // Les jours, pour voir une rupture que les totaux cachent.
    jours: [...new Set(input.metrics.filter((m) => m.level === "campaign" && m.day >= since).map((m) => m.day))].sort().map((d) => ({ jour: d, ...pick(totalsOf(of("campaign", c.externalId, d, d))) })),
  };
}

const pick = (t: Totals) => ({ depenseEur: t.depenseEur, impressions: t.impressions, clicsVersSite: t.clicsVersSite, vuesPage: t.vuesPage, leadsSite: t.leadsSite });

export type CampaignReport = ReturnType<typeof buildReport>;
