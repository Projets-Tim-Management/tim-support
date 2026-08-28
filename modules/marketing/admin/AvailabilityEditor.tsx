"use client";

import { useField, useForm, useFormFields } from "@payloadcms/ui";
import { useMemo } from "react";

import {
  DEFAULT_HOURS,
  HOUR_OPTIONS,
  WEEKDAY_INITIALS,
  WEEKDAY_OPTIONS,
  type DateOverride,
  type TimeRange,
  type WeeklyHours,
} from "@/modules/marketing/lib/scheduling";

/**
 * Disponibilités du partenaire : semaine type et exceptions datées.
 *
 * Ce que remplaçait l'ancien écran — des jours cochés et UNE plage commune — ne
 * savait pas dire « lundi matin seulement ». Or c'est le cas courant : un
 * partenaire prend des rendez-vous entre deux chantiers, pas de neuf à dix-huit
 * heures. Il annonçait donc des disponibilités fausses, et se retrouvait à
 * décliner des créneaux qu'il avait lui-même publiés.
 *
 * Deux blocs, et l'ordre a un sens : la semaine ordinaire d'abord, ce qui la
 * contredit ensuite. Une exception REMPLACE la journée, elle ne s'y ajoute pas —
 * c'est ce qui permet aussi bien de fermer un jour férié que d'ouvrir un samedi.
 */
