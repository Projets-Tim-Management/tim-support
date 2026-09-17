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
  Line,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Bucket, MonthPoint, PartnerStat, ProfileStat } from "@/modules/analytics/lib/billing";
import type { FlowLink, FlowNode, FunnelStep } from "@/modules/analytics/lib/pipeline";
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

export type Colors = { series: string[]; violet: string; muted: string; grid: string; text: string; textMuted: string; surface: string };

const FALLBACK: Colors = {
  series: ["#fe5464", "#2a78d6", "#1baf7a", "#eda100", "#4a3aa7"],
  violet: "#5b5bd6",
  muted: "#c9ccd3",
  grid: "#eef0f3",
  text: "#505050",
  textMuted: "#8a8f98",
  surface: "#ffffff",
};

/** Les jetons, lus une fois sur :root — même palette que le reste de l'admin. */
export function useChartColors(): Colors {
  const [colors, setColors] = useState<Colors>(FALLBACK);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    setColors({
      series: [1, 2, 3, 4, 5].map((i) => read(`--tim-chart-${i}`, FALLBACK.series[i - 1])),
      violet: read("--tim-chart-violet", FALLBACK.violet),
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

export const monthLabel = (iso: string, long = false) =>
  new Date(iso).toLocaleDateString("fr-FR", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" });

/** Ticks d'axe en € compacts : 1 200 → « 1,2 k€ ». */
export const compactEur = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€` : `${v} €`);

type TipRow = { name: string; value: number; color: string };
type TipPayload = readonly { name?: string | number; value?: number | string | readonly (number | string)[]; color?: string; fill?: string }[];

/** Infobulle commune : le mois en titre, puis une ligne par série, la valeur en gras. */
export function Tip({ active, label, payload, title, unit = "eur" }: { active?: boolean; label?: string | number; payload?: TipPayload; title?: string; unit?: "eur" | "int" | "days" }) {
  if (!active || !payload?.length) return null;
  const rows: TipRow[] = payload.map((p) => ({ name: String(p.name ?? ""), value: Number(p.value ?? 0), color: p.color ?? p.fill ?? "" }));
  const fmt = (v: number) => (unit === "eur" ? eur.format(v) : unit === "days" ? `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j` : v.toLocaleString("fr-FR"));
  return (
    <div className="an-tip">
      <div className="an-tip__title">{title ?? String(label ?? "")}</div>
      {rows.map((r) => (
        <div key={r.name} className="an-tip__row">
          <span className="an-tip__key" style={{ background: r.color }} />
          <span className="an-tip__value">{fmt(r.value)}</span>
          <span className="an-tip__name">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

export const axisStyle = (c: Colors) => ({ fontSize: 11, fill: c.textMuted });

/* ─── Le dessin commun à tous les graphiques (accueil compris) ───────────────
   Bâtons en DÉGRADÉ de leur couleur — franc à l'extrémité qui porte la valeur,
   presque effacé à la base : c'est la masse qui compte, pas l'aplat ; coins
   6 px ; grille pointillée sans axe tracé ; lignes fines à points évidés ;
   légende à puces rondes. Un seul endroit pour ces réglages : un graphique de
   plus reprend ces briques, il ne les réinvente pas. */

/** Les `<defs>` de dégradés, un par couleur. `horizontal` pour les barres couchées. */
export function Gradients({ entries, horizontal = false }: { entries: { id: string; color: string }[]; horizontal?: boolean }) {
  return (
    <defs>
      {entries.map((e) => (
        <linearGradient key={e.id} id={e.id} x1="0" y1="0" x2={horizontal ? "1" : "0"} y2={horizontal ? "0" : "1"}>
          {horizontal ? (
            <>
              <stop offset="0%" stopColor={e.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={e.color} stopOpacity={0.95} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={e.color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={e.color} stopOpacity={0.18} />
            </>
          )}
        </linearGradient>
      ))}
    </defs>
  );
}

export const gradientId = (scope: string, key: string | number) => `an-grad-${scope}-${String(key).replace(/[^a-z0-9_-]/gi, "")}`;
export const gradientFill = (id: string) => `url(#${id})`;

/** Coins arrondis des bâtons : debout, puis couchés. */
export const BAR_RADIUS: [number, number, number, number] = [6, 6, 0, 0];
export const HBAR_RADIUS: [number, number, number, number] = [0, 6, 6, 0];

/** Grille pointillée, horizontale seulement (ou verticale pour les barres couchées). */
export const gridProps = (c: Colors, horizontalBars = false) =>
  horizontalBars
    ? { stroke: c.grid, strokeDasharray: "3 4", horizontal: false }
    : { stroke: c.grid, strokeDasharray: "3 4", vertical: false };

/** Point évidé : anneau de la couleur de la série, cœur blanc. */
export const lineDot = (c: Colors, color: string) => ({ r: 3.5, fill: c.surface, stroke: color, strokeWidth: 2 });
export const lineActiveDot = (c: Colors, color: string) => ({ r: 6, fill: color, stroke: c.surface, strokeWidth: 2 });
export const LINE_WIDTH = 2.25;

/** Légende à puces rondes, en texte atténué. */
export const legendProps = (c: Colors) => ({ iconType: "circle" as const, iconSize: 8, wrapperStyle: { fontSize: 12, color: c.textMuted, paddingTop: 8 } });

/* ─── CA mensuel : attendu (fiches) vs facturé (Pennylane) ───────────────── */

export function RevenueChart({ data }: { data: MonthPoint[] }) {
  const c = useChartColors();
  const rows = data.map((p) => ({ ...p, label: monthLabel(p.month), long: monthLabel(p.month, true) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="35%">
        <Gradients entries={[{ id: gradientId("revenue", 1), color: c.series[1] }]} />
        <CartesianGrid {...gridProps(c)} />
        <XAxis dataKey="label" tick={axisStyle(c)} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={axisStyle(c)} axisLine={false} tickLine={false} tickFormatter={compactEur} width={64} />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.6 }}
          content={(p) => <Tip {...p} title={p.payload?.[0]?.payload?.long} />}
        />
        <Legend {...legendProps(c)} />
        <Bar name="Facturé par Pennylane (HT)" dataKey="invoiced" fill={gradientFill(gradientId("revenue", 1))} radius={BAR_RADIUS} maxBarSize={24} isAnimationActive />
        <Area
          name="Attendu d'après les fiches (HT / mois)"
          type="monotone"
          dataKey="expected"
          stroke={c.series[0]}
          strokeWidth={LINE_WIDTH}
          fill={c.series[0]}
          fillOpacity={0.08}
          dot={lineDot(c, c.series[0])}
          activeDot={lineActiveDot(c, c.series[0])}
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
        <Gradients horizontal entries={rows.map((r) => ({ id: gradientId("profile", r.key), color: c.series[PROFILE_SLOT[r.key]] }))} />
        <CartesianGrid {...gridProps(c, true)} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: c.text }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: c.grid, opacity: 0.6 }} content={(p) => <Tip {...p} />} />
        <Bar name="CA HT / mois" dataKey="caHT" radius={HBAR_RADIUS} maxBarSize={22}>
          {rows.map((r) => (
            <Cell key={r.key} fill={gradientFill(gradientId("profile", r.key))} />
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
        <Gradients horizontal entries={[{ id: gradientId("partner", 0), color: c.series[0] }]} />
        <CartesianGrid {...gridProps(c, true)} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: c.text }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: c.grid, opacity: 0.6 }} content={(p) => <Tip {...p} />} />
        <Bar name="CA HT / mois apporté" dataKey="caHT" fill={gradientFill(gradientId("partner", 0))} radius={HBAR_RADIUS} maxBarSize={22}>
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
        <Gradients entries={[{ id: gradientId("aging", 0), color: c.series[0] }]} />
        <CartesianGrid {...gridProps(c)} />
        <XAxis dataKey="label" tick={axisStyle(c)} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={axisStyle(c)} axisLine={false} tickLine={false} tickFormatter={compactEur} width={64} />
        <Tooltip cursor={{ fill: c.grid, opacity: 0.6 }} content={(p) => <Tip {...p} />} />
        <Bar name="Reste dû TTC" dataKey="caHT" fill={gradientFill(gradientId("aging", 0))} radius={BAR_RADIUS} maxBarSize={24}>
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

/* ─── Séries mensuelles génériques (comptes) ─────────────────────────────── */

export type Series = { key: string; label: string; kind?: "bar" | "line" };

/**
 * Plusieurs comptes par mois sur un seul axe : barres (créés, résolus…) et
 * lignes. Couleur par ORDRE de déclaration des séries, fixe — jamais par rang.
 */
export function MonthlyChart({ data, series, stacked = false, height = 240 }: { data: ({ month: string } & Record<string, number | string>)[]; series: Series[]; stacked?: boolean; height?: number }) {
  const c = useChartColors();
  const rows = data.map((p) => ({ ...p, label: monthLabel(p.month), long: monthLabel(p.month, true) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="35%">
        <Gradients entries={series.map((s, i) => ({ id: gradientId("monthly", s.key), color: c.series[i % 5] }))} />
        <CartesianGrid {...gridProps(c)} />
        <XAxis dataKey="label" tick={axisStyle(c)} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={axisStyle(c)} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
        <Tooltip cursor={{ fill: c.grid, opacity: 0.6 }} content={(p) => <Tip {...p} unit="int" title={p.payload?.[0]?.payload?.long} />} />
        {series.length > 1 && <Legend {...legendProps(c)} />}
        {series.map((s, i) =>
          s.kind === "line" ? (
            <Line key={s.key} name={s.label} type="monotone" dataKey={s.key} stroke={c.series[i % 5]} strokeWidth={LINE_WIDTH} dot={lineDot(c, c.series[i % 5])} activeDot={lineActiveDot(c, c.series[i % 5])} />
          ) : (
            // Empilé : le dégradé n'a de sens que sur le segment du haut, les
            // autres gardent leur aplat — sinon la pile se lit comme des trous.
            <Bar
              key={s.key}
              name={s.label}
              dataKey={s.key}
              fill={stacked && i < series.length - 1 ? c.series[i % 5] : gradientFill(gradientId("monthly", s.key))}
              stackId={stacked ? "s" : undefined}
              radius={stacked && i < series.length - 1 ? 0 : BAR_RADIUS}
              maxBarSize={24}
            />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ─── Comptes par catégorie : barres horizontales, une seule teinte ──────── */

export function CountBars({ data, unit = "int", colorByKey }: { data: { key: string; label: string; count: number; color?: string }[]; unit?: "int" | "days"; colorByKey?: boolean }) {
  const c = useChartColors();
  const rows = data.filter((d) => d.count > 0);
  if (!rows.length) return <p className="an-empty">Rien sur cette période.</p>;
  const fmt = (v: unknown) => (unit === "days" ? `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j` : Number(v).toLocaleString("fr-FR"));
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 36 + 24)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap="30%">
        <Gradients
          horizontal
          entries={colorByKey ? rows.map((r) => ({ id: gradientId("count", r.key), color: r.color ?? c.series[0] })) : [{ id: gradientId("count", "all"), color: c.series[0] }]}
        />
        <CartesianGrid {...gridProps(c, true)} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 12, fill: c.text }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: c.grid, opacity: 0.6 }} content={(p) => <Tip {...p} unit={unit} />} />
        <Bar name={unit === "days" ? "Jours" : "Nombre"} dataKey="count" fill={gradientFill(gradientId("count", "all"))} radius={HBAR_RADIUS} maxBarSize={20}>
          {colorByKey && rows.map((r) => <Cell key={r.key} fill={gradientFill(gradientId("count", r.key))} />)}
          <LabelList dataKey="count" position="right" formatter={fmt} style={{ fontSize: 12, fill: c.text }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Entonnoir : « au moins jusqu'ici », avec le taux de passage ────────── */

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.reached), 1);
  return (
    <ol className="an-funnel">
      {steps.map((s, i) => (
        <li key={s.key} className="an-funnel__step" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="an-funnel__head">
            <span className="an-funnel__label">
              <span className="an-funnel__dot" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="an-funnel__values">
              <strong>{s.reached}</strong>
              {s.fromPrevious != null && <span className="an-funnel__rate">{s.fromPrevious} % de l'étape précédente</span>}
              <span className="an-funnel__total">{s.fromStart} % du départ</span>
            </span>
          </div>
          <div className="an-funnel__track">
            {/* La couleur de l'étape (celle du Kanban), adoucie : un aplat plein serait trop lourd. */}
            <span
              className="an-funnel__bar"
              style={{ width: `${(s.reached / max) * 100}%`, background: `color-mix(in srgb, ${s.color} 55%, var(--tim-white))` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ─── Flux entre étapes (Sankey) ─────────────────────────────────────────── */

/**
 * Chaque passage d'étape, d'où il part et où il va. Les nœuds portent la
 * couleur de leur étape (celle du Kanban) ; chaque flux prend la couleur de
 * l'étape d'où il part, adoucie, et s'accentue au survol. Les libellés se
 * placent à droite du nœud, ou à gauche quand on approche du bord.
 * Sous le dessin, la même information en liste : les passages les plus
 * fréquents, lisibles sans survol.
 */
export function FlowChart({ nodes, links, backward = 0 }: { nodes: FlowNode[]; links: FlowLink[]; backward?: number }) {
  const c = useChartColors();
  if (!links.length) return <p className="an-empty">Aucun passage d'étape enregistré sur cette période.</p>;
  const index = new Map(nodes.map((n, i) => [n.key, i]));
  const data = {
    nodes: nodes.map((n) => ({ name: n.label, color: n.color })),
    links: links
      .filter((l) => index.has(l.from) && index.has(l.to) && l.from !== l.to)
      .map((l) => ({ source: index.get(l.from)!, target: index.get(l.to)!, value: l.count })),
  };
  const labelOf = (key: string) => nodes.find((n) => n.key === key)?.label ?? key;
  const colorOf = (key: string) => nodes.find((n) => n.key === key)?.color ?? c.muted;
  return (
    <div className="an-flow">
      <ResponsiveContainer width="100%" height={Math.max(280, nodes.length * 46)}>
        <Sankey
          data={data}
          nodePadding={30}
          nodeWidth={12}
          iterations={48}
          margin={{ top: 16, right: 24, bottom: 16, left: 8 }}
          link={<FlowLinkShape />}
          node={<FlowNodeShape textColor={c.text} mutedColor={c.textMuted} />}
        >
          <Tooltip content={(p) => <FlowTip payload={p.payload as unknown as FlowTipPayload} />} />
        </Sankey>
      </ResponsiveContainer>
      <ol className="an-flow__list">
        {links.slice(0, 8).map((l) => (
          <li key={`${l.from}-${l.to}`}>
            <span className="an-flow__swatch" style={{ background: colorOf(l.from) }} />
            <span className="an-flow__path">
              {labelOf(l.from)} <span className="an-muted">→</span> {labelOf(l.to)}
            </span>
            <strong className="an-flow__count">{l.count}</strong>
          </li>
        ))}
      </ol>
      {backward > 0 && (
        <p className="an-flow__note an-muted">
          {backward} retour{backward > 1 ? "s" : ""} en arrière (une fiche redescendue d&apos;une étape) non tracé{backward > 1 ? "s" : ""} : le
          diagramme ne montre que les passages vers l&apos;avant.
        </p>
      )}
    </div>
  );
}

function FlowNodeShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  containerWidth?: number;
  payload?: { name?: string; color?: string; value?: number };
  textColor: string;
  mutedColor: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, containerWidth = 0, payload, textColor, mutedColor } = props;
  // Près du bord droit, le libellé passe à gauche du nœud pour ne pas être coupé.
  const flip = containerWidth > 0 && x + width + 160 > containerWidth;
  const tx = flip ? x - 8 : x + width + 8;
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, 2)} rx={3} fill={payload?.color ?? "currentColor"} />
      <text x={tx} y={y + height / 2} dy={-2} fontSize={12} fontWeight={700} fill={textColor} textAnchor={flip ? "end" : "start"}>
        {payload?.name}
      </text>
      <text x={tx} y={y + height / 2} dy={12} fontSize={11} fill={mutedColor} textAnchor={flip ? "end" : "start"}>
        {payload?.value} fiche{(payload?.value ?? 0) > 1 ? "s" : ""}
      </text>
    </g>
  );
}

/** Un flux : la couleur de son étape de départ, adoucie ; pleine au survol. */
function FlowLinkShape(props: {
  sourceX?: number;
  sourceY?: number;
  sourceControlX?: number;
  targetX?: number;
  targetY?: number;
  targetControlX?: number;
  linkWidth?: number;
  payload?: { source?: { color?: string } };
}) {
  const [hover, setHover] = useState(false);
  const { sourceX = 0, sourceY = 0, sourceControlX = 0, targetX = 0, targetY = 0, targetControlX = 0, linkWidth = 0, payload } = props;
  const color = payload?.source?.color ?? "currentColor";
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(linkWidth, 1.5)}
      strokeOpacity={hover ? 0.7 : 0.3}
      style={{ transition: "stroke-opacity 0.15s ease" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    />
  );
}

type FlowTipPayload = readonly { payload?: { source?: { name?: string }; target?: { name?: string }; name?: string; value?: number } }[] | undefined;

function FlowTip({ payload }: { payload?: FlowTipPayload }) {
  const p = payload?.[0]?.payload;
  if (!p) return null;
  const isLink = p.source && p.target;
  return (
    <div className="an-tip">
      <div className="an-tip__title">{isLink ? `${p.source?.name} → ${p.target?.name}` : p.name}</div>
      <div className="an-tip__row">
        <span className="an-tip__value">{p.value}</span>
        <span className="an-tip__name">{isLink ? "passage" : "fiche"}{(p.value ?? 0) > 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
