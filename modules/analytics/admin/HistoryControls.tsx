"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Les réglages de l'écran, sur une ligne, comme dans les outils d'analyse :
 * des raccourcis de période (cette année, 3, 6, 12 mois, tout), la vue qui la
 * découpe (mois, trimestre, semestre, année) et la comparaison. « Personnalisé »
 * ouvre le du… au… ; une comparaison personnalisée a les siens. Tout passe par
 * l'URL (`hv`, `hm`, `hd`, `hf`, `hc`, `hcd`, `hcf`) : le serveur recalcule et
 * le lien se partage.
 */
type Option = { value: string; label: string };

function useParamNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { go, pending, has: (k: string) => params.has(k) };
}

const shift = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function Select({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <label className="an-period__field">
      <span className="an-period__label">{label}</span>
      <select className="an-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Segmented({ label, value, options, onChange }: { label: string; value: string | null; options: readonly Option[]; onChange: (v: string) => void }) {
  return (
    <div className="an-period__field">
      <span className="an-period__label">{label}</span>
      <div className="an-filters" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" className={`an-filter${o.value === value ? " an-filter--on" : ""}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HistoryControls({
  views,
  view,
  start,
  end,
  compareOptions,
  compareMode,
  bStart,
  bEnd,
  monthOptions,
}: {
  views: readonly Option[];
  view: string;
  start: string;
  end: string;
  compareOptions: Option[];
  compareMode: string;
  bStart: string | null;
  bEnd: string | null;
  /** Du plus récent (le dernier mois facturé) au plus ancien. */
  monthOptions: Option[];
}) {
  const { go, pending, has } = useParamNav();
  const last = monthOptions[0]?.value ?? end;
  const first = monthOptions.at(-1)?.value ?? start;
  const presets = [
    { value: "annee", label: "Cette année", from: `${last.slice(0, 4)}-01` },
    { value: "3", label: "3 mois", from: shift(last, -2) },
    { value: "6", label: "6 mois", from: shift(last, -5) },
    { value: "12", label: "12 mois", from: shift(last, -11) },
    { value: "tout", label: "Tout", from: first },
  ].map((p) => ({ ...p, from: p.from < first ? first : p.from }));
  // Le raccourci allumé est celui qui correspond à la plage ; sinon c'est une plage personnalisée.
  const preset = end === last ? (presets.find((p) => p.from === start)?.value ?? null) : null;
  const custom = preset == null || has("perso");

  return (
    <div className={`an-period${pending ? " an-period--pending" : ""}`}>
      <Segmented
        label="Période"
        value={custom ? "perso" : preset}
        options={[...presets, { value: "perso", label: "Personnalisé" }]}
        onChange={(v) => {
          const p = presets.find((x) => x.value === v);
          go(p ? { hd: p.from, hf: last, perso: null } : { hd: start, hf: end, perso: "1" });
        }}
      />
      {custom && (
        <div className="an-period__group">
          <Select label="Du" value={start} options={monthOptions} onChange={(v) => go({ hd: v, hf: end, perso: "1" })} />
          <Select label="Au" value={end} options={monthOptions} onChange={(v) => go({ hd: start, hf: v, perso: "1" })} />
        </div>
      )}
      <Segmented label="Vue par" value={view} options={views} onChange={(v) => go({ hv: v })} />
      <div className="an-period__group">
        <Select
          label="Comparer à"
          value={compareMode}
          options={compareOptions}
          // « Personnalisée » part de la comparaison en cours : on l'ajuste ensuite.
          onChange={(v) => go(v === "perso" ? { hc: v, hcd: bStart, hcf: bEnd } : { hc: v, hcd: null, hcf: null })}
        />
        {compareMode === "perso" && (
          <>
            <Select label="Du" value={bStart ?? start} options={monthOptions} onChange={(v) => go({ hcd: v, hcf: bEnd })} />
            <Select label="Au" value={bEnd ?? end} options={monthOptions} onChange={(v) => go({ hcd: bStart, hcf: v })} />
          </>
        )}
      </div>
    </div>
  );
}

/** Des pastilles qui changent un paramètre de l'URL : ce que montre un graphique (CA, licences, bénéfice…). */
export function ParamChips({ param, value, options, label }: { param: string; value: string; options: readonly Option[]; label: string }) {
  const { go, pending } = useParamNav();
  return (
    <div className={`an-filters an-filters--small${pending ? " an-period--pending" : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`an-filter${o.value === value ? " an-filter--on" : ""}`} aria-pressed={o.value === value} onClick={() => go({ [param]: o.value })}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
