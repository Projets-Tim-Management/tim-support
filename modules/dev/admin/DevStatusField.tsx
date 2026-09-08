"use client";

import { useField } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { paletteColor } from "@/modules/dev/lib/devMeta";
import { DEV_PHASES, type DevStatusDoc } from "@/modules/dev/lib/devStatus";

/**
 * Choix du statut d'un développement : une pastille colorée, éditable, dont les
 * options sont GROUPÉES PAR PHASE.
 *
 * Le sélecteur de relation natif de Payload aurait donné une liste plate d'une
 * vingtaine de noms, dans laquelle « En recette interne » et « En attente de
 * validation » se ressemblent. Groupées sous « Réalisation » et « Étude », elles
 * ne se confondent plus — et l'aide du statut choisi s'affiche juste dessous.
 */
type Props = { field?: { label?: unknown }; path?: string; readOnly?: boolean };

export const DevStatusField = (props: Props) => {
  const path = props.path ?? "status";
  const { value, setValue } = useField<number | string>({ potentiallyStalePath: path });
  const label = typeof props.field?.label === "string" ? props.field.label : "Statut";
  const [statuses, setStatuses] = useState<DevStatusDoc[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/payload-api/dev-statuses?limit=200&sort=position&depth=0", {
          credentials: "include",
        });
        const data = res.ok ? await res.json() : { docs: [] };
        if (active) setStatuses(Array.isArray(data?.docs) ? data.docs : []);
      } catch {
        if (active) setStatuses([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const current = statuses?.find((s) => String(s.id) === String(value));
  const { fg, bg } = paletteColor(current?.color);

  return (
    <div className="field-type dev-cfield">
      <label className="dev-cfield__label">{label}</label>
      <span className="dev-cselect" style={{ color: fg, background: bg }}>
        <select
          className="dev-cselect__native"
          value={value == null ? "" : String(value)}
          disabled={props.readOnly || statuses === null}
          onChange={(e) => setValue(e.target.value === "" ? null : Number(e.target.value) || e.target.value)}
        >
          {/* Tant que les statuts ne sont pas chargés, on affiche la valeur
              courante plutôt qu'un champ vide qui donnerait à croire à une perte. */}
          {statuses === null ? <option value={String(value ?? "")}>Chargement…</option> : null}
          {statuses !== null ? <option value="">— Aucun —</option> : null}
          {DEV_PHASES.map((phase) => {
            const options = (statuses ?? []).filter((s) => s.phase === phase.value);
            if (options.length === 0) return null;
            return (
              <optgroup key={phase.value} label={phase.label}>
                {options.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
          {/* Filet : un statut dont la phase aurait été supprimée reste
              sélectionnable au lieu de disparaître du menu. */}
          {(statuses ?? []).some((s) => !DEV_PHASES.find((p) => p.value === s.phase)) ? (
            <optgroup label="Sans phase">
              {(statuses ?? [])
                .filter((s) => !DEV_PHASES.find((p) => p.value === s.phase))
                .map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ) : null}
        </select>
        <span className="dev-cselect__caret" aria-hidden="true">
          ▾
        </span>
      </span>
      {current?.hint ? <p className="dev-cfield__hint">{current.hint}</p> : null}
    </div>
  );
};
