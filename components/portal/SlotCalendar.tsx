"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Le CHOIX d'un créneau : un mois, un jour, une heure.
 *
 * Partagé par les deux rendez-vous du parcours — la prise en main et le bilan.
 * Ils diffèrent par tout le reste (l'un demande qui sera formé et qui
 * l'accompagne, l'autre non) mais pas par ce geste-là : recopier le calendrier
 * aurait fait deux grilles à corriger, et l'une des deux serait restée en
 * arrière au premier ajustement.
 *
 * Il ne sait rien du parcours ni des messages : on lui donne des créneaux, il
 * rend celui qu'on a choisi. L'appelant décide de ce qui se passe ensuite.
 */

const parisDay = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

const longDay = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (day: string) => day.slice(0, 7);

/** Grille du mois, lundi en premier, avec les cases vides du début. */
function monthGrid(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // lundi = 0
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`),
  ];
}

export default function SlotCalendar({
  slots,
  onPick,
}: {
  slots: string[];
  onPick: (iso: string) => void;
}) {
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      const k = parisDay(s);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [slots]);

  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const months = useMemo(() => [...new Set(days.map(monthKey))].sort(), [days]);

  // Le calendrier s'ouvre sur le premier mois qui a des créneaux, pas sur le
  // mois courant : celui-ci peut n'en avoir aucun.
  useEffect(() => {
    if (!month && months.length) setMonth(months[0]);
  }, [month, months]);

  // Le jour choisi n'a plus de créneau — le partenaire vient d'occuper le
  // dernier : on le désélectionne plutôt que d'afficher une colonne vide.
  useEffect(() => {
    if (day && !byDay.has(day)) setDay(null);
  }, [byDay, day]);

  const grid = month ? monthGrid(month) : [];
  const mIndex = months.indexOf(month ?? "");
  const [yy, mm] = (month ?? "0-0").split("-").map(Number);

  return (
    <div>
      <div className="grid gap-8 rounded-lg border border-border bg-white p-6 md:grid-cols-[auto_1fr]">
        {/* Étape 1 — le jour */}
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={mIndex <= 0}
              onClick={() => setMonth(months[mIndex - 1])}
              className="rounded-md px-2 py-1 text-lg leading-none text-muted transition hover:text-foreground disabled:opacity-30"
              aria-label="Mois précédent"
            >
              ‹
            </button>
            <span className="text-sm font-semibold capitalize text-foreground">
              {MONTHS[(mm || 1) - 1]} {yy}
            </span>
            <button
              type="button"
              disabled={mIndex < 0 || mIndex >= months.length - 1}
              onClick={() => setMonth(months[mIndex + 1])}
              className="rounded-md px-2 py-1 text-lg leading-none text-muted transition hover:text-foreground disabled:opacity-30"
              aria-label="Mois suivant"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="pb-1 text-xs font-medium text-muted">
                {w}
              </span>
            ))}

            {grid.map((key, i) => {
              if (!key) return <span key={`v${i}`} />;
              const open = byDay.has(key);
              const selected = key === day;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!open}
                  aria-pressed={selected}
                  onClick={() => setDay(key)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm transition ${
                    selected
                      ? "bg-primary font-semibold text-white"
                      : open
                        ? "bg-primary-light font-semibold text-primary hover:bg-primary hover:text-white"
                        : "text-muted/60"
                  }`}
                >
                  {Number(key.slice(8))}
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted">Heure de Paris</p>
        </div>

        {/* Étape 2 — l'heure */}
        <div className="md:border-l md:border-border md:pl-8">
          {day ? (
            <>
              <p className="mb-3 text-sm font-semibold capitalize text-foreground">{longDay(day)}</p>
              <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {(byDay.get(day) ?? []).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onPick(s)}
                    className="rounded-md border border-primary px-3 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white"
                  >
                    {hour(s)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Choisissez d&apos;abord un jour — seuls les jours avec des créneaux sont proposés.
            </p>
          )}
        </div>
      </div>
    </div>);
}
