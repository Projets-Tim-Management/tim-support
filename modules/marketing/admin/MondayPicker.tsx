"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * Sélecteur de date qui n'accepte QUE les lundis.
 *
 * Une grille de mois complète occupait beaucoup de place pour n'offrir que 4 ou
 * 5 cases cliquables : 30 jours affichés, 4 utiles. On liste donc directement
 * les lundis, groupés par mois (en-tête collant), et on fait défiler pour aller
 * plus loin dans le temps. Même contrainte, dix fois moins de place.
 *
 * Tout est calculé en UTC : passer par l'heure locale décalerait la liste d'un
 * jour en soirée sur un fuseau à l'est de Greenwich.
 */

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Nombre de lundis proposés (~6 mois) : au-delà, on ne planifie plus un test. */
const HORIZON = 26;

const iso = (d: Date) => d.toISOString().slice(0, 10);

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Écart lisible par rapport à aujourd'hui, pour situer un lundi d'un coup d'œil. */
const relative = (weeksFromNow: number): string => {
  if (weeksFromNow <= 0) return "cette semaine";
  if (weeksFromNow === 1) return "la semaine prochaine";
  return `dans ${weeksFromNow} semaines`;
};

export function MondayPicker({
  value,
  onChange,
  minDate,
  minReason,
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * Premier lundi qui laisse tout le temps de préparation prévu (`yyyy-mm-dd`).
   *
   * Les lundis ANTÉRIEURS restent CHOISISSABLES : démarrer plus tôt est une
   * décision commerciale légitime — un client pressé, une démo qui a convaincu.
   * On les marque « préparation réduite » et l'appelant affiche ce que ça
   * implique ; on ne décide pas à sa place.
   */
  minDate?: string;
  /** Ce que change un démarrage anticipé — affiché sous la liste. */
  minReason?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const mondays = useMemo(() => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    // Premier lundi à venir (aujourd'hui s'il l'est déjà).
    const first = new Date(today);
    first.setUTCDate(first.getUTCDate() + ((8 - first.getUTCDay()) % 7));

    const out: { key: string; date: Date; weeks: number }[] = [];
    for (let i = 0; i < HORIZON; i += 1) {
      const d = new Date(first);
      d.setUTCDate(first.getUTCDate() + i * 7);
      out.push({ key: iso(d), date: d, weeks: i });
    }

    // Une date déjà choisie hors horizon (parcours repris) doit rester visible.
    if (value && !out.some((m) => m.key === value)) {
      const d = new Date(`${value}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) out.unshift({ key: value, date: d, weeks: -1 });
    }
    return out;
  }, [value]);

  // Amène la sélection sous les yeux à l'ouverture, sans faire défiler la page.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-selected='true']");
    el?.scrollIntoView({ block: "center" });
  }, []);

  let currentMonth = "";

  return (
    <div className="jr-cal">
      <div className="jr-cal__list" ref={listRef} role="listbox" aria-label="Lundi de démarrage">
        {mondays.map(({ key, date, weeks }) => {
          const monthLabel = `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
          const newMonth = monthLabel !== currentMonth;
          if (newMonth) currentMonth = monthLabel;
          const selected = key === value;
          // Lundi plus proche que le délai de préparation : autorisé, mais
          // signalé — les étapes d'avant-test seront resserrées.
          const tight = Boolean(minDate) && key < minDate!;
          // Un lundi DÉJÀ PASSÉ, lui, n'a pas de sens : une phase de test ne
          // démarre pas hier.
          const past = key < todayISO();

          return (
            <div key={key}>
              {newMonth && <div className="jr-cal__month">{monthLabel}</div>}
              <button
                type="button"
                role="option"
                aria-selected={selected}
                data-selected={selected}
                disabled={past}
                onClick={() => onChange(key)}
                className={[
                  "jr-cal__row",
                  selected && "jr-cal__row--sel",
                  past && "jr-cal__row--off",
                  tight && !past && "jr-cal__row--tight",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="jr-cal__day">Lundi {date.getUTCDate()}</span>
                <span className="jr-cal__rel">
                  {past ? "passé" : tight ? "préparation réduite" : weeks >= 0 ? relative(weeks) : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {minReason && <p className="jr-cal__reason">{minReason}</p>}
    </div>
  );
}
