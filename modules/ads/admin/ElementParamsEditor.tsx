"use client";

import { useField, useFormFields } from "@payloadcms/ui";

import { paramSpecs, type ParamSpec } from "@/modules/ads/video/element-params";
import { isElementType } from "@/modules/ads/video/elements";

/**
 * Les réglages d'un élément (atelier des éléments), générés depuis le contrat
 * (element-params.ts) : une liste pour un choix, un curseur pour un nombre,
 * une case pour oui / non. Ce qui diffère du défaut est marqué, et se remet au
 * défaut d'un clic. Enregistrer crée une nouvelle version et relance l'aperçu.
 */
type Params = Record<string, string | number | boolean>;

export function ElementParamsEditor() {
  const base = useFormFields(([f]) => f?.base?.value as string | undefined);
  const { value, setValue } = useField<Params | null>({ path: "params" });
  if (!isElementType(base)) return null;
  const params: Params = value && typeof value === "object" ? value : {};
  const set = (k: string, v: string | number | boolean | undefined) => {
    const next = { ...params };
    if (v === undefined) delete next[k];
    else next[k] = v;
    setValue(next);
  };
  const specs = paramSpecs(base);
  return (
    <section className="ads-elparams" aria-label="Réglages">
      <h4 className="ads-elparams__title">Réglages</h4>
      <p className="ads-elparams__hint">Changer un réglage puis enregistrer crée une nouvelle version (l&apos;ancienne reste restaurable) et relance l&apos;aperçu.</p>
      <div className="ads-elparams__grid">
        {specs.map((s) => (
          <Control key={s.key} spec={s} value={params[s.key]} onChange={(v) => set(s.key, v)} />
        ))}
      </div>
    </section>
  );
}

function Control({ spec, value, onChange }: { spec: ParamSpec; value: string | number | boolean | undefined; onChange: (v: string | number | boolean | undefined) => void }) {
  const custom = value !== undefined && value !== spec.defaut;
  const shown = value ?? spec.defaut;
  return (
    <label className={`ads-elparams__item${custom ? " ads-elparams__item--custom" : ""}`}>
      <span className="ads-elparams__label">
        {spec.label}
        {custom && (
          <button type="button" className="ads-elparams__reset" onClick={() => onChange(undefined)} title={`Remettre le défaut (${String(spec.defaut)})`}>
            défaut
          </button>
        )}
      </span>
      {spec.kind === "choix" && (
        <select value={String(shown)} onChange={(e) => onChange(e.target.value)}>
          {spec.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {spec.kind === "nombre" && (
        <span className="ads-elparams__range">
          <input type="range" min={spec.min} max={spec.max} step={(spec.max - spec.min) / 40} value={Number(shown)} onChange={(e) => onChange(Number(e.target.value))} />
          <output>{Math.round(Number(shown) * 100) / 100}</output>
        </span>
      )}
      {spec.kind === "oui-non" && <input type="checkbox" checked={Boolean(shown)} onChange={(e) => onChange(e.target.checked)} />}
      {spec.aide && <small>{spec.aide}</small>}
    </label>
  );
}
