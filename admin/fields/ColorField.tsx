"use client";

import { FieldDescription, FieldError, FieldLabel, useField } from "@payloadcms/ui";

import { HEX } from "@/core/lib/brand";

/**
 * Champ couleur : le code #RRGGBB, précédé d'une pastille ronde qui montre la
 * couleur. Cliquer la pastille ouvre le sélecteur de couleur du navigateur.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ColorField(props: any) {
  const path: string = props?.path ?? props?.field?.name;
  const label = props?.field?.label ?? props?.field?.name;
  const description = props?.field?.admin?.description;
  const placeholder: string = props?.field?.admin?.placeholder ?? "#000000";
  const readOnly = Boolean(props?.readOnly);
  const { value, setValue, showError, errorMessage } = useField<string>({ path });

  // Même identifiant que les champs natifs de Payload : le libellé y renvoie.
  const inputId = `field-${path.replace(/\./g, "__")}`;
  const current = typeof value === "string" ? value : "";
  const valid = HEX.test(current);

  return (
    <div className={`field-type color-field${showError ? " error" : ""}`}>
      <FieldLabel htmlFor={inputId} label={label} path={path} required={props?.field?.required} />
      <div className="color-field__row">
        <label
          className={`color-field__swatch${valid ? "" : " color-field__swatch--empty"}`}
          style={valid ? { background: current } : undefined}
          title="Choisir une couleur"
        >
          <input
            type="color"
            value={valid ? current : placeholder}
            disabled={readOnly}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`${typeof label === "string" ? label : "Couleur"} — sélecteur`}
          />
        </label>
        <input
          id={inputId}
          className="color-field__input"
          value={current}
          placeholder={placeholder}
          readOnly={readOnly}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value.trim())}
        />
      </div>
      {showError ? <FieldError message={errorMessage} path={path} showError /> : null}
      {description ? <FieldDescription description={description} path={path} /> : null}
    </div>
  );
}
