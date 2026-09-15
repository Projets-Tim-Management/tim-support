"use client";

import { useEffect, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Bucket, MonthPoint, PartnerStat, ProfileStat } from "@/modules/partner/lib/billing-analytics";
import { eur } from "@/modules/partner/lib/format";
import type { ProfilKey } from "@/modules/partner/lib/pricing";

/**
 * Les graphiques de l'écran « Analyses → Facturation », sur Recharts.
 *
 * Règles tenues ici (skill dataviz) : un seul axe par graphique, marques
 * fines, grille en trait fin recessif, une série = une couleur FIXE par
 * entité (jamais par rang), légende dès deux séries, valeurs directes
 * seulement aux extrémités, infobulle sur tout. Les couleurs viennent des
 * jetons `--tim-chart-*` lus au montage — Recharts veut des valeurs, pas des
 * `var()`.
 */

type Colors = { series: string[]; muted: string; grid: string; text: string; textMuted: string; surface: string };

const FALLBACK: Colors = {
  series: ["#fe5464", "#2a78d6", "#1baf7a", "#eda100", "#4a3aa7"],
  muted: "#c9ccd3",
  grid: "#eef0f3",
  text: "#505050",
  textMuted: "#8a8f98",
  surface: "#ffffff",
};

/** Les jetons, lus une fois sur :root — même palette que le reste de l'admin. */
function useChartColors(): Colors {
  const [colors, setColors] = useState<Colors>(FALLBACK);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    setColors({
      series: [1, 2, 3, 4, 5].map((i) => read(`--tim-chart-${i}`, FALLBACK.series[i - 1])),
      muted: read("--tim-chart-muted", FALLBACK.muted),
      grid: read("--tim-chart-grid", FALLBACK.grid),
      text: read("--tim-foreground", FALLBACK.text),
      textMuted: read("--tim-muted", FALLBACK.textMuted),
      surface: read("--tim-white", FALLBACK.surface),
    });
  }, []);
  return colors;
}

/** Ordre FIXE des profils dans la palette : Admin = 1 … Compagnon = 5. */
const PROFILE_SLOT: Record<ProfilKey, number> = { admin: 0, conducteur: 1, chefChantier: 2, chefEquipe: 3, compagnon: 4 };

