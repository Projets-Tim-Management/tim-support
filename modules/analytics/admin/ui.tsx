import Link from "next/link";

import type { Delta } from "@/modules/analytics/lib/growth";

/**
 * Les briques communes aux écrans « Analyses » : la coquille (titre, onglets
 * entre les pages, filtre de période), les tuiles, les cartes, le % signé.
 * Server-safe : aucun état, aucune fonction en props.
 */

const ANALYTICS_PAGES = [
  { key: "facturation", label: "Facturation", href: "/admin/analyses/facturation" },
  { key: "pipeline", label: "Clients & pipeline", href: "/admin/analyses/pipeline" },
  { key: "acquisition", label: "Acquisition", href: "/admin/analyses/acquisition" },
  { key: "videos", label: "Vidéos", href: "/admin/analyses/videos" },
  { key: "support", label: "Support", href: "/admin/analyses/support" },
  { key: "developpements", label: "Développements", href: "/admin/analyses/developpements" },
  { key: "partenaires", label: "Partenaires", href: "/admin/analyses/partenaires" },
] as const;

export type AnalyticsPage = (typeof ANALYTICS_PAGES)[number]["key"];

const PERIODS = [
  { months: 3, label: "3 mois" },
  { months: 6, label: "6 mois" },
  { months: 12, label: "12 mois" },
  { months: 24, label: "24 mois" },
] as const;

/** Le paramètre `?p=` lu, borné aux périodes connues (12 mois à défaut). */
export function periodFrom(sp: Record<string, string | string[] | undefined> | undefined, fallback = 12): number {
  const raw = sp?.p;
  const asked = Number(Array.isArray(raw) ? raw[0] : raw);
  return PERIODS.some((p) => p.months === asked) ? asked : fallback;
}

