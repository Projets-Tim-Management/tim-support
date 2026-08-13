"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatSlot } from "@/modules/marketing/lib/scheduling";

/**
 * Réservation du créneau de prise en main, côté client.
 *
 * Les créneaux sont groupés par jour : une liste à plat de 40 horaires est
 * illisible, alors que « choisir un jour, puis une heure » correspond à la façon
 * dont on prend un rendez-vous.
 */

type Payload = {
  /** `creneaux` : TIM propose les horaires · `lien` : outil du partenaire · `aucun`. */
  mode: "creneaux" | "lien" | "aucun";
  bookingUrl: string | null;
  slots: string[];
  booked: string | null;
  modality: string;
  startDate: string | null;
};

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function SlotPicker() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/rendez-vous", { credentials: "include" });
      setData(res.ok ? await res.json() : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of data?.slots ?? []) {
      const k = dayKey(s);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()];
  }, [data]);

  const book = async (at: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/rendez-vous", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ at }),
      });
      if (res.status === 409) {
        setError("Ce créneau vient d'être pris. Choisissez-en un autre.");
        await load();
        return;
      }
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("La réservation a échoué. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-muted">Chargement des créneaux…</p>;
  if (!data) return <p className="text-muted">Aucune phase de test en cours.</p>;

  if (data.booked) {
    return (
      <div className="rounded-lg border border-border bg-white p-5">
        <p className="text-sm text-muted">Votre session est calée</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{formatSlot(data.booked)}</p>
        <p className="mt-1 text-sm text-muted">45 minutes, {data.modality}.</p>
        <p className="mt-4 text-sm text-muted">
          Besoin de déplacer ce rendez-vous&nbsp;? Répondez à l&apos;e-mail de confirmation, votre
          interlocuteur s&apos;en charge.
        </p>
      </div>
    );
  }

  // Le partenaire garde son propre outil de réservation : on l'y renvoie, sans
  // dupliquer un agenda qu'on ne maîtrise pas.
  if (data.mode === "lien" && data.bookingUrl) {
    return (
      <div className="rounded-lg border border-border bg-white p-5">
        <p className="text-sm text-muted">
          Votre interlocuteur gère ses rendez-vous depuis son propre outil. Choisissez-y votre
          créneau — 45 minutes, {data.modality}.
        </p>
        <a
          href={data.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark"
        >
          Réserver mon créneau
        </a>
      </div>
    );
  }

  if (byDay.length === 0) {
    return (
      <p className="rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text">
        Aucun créneau n&apos;est disponible pour le moment. Votre interlocuteur vous contactera
        directement pour caler la session.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-5">
        {byDay.map(([day, slots]) => (
          <section key={day}>
            <h2 className="text-sm font-semibold capitalize text-foreground">{day}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => void book(s)}
                  className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {hour(s)}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
