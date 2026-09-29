"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
  useChartColors,
} from "@/modules/analytics/admin/charts";

type Point = { day: string; spend: number; leads: number };

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const dayLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Dépense et leads, jour par jour — deux axes, parce que ce ne sont pas les
 * mêmes grandeurs : des euros en barres (à gauche), des leads en ligne (à
 * droite). Les mêmes briques que les écrans Analyses (couleurs, dégradés,
 * grille), pour que les deux se lisent pareil.
 */
export function DailyChart({ data }: { data: Point[] }) {
  const c = useChartColors();
  const rows = data.map((p) => ({ ...p, label: dayLabel(p.day), long: dayLong(p.day) }));
  const spendColor = c.series[0];
  const leadsColor = c.series[1];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
        <Gradients entries={[{ id: gradientId("ads-daily", "spend"), color: spendColor }]} />
        <CartesianGrid {...gridProps(c)} />
        <XAxis dataKey="label" tick={axisStyle(c)} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={16} />
        <YAxis yAxisId="eur" tick={axisStyle(c)} axisLine={false} tickLine={false} width={52} tickFormatter={compactEur} />
        <YAxis yAxisId="leads" orientation="right" tick={axisStyle(c)} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.6 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (Point & { long: string }) | undefined;
            if (!active || !p) return null;
            return (
              <div className="an-tip">
                <div className="an-tip__title">{p.long}</div>
                <div className="an-tip__row">
                  <span className="an-tip__key" style={{ background: spendColor }} />
                  <span className="an-tip__value">{p.spend.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span>
                  <span className="an-tip__name">Dépense</span>
                </div>
                <div className="an-tip__row">
                  <span className="an-tip__key" style={{ background: leadsColor }} />
                  <span className="an-tip__value">{p.leads.toLocaleString("fr-FR")}</span>
                  <span className="an-tip__name">Leads</span>
                </div>
              </div>
            );
          }}
        />
        <Legend {...legendProps(c)} />
        <Bar yAxisId="eur" name="Dépense" dataKey="spend" fill={gradientFill(gradientId("ads-daily", "spend"))} radius={BAR_RADIUS} maxBarSize={22} />
        <Line yAxisId="leads" name="Leads" type="monotone" dataKey="leads" stroke={leadsColor} strokeWidth={LINE_WIDTH} dot={lineDot(c, leadsColor)} activeDot={lineActiveDot(c, leadsColor)} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
