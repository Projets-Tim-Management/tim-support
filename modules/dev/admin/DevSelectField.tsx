"use client";

import { useField } from "@payloadcms/ui";

import { devMeta } from "@/modules/dev/lib/devMeta";

/**
 * Champ « select » présenté comme une pastille colorée tout en restant éditable
 * (menu déroulant natif). Statut, type et priorité d'un développement.
 *
 * L'aide (`hint`) du choix courant s'affiche sous la pastille : avec 18 statuts,
 * le libellé seul ne dit pas toujours ce qui distingue « À l'étude » de « En
 * investigation ». On lit la nuance là où on choisit, pas dans une doc.
 */
type Option = { label: string; value: string } | string;
type Props = {
  field?: { name?: string; label?: unknown; options?: Option[] };
  path?: string;
  readOnly?: boolean;
};

export const DevSelectField = (props: Props) => {
  const name = props.field?.name ?? "";
  const path = props.path ?? name;
  const { value, setValue } = useField<string>({ potentiallyStalePath: path });
  const label = typeof props.field?.label === "string" ? props.field.label : name;
  const options = (props.field?.options ?? []).map((o) =>
    typeof o === "string" ? { label: o, value: o } : o,
  );
  const { fg, bg, hint } = devMeta(name, value ?? "");

  return (
    <div className="field-type dev-cfield">
      <label className="dev-cfield__label">{label}</label>
      <span className="dev-cselect" style={{ color: fg, background: bg }}>
        <select
          className="dev-cselect__native"
          value={value ?? ""}
          disabled={props.readOnly}
          onChange={(e) => setValue(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="dev-cselect__caret" aria-hidden="true">
          ▾
        </span>
      </span>
      {hint ? <p className="dev-cfield__hint">{hint}</p> : null}
    </div>
  );
};
