"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  BAR_RADIUS,
  Gradients,
  LINE_WIDTH,
  axisStyle,
  compactEur,
  gradientFill,
  gradientId,
  gridProps,
  legendProps,
  lineActiveDot,
  lineDot,
  monthLabel,
  useChartColors,
} from "@/modules/analytics/admin/charts";
import { ValidationStrip } from "@/modules/analytics/admin/ValidationStrip";
import { eur } from "@/modules/partner/lib/format";

import type { MonthRow } from "./data-home";

/**
 * Les derniers mois croisés, en UN graphique : le CA en bâtons, les entrées
 * en lignes. Trois, six ou douze mois — trois par défaut : c'est le
 * trimestre qu'on a en tête le matin, l'année se lit dans Analyses.
 *
 * Des euros et des comptes n'ont pas d'échelle commune. Plutôt que deux
 * panneaux, on assume deux axes — l'axe gauche en € pour les bâtons, l'axe
 * droit en nombre pour les lignes. Les formats de graduation (« 3,5 k€ »
 * contre « 40 ») disent d'eux-mêmes quel côté lire ; l'infobulle donne les
 * trois valeurs du mois côte à côte.
 *
 * Le dessin (bâtons en dégradé, points évidés, grille pointillée, légende à
 * puces) est celui de TOUS les graphiques — les briques viennent de
 * modules/analytics/admin/charts.tsx. Les prospects en violet, les clients
 * signés en vert (le vert des analyses) — le trio est validé contre le rouge
 * marque par le script dataviz. Aucune couleur en dur : tout vient des jetons
 * `--tim-chart-*`.
 *
 * Les douze mois arrivent du serveur ; changer de période ne fait que couper
 * la série — aucun aller-retour.
 */
type Row = MonthRow & { label: string; long: string };
type TipPayload = readonly { dataKey?: string | number; value?: number | string | readonly (number | string)[]; color?: string; fill?: string; name?: string | number; payload?: Row }[];

const PERIODS = [3, 6, 12] as const;
type Period = (typeof PERIODS)[number];
const DEFAULT_PERIOD: Period = 3;

/** L'infobulle : le mois en titre, le CA puis les deux comptes, chacun avec sa couleur. */
function MonthTip({ active, payload, colors }: { active?: boolean; payload?: TipPayload; colors: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const fmt = (key: string, v: number) => (key === "ca" ? eur.format(v) : v.toLocaleString("fr-FR"));
  return (
    <div className="an-tip">
      <div className="an-tip__title">{row?.long}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="an-tip__row">
          <span className="an-tip__key" style={{ background: colors[String(p.dataKey)] ?? p.color ?? p.fill }} />
          <span className="an-tip__value">{fmt(String(p.dataKey), Number(p.value ?? 0))}</span>
          <span className="an-tip__name">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

const GRADIENT = gradientId("home", "ca");

export default function MonthlyOverview({ months }: { months: MonthRow[] }) {
  const c = useChartColors();
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);

  const shown = months.slice(-period);
  const rows: Row[] = shown.map((p) => ({ ...p, label: monthLabel(p.month), long: monthLabel(p.month, true) }));
  const vide = shown.every((m) => m.ca === 0 && m.prospects === 0 && m.clients === 0);

  const ink = axisStyle(c);
  const bar = c.series[0];
  const green = c.series[2];
  const swatches = { ca: bar, prospects: c.violet, clients: green };
  const dot = (color: string) => lineDot(c, color);
  const activeDot = (color: string) => lineActiveDot(c, color);

  return (
    <section className="home-section" aria-label="Les derniers mois">
      <header className="home-section__head">
        <h2 className="home-section__title">Sur {period} mois</h2>
        {/* Le sélecteur de période d'Analyses (.an-filters), à l'identique —
            en boutons plutôt qu'en liens : ici on ne change pas de page. */}
        <div className="an-filters" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={`an-filter${p === period ? " an-filter--on" : ""}`}
              aria-pressed={p === period}
              onClick={() => setPeriod(p)}
            >
              {p} mois
            </button>
          ))}
        </div>
        <Link className="home-section__more" href="/admin/analyses/facturation">
          Analyse détaillée ›
        </Link>
      </header>

      {vide ? (
        <div className="home-empty">
          <p className="home-empty__text">Rien à tracer sur cette période.</p>
        </div>
      ) : (
        <div className="home-months">
          {/* `initialDimension` : un premier tracé dès le rendu serveur, avant que
              le conteneur ne soit mesuré — sinon la carte arrive vide puis saute. */}
          <ResponsiveContainer width="100%" height={300} initialDimension={{ width: 900, height: 300 }}>
            <ComposedChart data={rows} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="38%">
              <Gradients entries={[{ id: GRADIENT, color: bar }]} />
              <CartesianGrid {...gridProps(c)} />
              <XAxis dataKey="label" tick={ink} axisLine={false} tickLine={false} dy={6} />
              <YAxis yAxisId="eur" tick={ink} axisLine={false} tickLine={false} tickFormatter={compactEur} width={60} />
              <YAxis yAxisId="nb" orientation="right" tick={ink} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
              <Tooltip
                cursor={{ fill: c.grid, opacity: 0.6 }}
                content={(p) => <MonthTip active={p.active} payload={p.payload as TipPayload} colors={swatches} />}
              />
              <Legend {...legendProps(c)} />
              <Bar yAxisId="eur" name="CA HT / mois" dataKey="ca" fill={gradientFill(GRADIENT)} radius={BAR_RADIUS} maxBarSize={period === 3 ? 44 : 22} />
              <Line yAxisId="nb" name="Nouveaux prospects" type="monotone" dataKey="prospects" stroke={c.violet} strokeWidth={LINE_WIDTH} dot={dot(c.violet)} activeDot={activeDot(c.violet)} />
              <Line yAxisId="nb" name="Clients signés" type="monotone" dataKey="clients" stroke={green} strokeWidth={LINE_WIDTH} dot={dot(green)} activeDot={activeDot(green)} />
            </ComposedChart>
          </ResponsiveContainer>
          {/* Ce qui est signé sur le rapprochement : le CA d'un mois non signé
              n'est qu'un attendu, et on le dit sous le graphique. */}
          <ValidationStrip months={shown.map((m) => ({ month: m.month, billed: m.billed, validated: m.validated }))} />
        </div>
      )}
    </section>
  );
}