export function Shell({ page, title, children }: { page: AnalyticsPage; title: string; children: React.ReactNode }) {
  return (
    <div className="an">
      <header className="an-head">
        <h1 className="an-title">{title}</h1>
        <nav className="an-pages" aria-label="Analyses">
          {ANALYTICS_PAGES.map((p) => (
            <Link key={p.key} href={p.href} prefetch={false} className={`an-page${p.key === page ? " an-page--on" : ""}`}>
              {p.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

export function PeriodFilter({ page, months }: { page: AnalyticsPage; months: number }) {
  const href = ANALYTICS_PAGES.find((p) => p.key === page)!.href;
  return (
    <nav className="an-filters" aria-label="Période">
      {PERIODS.map((p) => (
        <Link key={p.months} href={`${href}?p=${p.months}`} prefetch={false} className={`an-filter${p.months === months ? " an-filter--on" : ""}`}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/** Un pourcentage signé, coloré par sa direction : vert ça monte, rouge ça baisse. */
export function Pct({ d, title, goodWhenUp = true }: { d: Delta; title?: string; goodWhenUp?: boolean }) {
  if (d.pct == null) return <span className="an-pct an-pct--none" title="Pas de période précédente">—</span>;
  const up = d.pct > 0;
  const dir = d.pct === 0 ? "flat" : up === goodWhenUp ? "up" : "down";
  return (
    <span className={`an-pct an-pct--${dir}`} title={title}>
      {d.pct > 0 ? "▲" : d.pct < 0 ? "▼" : "•"} {d.pct > 0 ? "+" : ""}
      {d.pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
    </span>
  );
}

export function Tile({
  icon,
  label,
  value,
  sub,
  tone,
  delta,
  deltaTitle = "vs période précédente",
  goodWhenUp,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "bad";
  /** Variation vs période précédente, affichée à côté de la valeur. */
  delta?: Delta;
  /** Infobulle de la variation : face à quoi elle se mesure. */
  deltaTitle?: string;
  /** false : une hausse est une mauvaise nouvelle (tickets, impayés). */
  goodWhenUp?: boolean;
}) {
  return (
    <div className={`an-tile${tone ? ` an-tile--${tone}` : ""}`}>
      <span className="an-tile__icon" aria-hidden>
        {icon}
      </span>
      <span className="an-tile__text">
        <span className="an-tile__value">
          {value}
          {delta && <Pct d={delta} title={deltaTitle} goodWhenUp={goodWhenUp} />}
        </span>
        <span className="an-tile__label">{label}</span>
        {sub && <span className="an-tile__sub">{sub}</span>}
      </span>
    </div>
  );
}

export function Card({ title, sub, children, wide }: { title: string; sub?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`an-card${wide ? " an-card--wide" : ""}`}>
      <header className="an-card__head">
        <h2 className="an-card__title">{title}</h2>
        {sub && <p className="an-card__sub">{sub}</p>}
      </header>
      {children}
    </section>
  );
}

export const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";

/** Une durée en jours, lisible : « 3,5 j », « 2 h ». */
export const fmtDays = (days: number | null | undefined) => {
  if (days == null) return "—";
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${days.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`;
};

export const clientHref = (id: number | string) => `/admin/collections/partner-clients/${id}`;

/* ─── Tableau de bord : grands chiffres, barres, sections repliées ───────── */

export type Tone = "blue" | "red" | "green" | "slate" | "amber";

/** Une mini-courbe sans axe : la forme de la période, d'un coup d'œil. Les trous (null) coupent la ligne. */
export function Sparkline({ values, tone }: { values: (number | null)[]; tone: Tone }) {
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return null;
  const [w, h, pad] = [120, 32, 3];
  const min = Math.min(0, ...known);
  const max = Math.max(...known);
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const segments: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segments.push(cur.join(" "));
      cur = [];
    } else cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(" "));
  const lastI = values.findLastIndex((v) => v != null);
  return (
    <svg className={`an-spark an-spark--${tone}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      {min < 0 && <line className="an-spark__zero" x1={0} x2={w} y1={y(0)} y2={y(0)} />}
      {segments.map((pts) => (
        <polyline key={pts} points={pts} />
      ))}
      {/* Un trait de longueur nulle à bout rond : un point qui reste rond quand le dessin s'étire. */}
      <line className="an-spark__end" x1={x(lastI)} x2={x(lastI)} y1={y(values[lastI]!)} y2={y(values[lastI]!)} />
    </svg>
  );
}

/** Un grand chiffre : son nom, sa valeur, sa variation, sa forme dans le temps. */
export function Kpi({
  tone,
  label,
  value,
  delta,
  deltaTitle,
  goodWhenUp,
  sub,
  spark,
  alert,
  children,
}: {
  tone: Tone;
  /** Valeur à surveiller (une perte) : le chiffre passe en rouge. */
  alert?: boolean;
  label: string;
  value: string;
  delta?: Delta;
  deltaTitle?: string;
  goodWhenUp?: boolean;
  sub?: string;
  spark?: (number | null)[];
  children?: React.ReactNode;
}) {
  return (
    <div className={`an-kpi an-kpi--${tone}${alert ? " an-kpi--alert" : ""}`}>
      <span className="an-kpi__label">
        <span className="an-kpi__dot" aria-hidden />
        {label}
      </span>
      <span className="an-kpi__value">{value}</span>
      <span className="an-kpi__meta">
        {delta && delta.pct != null && <Pct d={delta} title={deltaTitle} goodWhenUp={goodWhenUp} />}
        {sub && <span className="an-kpi__sub">{sub}</span>}
      </span>
      {children}
      {spark && <Sparkline values={spark} tone={tone} />}
    </div>
  );
}

/** Une jauge 0–100 % : la marge, un taux. */
export function Meter({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className="an-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <span className="an-meter__track">
        <span className="an-meter__fill" style={{ width: `${clamped}%` }} />
      </span>
      <span className="an-meter__label">{label}</span>
    </span>
  );
}

export type BarItem = { key: string; label: string; value: number; sub?: string; delta?: Delta; href?: string; strong?: boolean; /** Un regroupement (« Autres ») : en gris, il ne doit pas attirer l'œil. */ muted?: boolean };

/**
 * Des barres horizontales, de la plus grosse à la plus petite : ce que pèse
 * chaque poste, chaque client. Une seule couleur (c'est une grandeur, pas une
 * identité) ; `strong` met en avant ce qui compte (l'acquisition).
 */
export function BarList({
  items,
  tone,
  goodWhenUp = true,
  deltaTitle,
  empty,
  unit = "eur",
  showShare = true,
}: {
  items: BarItem[];
  tone: Tone;
  goodWhenUp?: boolean;
  deltaTitle?: string;
  empty?: string;
  /** Des euros (défaut) ou un nombre (lectures, demandes…). */
  unit?: "eur" | "int";
  /** La part de chaque barre dans le total ; à masquer quand les barres ne s'additionnent pas (une rétention). */
  showShare?: boolean;
}) {
  const fmt = (v: number) => (unit === "eur" ? eurFormat(v) : v.toLocaleString("fr-FR"));
  const max = Math.max(0, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!items.length || !max) return <p className="an-empty">{empty ?? "Rien sur cette période."}</p>;
  return (
    <ul className={`an-bars an-bars--${tone}`}>
      {items.map((i) => (
        <li key={i.key} className={`an-bars__row${i.strong ? " an-bars__row--strong" : ""}${i.muted ? " an-bars__row--muted" : ""}`}>
          <span className="an-bars__head">
            {i.href ? (
              <Link href={i.href} prefetch={false} className="an-bars__label">
                {i.label}
              </Link>
            ) : (
              <span className="an-bars__label">{i.label}</span>
            )}
            <span className="an-bars__value">
              {fmt(i.value)}
              {showShare && <span className="an-bars__share">{Math.round((i.value / total) * 100)} %</span>}
            </span>
          </span>
          <span className="an-bars__track" title={`${i.label} · ${fmt(i.value)}`}>
            <span className="an-bars__fill" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          {(i.sub || (i.delta && i.delta.pct != null)) && (
            <span className="an-bars__foot">
              {i.sub && <span>{i.sub}</span>}
              {i.delta && i.delta.pct != null && <Pct d={i.delta} title={deltaTitle} goodWhenUp={goodWhenUp} />}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const eurFormat = (v: number) => v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Une section repliée : le détail est là, mais ne prend pas la place. */
export function Fold({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <details className="an-fold">
      <summary className="an-fold__summary">
        <span className="an-fold__title">{title}</span>
        {sub && <span className="an-fold__sub">{sub}</span>}
      </summary>
      <div className="an-fold__body">{children}</div>
    </details>
  );
}
