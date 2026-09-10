"use client";

import { useCallback, useEffect, useState } from "react";

import SlotCalendar from "@/components/portal/SlotCalendar";
import { IconCheck } from "@/components/ui/icons";

/**
 * Réserver le BILAN de fin de test.
 *
 * Beaucoup plus court que la prise en main, et c'est voulu : à ce stade le
 * client connaît son interlocuteur, il n'y a personne à déclarer ni à convier.
 * Un jour, une heure, c'est réservé.
 *
 * Le calendrier, lui, est le même — `SlotCalendar` : deux grilles à corriger
 * auraient fini par se répondre différemment.
 */

const parisDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });

const longDay = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

type Data = {
  mode: "aucun" | "creneaux" | "lien";
  bookingUrl: string | null;
  slots: string[];
  booked: string | null;
  modality: string | null;
  meetingUrl: string | null;
  endDate: string | null;
};

export default function ReviewPicker() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/bilan", { credentials: "include" });
      setData(res.ok ? ((await res.json()) as Data) : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * La liste se rafraîchit tant que l'écran est ouvert — même raison que sur la
   * prise en main : un créneau occupé entre-temps par le partenaire resterait
   * affiché, et le refus arriverait au dernier clic.
   */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 120_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [load]);

  // Le créneau choisi vient de disparaître : on le dit tout de suite, plutôt que
  // de laisser confirmer dans le vide.
  useEffect(() => {
    if (!slot || !data?.slots) return;
    if (data.slots.includes(slot)) return;
    setSlot(null);
    setError("Ce créneau vient d'être pris. Choisissez-en un autre.");
  }, [data, slot]);

  const book = async () => {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/bilan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ at: slot }),
      });
      if (res.status === 409) {
        setSlot(null);
        setError("Ce créneau vient d'être pris. Choisissez-en un autre.");
        await load();
        return;
      }
      if (!res.ok) throw new Error();
      setSlot(null);
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
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="flex items-center gap-3 border-b border-success/20 bg-success-bg px-6 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-white">
            <IconCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-success-text">Votre bilan est réservé</p>
            <p className="text-sm text-success-text/80">
              Une confirmation vient de partir par e-mail.
            </p>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-2xl font-bold capitalize text-foreground">
            {longDay(parisDay(data.booked))}
          </p>
          <p className="mt-1 text-lg text-foreground">
            {hour(data.booked)} — 30 minutes{data.modality ? `, ${data.modality}` : ""}
          </p>
          {data.meetingUrl && (
            <a
              href={data.meetingUrl}
              className="mt-4 inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark"
            >
              Rejoindre la visio
            </a>
          )}
          <p className="mt-4 text-sm text-muted">
            Besoin de déplacer ce rendez-vous&nbsp;? Répondez à l&apos;e-mail de confirmation.
          </p>
        </div>
      </div>
    );
  }

  // Le partenaire gère ses rendez-vous chez lui : on l'y envoie plutôt que de
  // proposer des créneaux qu'on ne connaît pas.
  if (data.mode === "lien" && data.bookingUrl) {
    return (
      <div className="rounded-lg border border-border bg-white p-6">
        <p className="text-foreground">
          Choisissez votre créneau directement dans l&apos;agenda de votre interlocuteur.
        </p>
        <a
          href={data.bookingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark"
        >
          Réserver mon bilan
        </a>
      </div>
    );
  }

  if (data.slots.length === 0) {
    return (
      <p className="rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text">
        Aucun créneau n&apos;est disponible pour le moment. Votre interlocuteur vous contactera
        directement pour caler le bilan.
      </p>
    );
  }

  if (slot) {
    return (
      <div className="rounded-lg border border-border bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Confirmer</p>
        <p className="mt-2 text-2xl font-bold capitalize text-foreground">
          {longDay(parisDay(slot))}
        </p>
        <p className="mt-1 text-lg text-foreground">
          {hour(slot)} — 30 minutes{data.modality ? `, ${data.modality}` : ""}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void book()}
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Réservation…" : "Confirmer ce créneau"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSlot(null)}
            className="text-sm font-medium text-muted underline hover:text-foreground disabled:opacity-50"
          >
            Choisir un autre horaire
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground" role="alert">
          {error}
        </p>
      )}
      <SlotCalendar slots={data.slots} onPick={setSlot} />
    </div>
  );
}