export function AvailabilityEditor() {
  const { value, setValue } = useField<WeeklyHours>({ path: "scheduling.hours" });
  const { dispatchFields } = useForm();
  const overridesField = useFormFields(([fields]) => fields["scheduling.dateOverrides"]?.value);

  const hours: WeeklyHours = useMemo(
    () => (value && Object.keys(value).length ? value : DEFAULT_HOURS),
    [value],
  );
  const overrides: DateOverride[] = useMemo(
    () => (Array.isArray(overridesField) ? (overridesField as DateOverride[]) : []),
    [overridesField],
  );

  const writeHours = (next: WeeklyHours) => setValue(next);
  const writeOverrides = (next: DateOverride[]) =>
    dispatchFields({ type: "UPDATE", path: "scheduling.dateOverrides", value: next });

  /** Plage ajoutée à la suite de la dernière, ou 09:00–12:00 sur un jour vide. */
  const nextRange = (list: TimeRange[]): TimeRange => {
    const last = list[list.length - 1];
    if (!last) return { start: "09:00", end: "12:00" };
    const [h] = last.end.split(":").map(Number);
    const from = Math.min(h + 1, 21);
    return { start: `${String(from).padStart(2, "0")}:00`, end: `${String(Math.min(from + 1, 22)).padStart(2, "0")}:00` };
  };

  const setDay = (day: string, ranges: TimeRange[]) => {
    const next = { ...hours };
    if (ranges.length) next[day] = ranges;
    else delete next[day];
    writeHours(next);
  };

  const setOverride = (index: number, patch: Partial<DateOverride>) =>
    writeOverrides(overrides.map((o, i) => (i === index ? { ...o, ...patch } : o)));

  return (
    <div className="tim-avail">
      <section className="tim-avail__block">
        <header className="tim-avail__head">
          <h4 className="tim-avail__title">Heures hebdomadaires</h4>
          <p className="tim-avail__hint">
            Les créneaux proposés au client sortent d&apos;ici. Un jour sans plage n&apos;est jamais
            proposé.
          </p>
        </header>

        <ul className="tim-avail__days">
          {WEEKDAY_OPTIONS.map(({ value: day, label }) => {
            const ranges = hours[day] ?? [];
            return (
              <li className="tim-avail__day" key={day}>
                <span className="tim-avail__initial" title={label}>
                  {WEEKDAY_INITIALS[day]}
                </span>

                <div className="tim-avail__ranges">
                  {ranges.length === 0 ? (
                    <span className="tim-avail__off">Indisponible</span>
                  ) : (
                    ranges.map((range, i) => (
                      <div className="tim-avail__range" key={i}>
                        <TimeSelect
                          value={range.start}
                          onChange={(v) =>
                            setDay(day, ranges.map((r, j) => (j === i ? { ...r, start: v } : r)))
                          }
                        />
                        <span className="tim-avail__dash">–</span>
                        <TimeSelect
                          value={range.end}
                          onChange={(v) =>
                            setDay(day, ranges.map((r, j) => (j === i ? { ...r, end: v } : r)))
                          }
                        />
                        <IconButton
                          label="Supprimer cette plage"
                          onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}
                        >
                          {CROSS}
                        </IconButton>
                      </div>
                    ))
                  )}
                </div>

                <div className="tim-avail__day-actions">
                  <IconButton
                    label={`Ajouter une plage le ${label.toLowerCase()}`}
                    onClick={() => setDay(day, [...ranges, nextRange(ranges)])}
                  >
                    {PLUS}
                  </IconButton>
                  {/* Recopier sur les autres jours ouverts : la semaine se saisit
                      une fois. Sans ce geste, cinq jours identiques se règlent
                      quinze fois. */}
                  {ranges.length > 0 && (
                    <IconButton
                      label="Appliquer ces horaires aux autres jours déjà ouverts"
                      onClick={() => {
                        const next: WeeklyHours = {};
                        for (const key of Object.keys(hours)) next[key] = ranges.map((r) => ({ ...r }));
                        next[day] = ranges;
                        writeHours(next);
                      }}
                    >
                      {COPY}
                    </IconButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tim-avail__block">
        <header className="tim-avail__head">
          <h4 className="tim-avail__title">Heures spécifiques à une date</h4>
          <p className="tim-avail__hint">
            Congés, jour férié, journée aménagée. Ce qui est indiqué ici remplace la semaine type
            pour cette date.
          </p>
        </header>

        {overrides.length === 0 && <p className="tim-avail__empty">Aucune exception.</p>}

        <ul className="tim-avail__dates">
          {overrides.map((override, index) => (
            <li className="tim-avail__date" key={index}>
              <input
                type="date"
                className="tim-avail__date-input"
                value={override.date ?? ""}
                onChange={(e) => setOverride(index, { date: e.target.value })}
              />

              <div className="tim-avail__ranges">
                {(override.ranges ?? []).length === 0 ? (
                  <span className="tim-avail__off">Journée fermée</span>
                ) : (
                  override.ranges.map((range, i) => (
                    <div className="tim-avail__range" key={i}>
                      <TimeSelect
                        value={range.start}
                        onChange={(v) =>
                          setOverride(index, {
                            ranges: override.ranges.map((r, j) => (j === i ? { ...r, start: v } : r)),
                          })
                        }
                      />
                      <span className="tim-avail__dash">–</span>
                      <TimeSelect
                        value={range.end}
                        onChange={(v) =>
                          setOverride(index, {
                            ranges: override.ranges.map((r, j) => (j === i ? { ...r, end: v } : r)),
                          })
                        }
                      />
                      <IconButton
                        label="Supprimer cette plage"
                        onClick={() =>
                          setOverride(index, { ranges: override.ranges.filter((_, j) => j !== i) })
                        }
                      >
                        {CROSS}
                      </IconButton>
                    </div>
                  ))
                )}
              </div>

              <div className="tim-avail__day-actions">
                <IconButton
                  label="Ajouter une plage ce jour-là"
                  onClick={() =>
                    setOverride(index, { ranges: [...(override.ranges ?? []), nextRange(override.ranges ?? [])] })
                  }
                >
                  {PLUS}
                </IconButton>
                <IconButton
                  label="Retirer cette exception"
                  onClick={() => writeOverrides(overrides.filter((_, i) => i !== index))}
                >
                  {TRASH}
                </IconButton>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="tim-avail__add"
          onClick={() => writeOverrides([...overrides, { date: "", ranges: [] }])}
        >
          {PLUS} Ajouter une date
        </button>
      </section>
    </div>
  );
}

/** Liste d'heures par demi-heure : évite un champ libre et ses fautes de frappe. */
function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="tim-avail__time" value={value} onChange={(e) => onChange(e.target.value)}>
      {/* Une valeur hors liste (héritée d'un ancien réglage) reste sélectionnable :
          elle serait sinon remplacée en silence par la première de la liste. */}
      {!HOUR_OPTIONS.some((o) => o.value === value) && value && (
        <option value={value}>{value}</option>
      )}
      {HOUR_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-label={label} className="tim-avail__icon" onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}

const svg = (paths: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {paths}
  </svg>
);
const PLUS = svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
const CROSS = svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
const COPY = svg(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>);
const TRASH = svg(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>);

export default AvailabilityEditor;
