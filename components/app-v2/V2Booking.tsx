"use client";

import { useCallback, useEffect, useState } from "react";

import SlotCalendar from "@/components/portal/SlotCalendar";

/**
 * Réserver un tour de l'app V2 avec Charlie : un créneau, puis qui l'on est.
 *
 * Deux temps, comme dans l'espace client : choisir l'heure d'abord (c'est la
 * décision), se présenter ensuite (c'est la formalité). Le créneau choisi reste
 * affiché en tête du formulaire, avec de quoi en changer.
 *
 * Le serveur revérifie tout : la page ne promet un créneau que s'il est encore
 * libre au moment du clic, et le dit sinon.
 */

type Data = { slots: string[]; available: boolean; durationMin: number };
type Done = { booked: string; meetingUrl: string | null; invited: boolean; email: string };

const PARIS = "Europe/Paris";
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long" });
const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit" });

const ERRORS: Record<string, string> = {
  slot_unavailable: "Ce créneau vient d'être pris. Choisissez-en un autre, la liste a été mise à jour.",
  calendar_unavailable: "La prise de rendez-vous est momentanément indisponible. Réessayez dans quelques minutes.",
  missing_fields: "Renseignez votre prénom, votre nom, votre e-mail et votre société.",
  rate_limited: "Trop de tentatives. Réessayez dans un moment.",
};

const input = "mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary";

export default function V2Booking() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/app-v2/creneaux", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return;
    const form = new FormData(e.currentTarget);
    const field = (k: string) => String(form.get(k) ?? "");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/app-v2/creneaux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          at: slot,
          firstName: field("firstName"),
          lastName: field("lastName"),
          email: field("email"),
          phone: field("phone"),
          company: field("company"),
          message: field("message"),
          website: field("website"),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        booked?: string;
        meetingUrl?: string | null;
        invited?: boolean;
      };
      if (!res.ok) {
        setError(ERRORS[json.error ?? ""] ?? "La réservation n'a pas abouti. Réessayez.");
        if (json.error === "slot_unavailable") {
          setSlot(null);
          void load();
        }
        return;
      }
      setDone({
        booked: json.booked ?? slot,
        meetingUrl: json.meetingUrl ?? null,
        invited: Boolean(json.invited),
        email: field("email").trim(),
      });
    } catch {
      setError("La réservation n'a pas abouti — vérifiez votre connexion et réessayez.");
    } finally {
      setSending(false);
    }
  }

  // ── Réservé ────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="rounded-lg border border-success/40 bg-success-bg p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-success-text">C&apos;est noté</p>
        <p className="mt-2 text-2xl font-bold capitalize text-foreground">{longDate(done.booked)}</p>
        <p className="text-lg text-foreground">
          à {hour(done.booked)} · {data?.durationMin ?? 20} minutes en visio
        </p>
        <p className="mt-4 max-w-xl text-sm text-foreground/80">
          {done.invited
            ? `L'invitation part à ${done.email}, avec le lien de la visio. Pensez à l'accepter pour l'avoir dans votre agenda.`
            : `Votre créneau est réservé. Nous vous envoyons l'invitation avec le lien de la visio à ${done.email} très vite.`}
        </p>
        {done.meetingUrl && (
          <a
            href={done.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block rounded-btn bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark"
          >
            Lien de la visio
          </a>
        )}
      </div>
    );
  }

  // ── Chargement / indisponible ─────────────────────────────────────────────
  if (failed || (data && !data.available)) {
    return (
      <p className="rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text">
        La prise de rendez-vous est momentanément indisponible. Réessayez dans quelques minutes ou écrivez-nous à{" "}
        <a href="mailto:support@tim-management.co" className="font-semibold underline">
          support@tim-management.co
        </a>
        .
      </p>
    );
  }
  if (!data) {
    return <div className="h-80 animate-pulse rounded-lg border border-border bg-surface" aria-label="Chargement des créneaux" />;
  }
  if (data.slots.length === 0) {
    return (
      <p className="rounded-md bg-surface px-4 py-3 text-sm text-foreground">
        Tous les créneaux sont pris pour le moment. Écrivez-nous à{" "}
        <a href="mailto:support@tim-management.co" className="font-semibold text-primary underline">
          support@tim-management.co
        </a>{" "}
        et nous trouverons un moment ensemble.
      </p>
    );
  }

  // ── Étape 1 : le créneau ──────────────────────────────────────────────────
  if (!slot) {
    return (
      <div>
        {error && <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-foreground">{error}</p>}
        <SlotCalendar slots={data.slots} onPick={(s) => { setError(null); setSlot(s); }} />
      </div>
    );
  }

  // ── Étape 2 : qui l'on est ────────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-white p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Votre créneau</p>
          <p className="mt-1 text-xl font-bold capitalize text-foreground">{longDate(slot)}</p>
          <p className="text-foreground">
            à {hour(slot)} · {data.durationMin} minutes en visio
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSlot(null)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Changer de créneau
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-foreground">Prénom</span>
          <input name="firstName" required autoComplete="given-name" maxLength={60} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">Nom</span>
          <input name="lastName" required autoComplete="family-name" maxLength={60} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">E-mail professionnel</span>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">
            Téléphone <span className="font-normal text-muted">(facultatif)</span>
          </span>
          <input name="phone" type="tel" autoComplete="tel" maxLength={30} className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-foreground">Société</span>
          <input name="company" required autoComplete="organization" maxLength={120} className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-foreground">
            Une question, un point à voir en priorité&nbsp;? <span className="font-normal text-muted">(facultatif)</span>
          </span>
          <textarea name="message" rows={3} maxLength={1000} className={input} />
        </label>
        {/* Leurre anti-robot : hors écran, ignoré des lecteurs d'écran. */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      </div>

      {error && <p className="mt-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-foreground">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={sending}
          className="rounded-btn bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {sending ? "Réservation…" : "Confirmer le rendez-vous"}
        </button>
        <p className="text-xs text-muted">Vous recevez l&apos;invitation avec le lien de la visio par e-mail.</p>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Ces informations servent uniquement à organiser ce rendez-vous et à vous recontacter à son sujet. Elles sont
        conservées par Tim Management et ne sont jamais cédées. Pour y accéder ou les faire supprimer :{" "}
        <a href="mailto:support@tim-management.co" className="underline">
          support@tim-management.co
        </a>
        .
      </p>
    </form>
  );
}
