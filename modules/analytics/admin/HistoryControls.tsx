"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Le choix de la période de l'historique : sa durée (1, 3, 6 ou 12 mois), le
 * mois où elle finit, et la période à laquelle la comparer. Tout passe par
 * l'URL (`hd`, `hf`, `hc`) : le serveur recalcule, le lien se partage, et le
 * filtre du haut de page (`p`) reste intact.
 */
type Option = { value: string; label: string };

export function HistoryControls({
  durations,
  months,
  end,
  compare,
  endOptions,
  compareOptions,
}: {
  durations: readonly number[];
  months: number;
  end: string;
  compare: string;
  endOptions: Option[];
  compareOptions: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className={`an-period${pending ? " an-period--pending" : ""}`}>
      <div className="an-filters" role="group" aria-label="Durée">
        {durations.map((d) => (
          <button key={d} type="button" className={`an-filter${d === months ? " an-filter--on" : ""}`} aria-pressed={d === months} onClick={() => go({ hd: String(d) })}>
            {d} mois
          </button>
        ))}
      </div>
      <label className="an-period__field">
        <span className="an-period__label">Période</span>
        <select className="an-select" value={end} onChange={(e) => go({ hf: e.target.value })}>
          {endOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="an-period__field">
        <span className="an-period__label">Comparée à</span>
        <select className="an-select" value={compare} onChange={(e) => go({ hc: e.target.value })}>
          {compareOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
