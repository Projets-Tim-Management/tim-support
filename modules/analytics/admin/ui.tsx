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
  goodWhenUp,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "bad";
  /** Variation vs période précédente, affichée à côté de la valeur. */
  delta?: Delta;
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
          {delta && <Pct d={delta} title="vs période précédente" goodWhenUp={goodWhenUp} />}
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
