"use client";

import { useField } from "@payloadcms/ui";

import { PALETTE } from "@/modules/dev/lib/devMeta";

/**
 * Choix de la couleur d'un statut : des pastilles à cliquer, pas une liste
 * déroulante. On choisit une couleur en la voyant.
 */
type Props = { field?: { label?: unknown }; path?: string; readOnly?: boolean };

export const PaletteColorField = (props: Props) => {
  const path = props.path ?? "color";
  const { value, setValue } = useField<string>({ potentiallyStalePath: path });
  const label = typeof props.field?.label === "string" ? props.field.label : "Couleur";

  return (
    <div className="field-type dev-swatches">
      <label className="dev-cfield__label">{label}</label>
      <div className="dev-swatches__row">
        {PALETTE.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            aria-label={c.label}
            aria-pressed={value === c.value}
            disabled={props.readOnly}
            className={`dev-swatch${value === c.value ? " dev-swatch--on" : ""}`}
            style={{ color: c.color, background: c.bg }}
            onClick={() => setValue(c.value)}
          >
            Aa
          </button>
        ))}
      </div>
    </div>
  );
};