const monthLabel = (iso: string, long = false) =>
  new Date(iso).toLocaleDateString("fr-FR", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" });

/** Ticks d'axe en € compacts : 1 200 → « 1,2 k€ ». */
const compactEur = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€` : `${v} €`);

type TipRow = { name: string; value: number; color: string };

/** Infobulle commune : le mois en titre, puis une ligne par série, la valeur en gras. */
function Tip({ active, label, payload, title }: { active?: boolean; label?: string | number; payload?: readonly { name?: string | number; value?: number | string | readonly (number | string)[]; color?: string }[]; title?: string }) {
  if (!active || !payload?.length) return null;
  const rows: TipRow[] = payload.map((p) => ({ name: String(p.name ?? ""), value: Number(p.value ?? 0), color: p.color ?? "" }));
  return (
    <div className="an-tip">
      <div className="an-tip__title">{title ?? String(label ?? "")}</div>
      {rows.map((r) => (
        <div key={r.name} className="an-tip__row">
          <span className="an-tip__key" style={{ background: r.color }} />
          <span className="an-tip__value">{eur.format(r.value)}</span>
          <span className="an-tip__name">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

const axisStyle = (c: Colors) => ({ fontSize: 11, fill: c.textMuted });

/* ─── CA mensuel : attendu (fiches) vs facturé (Pennylane) ───────────────── */

export function RevenueChart({ data }: { data: MonthPoint[] }) {
  const c = useChartColors();
  const rows = data.map((p) => ({ ...p, label: monthLabel(p.month), long: monthLabel(p.month, true) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" tick={axisStyle(c)} axisLine={{ stroke: c.grid }} tickLine={false} />
        <YAxis tick={axisStyle(c)} axisLine={false} tickLine={false} tickFormatter={compactEur} width={64} />
        <Tooltip
          cursor={{ stroke: c.muted, strokeWidth: 1 }}
          content={(p) => <Tip {...p} title={p.payload?.[0]?.payload?.long} />}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: c.text }} />
        <Bar name="Facturé par Pennylane (HT)" dataKey="invoiced" fill={c.series[1]} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive />
        <Area
          name="Attendu d'après les fiches (HT / mois)"
          type="monotone"
          dataKey="expected"
          stroke={c.series[0]}
          strokeWidth={2}
          fill={c.series[0]}
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ─── Par profil : CA HT / mois, une couleur fixe par profil ─────────────── */

export function ProfileChart({ data }: { data: ProfileStat[] }) {
  const c = useChartColors();
  const rows = data.filter((p) => p.licences > 0);
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 44 + 24)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 4 }} barCategoryGap="30%">
        <CartesianGrid stroke={c.grid} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: c.text }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: c.grid }} content={(p) => <Tip {...p} />} />
        <Bar name="CA HT / mois" dataKey="caHT" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {rows.map((r) => (
            <Cell key={r.key} fill={c.series[PROFILE_SLOT[r.key]]} />
          ))}
          <LabelList dataKey="caHT" position="right" formatter={(v: unknown) => eur.format(Number(v))} style={{ fontSize: 12, fill: c.text }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Par partenaire : CA apporté, une seule série ───────────────────────── */

export function PartnerChart({ data }: { data: PartnerStat[] }) {
  const c = useChartColors();
  const rows = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 40 + 24)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 4 }} barCategoryGap="30%">
        <CartesianGrid stroke={c.grid} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: c.text }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: c.grid }} content={(p) => <Tip {...p} />} />
        <Bar name="CA HT / mois apporté" dataKey="caHT" fill={c.series[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
          <LabelList dataKey="caHT" position="right" formatter={(v: unknown) => eur.format(Number(v))} style={{ fontSize: 12, fill: c.text }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Impayés par ancienneté : quatre paliers ordonnés, une seule teinte ─── */

export function AgingChart({ data }: { data: Bucket[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" tick={axisStyle(c)} axisLine={{ stroke: c.grid }} tickLine={false} />
        <YAxis tick={axisStyle(c)} axisLine={false} tickLine={false} tickFormatter={compactEur} width={64} />
        <Tooltip cursor={{ fill: c.grid }} content={(p) => <Tip {...p} />} />
        <Bar name="Reste dû TTC" dataKey="caHT" fill={c.series[0]} radius={[4, 4, 0, 0]} maxBarSize={24}>
          <LabelList dataKey="count" position="top" formatter={(v: unknown) => (Number(v) ? `${v} fact.` : "")} style={{ fontSize: 11, fill: c.textMuted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Part-à-tout à 2-4 segments : une barre empilée, pas un camembert ───── */

export function ShareBar({ data, valueKey = "caHT", unit = "eur" }: { data: Bucket[]; valueKey?: "caHT" | "count"; unit?: "eur" | "int" }) {
  const c = useChartColors();
  const total = data.reduce((s, b) => s + b[valueKey], 0);
  if (!total) return <p className="an-empty">Rien à répartir.</p>;
  const fmt = (v: number) => (unit === "eur" ? eur.format(v) : String(v));
  return (
    <div className="an-share">
      <div className="an-share__bar" role="img" aria-label={data.map((b) => `${b.label} : ${fmt(b[valueKey])}`).join(", ")}>
        {data.map((b, i) => (
          <span
            key={b.key}
            className="an-share__seg"
            style={{ width: `${(b[valueKey] / total) * 100}%`, background: c.series[i % c.series.length] }}
            title={`${b.label} · ${fmt(b[valueKey])}`}
          />
        ))}
      </div>
      <ul className="an-share__legend">
        {data.map((b, i) => (
          <li key={b.key}>
            <span className="an-share__swatch" style={{ background: c.series[i % c.series.length] }} />
            <span className="an-share__value">{fmt(b[valueKey])}</span>
            <span className="an-share__label">
              {b.label} · {Math.round((b[valueKey] / total) * 100)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
