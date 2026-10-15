"use client";

import { useField, useFormFields } from "@payloadcms/ui";

import type { Palette } from "@/modules/ads/lib/style";
import { HEX_COLOR, isColorSpec, paramSpecs, VALIDATION_GREEN, type ParamSpec } from "@/modules/ads/video/element-params";
import { isElementType } from "@/modules/ads/video/elements";

import { useAtelierContext } from "./useAtelierContext";

/**
 * Les réglages d'un élément (atelier des éléments), générés depuis le contrat
 * (element-params.ts) : une liste pour un choix, un curseur pour un nombre,
 * une case pour oui / non. Ce qui diffère du défaut est marqué, et se remet au
 * défaut d'un clic. Enregistrer crée une nouvelle version et relance l'aperçu.
 */
type Params = Record<string, string | number | boolean>;

export function ElementParamsEditor() {
  const atelier = useAtelierContext();
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
          <Control key={s.key} spec={s} value={params[s.key]} onChange={(v) => set(s.key, v)} palette={atelier?.palette ?? null} />
        ))}
      </div>
    </section>
  );
}

/** La vraie couleur du kit derrière un rôle (« accent », « texte clair »…), pour la pastille. */
const swatch = (p: Palette, role: string): string | null =>
  ({ accent: p.accent, principale: p.primary, clair: p.lightBg, sombre: p.darkBg, "texte-clair": p.textOnDark, "texte-sombre": p.textOnLight, validation: VALIDATION_GREEN })[role] ?? null;
const ROLE_LABEL: Record<string, string> = { auto: "Auto", accent: "Accent", principale: "Principale", clair: "Fond clair", sombre: "Fond sombre", "texte-clair": "Texte clair", "texte-sombre": "Texte sombre", validation: "Vert de validation" };

function Control({ spec, value, onChange, palette }: { spec: ParamSpec; value: string | number | boolean | undefined; onChange: (v: string | number | boolean | undefined) => void; palette: Palette | null }) {
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
      {spec.kind === "choix" && isColorSpec(spec) && palette && (
        <span className="ads-elparams__swatches" role="radiogroup" aria-label={spec.label}>
          {spec.options.map((o) => {
            const c = swatch(palette, o);
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={shown === o}
                title={ROLE_LABEL[o] ?? o}
                className={`ads-elparams__swatch${shown === o ? " ads-elparams__swatch--on" : ""}`}
                style={c ? { background: c } : undefined}
                onClick={() => onChange(o)}
              >
                {o === "auto" ? "A" : ""}
              </button>
            );
          })}
          {/* La couleur personnalisée : hors charte, au choix de chacun. */}
          <label className={`ads-elparams__swatch ads-elparams__swatch--custom${HEX_COLOR.test(String(shown)) ? " ads-elparams__swatch--on" : ""}`} title="Personnalisée" style={HEX_COLOR.test(String(shown)) ? { background: String(shown) } : undefined}>
            <input type="color" value={HEX_COLOR.test(String(shown)) ? String(shown) : palette.accent} onChange={(e) => onChange(e.target.value)} aria-label={`${spec.label} : couleur personnalisée`} />
            {HEX_COLOR.test(String(shown)) ? "" : "+"}
          </label>
          <span className="ads-elparams__swatch-name">{HEX_COLOR.test(String(shown)) ? `Personnalisée ${String(shown)}` : (ROLE_LABEL[String(shown)] ?? String(shown))}</span>
        </span>
      )}
      {spec.kind === "choix" && !(isColorSpec(spec) && palette) && (
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
