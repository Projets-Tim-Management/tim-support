"use client";

import { useField } from "@payloadcms/ui";

import { ticketMeta } from "./ticket-meta";

/**
 * Champ « select » présenté comme un badge coloré (façon front), tout en
 * restant éditable (menu déroulant natif). Utilisé pour statut / priorité /
 * type / service de la collection Tickets. Libellés + couleurs partagés via
 * ticket-meta (mêmes pastilles dans le fil et la liste).
 */

type Option = { label: string; value: string } | string;
type Props = {
  field?: { name?: string; label?: unknown; options?: Option[] };
  path?: string;
  readOnly?: boolean;
};

export const ColoredSelectField = (props: Props) => {
  const name = props.field?.name ?? "";
  const path = props.path ?? name;
  const { value, setValue } = useField<string>({ potentiallyStalePath: path });
  const label = typeof props.field?.label === "string" ? props.field.label : name;
  const options = (props.field?.options ?? [])
    .map((o) => (typeof o === "string" ? { label: o, value: o } : o))
    // Statut « En attente » retiré de l'interface (conservé en base pour ne pas
    // recréer l'enum Postgres).
    .filter((o) => o.value !== "on_hold");
  const { fg, bg } = ticketMeta(name, value ?? "");

  return (
    <div className="field-type ticket-cfield">
      <label className="ticket-cfield__label">{label}</label>
      <span className="ticket-cselect" style={{ color: fg, background: bg }}>
        <select
          className="ticket-cselect__native"
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
        <span className="ticket-cselect__caret" aria-hidden="true">
          ▾
        </span>
      </span>
    </div>
  );
};
