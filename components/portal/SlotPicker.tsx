"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { IconCheck } from "@/components/ui/icons";
import { formatSlot } from "@/modules/marketing/lib/scheduling";

/**
 * Réservation du créneau de prise en main, en trois temps : le JOUR, puis
 * l'HEURE, puis la CONFIRMATION.
 *
 * L'écran précédent affichait tous les créneaux d'un coup — jusqu'à une
 * quarantaine d'horaires empilés — et réservait au premier clic. Deux défauts
 * distincts : on ne choisit pas dans une liste qu'on ne peut pas embrasser du
 * regard, et un rendez-vous de 45 minutes ne se prend pas par mégarde. Ici rien
 * n'est envoyé tant que le récapitulatif n'a pas été confirmé.
 *
 * Le calendrier ne montre qu'un mois à la fois et n'ouvre que les jours qui ont
 * des créneaux : proposer une date pour la refuser ensuite est la façon la plus
 * sûre de faire perdre du temps.
 */

type Payload = {
  /** `creneaux` : TIM propose les horaires · `lien` : outil du partenaire · `aucun`. */
  mode: "creneaux" | "lien" | "aucun";
  bookingUrl: string | null;
  slots: string[];
  booked: string | null;
  modality: string;
  startDate: string | null;
  /** Pré-remplissage du formulaire, depuis le compte de l'espace client. */
  contact: { email: string | null; firstName: string | null; lastName: string | null; role: string | null } | null;
  /**
   * Champs venus du réseau : déclarés FACULTATIFS à dessein. Une réponse plus
   * ancienne que l'écran — état conservé au rechargement à chaud, cache, version
   * décalée entre client et serveur — n'a pas ces clés, et un `.length` sur
   * `undefined` fait tomber toute la page. Le type dit ce qu'on espère, pas ce
   * qu'on reçoit.
   */
  guests?: { email: string; name: string | null }[];
  /** Lien de visio, absent si la session se tient sur site. */
  meetingUrl?: string | null;
};

const MAX_GUESTS = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Jour d'un créneau, en heure de Paris : « 2026-08-27 ». */
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

export default function SlotPicker() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  // Qui sera formé, et qui l'accompagne. Pré-rempli au chargement : l'espace
  // client connaît déjà la personne, la lui faire retaper n'apporte rien.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/rendez-vous", { credentials: "include" });
      const json = res.ok ? ((await res.json()) as Payload) : null;
      setData(json);
      if (json?.contact) {
        setFirstName((v) => v || json.contact!.firstName || "");
        setLastName((v) => v || json.contact!.lastName || "");
        setRole((v) => v || json.contact!.role || "");
        setEmail((v) => v || json.contact!.email || "");
      }
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
      const k = parisDay(s);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [data]);

  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const months = useMemo(() => [...new Set(days.map(monthKey))].sort(), [days]);

  // Le calendrier s'ouvre sur le premier mois qui a des créneaux, pas sur le
  // mois courant : celui-ci peut n'en avoir aucun.
  useEffect(() => {
    if (!month && months.length) setMonth(months[0]);
  }, [month, months]);

  const book = async () => {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/rendez-vous", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          at: slot,
          attendee: { firstName, lastName, role, email },
          guests: guests.filter((g) => EMAIL_RE.test(g.trim())).map((g) => ({ email: g.trim() })),
        }),
      });
      if (res.status === 400) {
        setError("Indiquez le prénom, le nom et l'adresse de la personne qui suivra la session.");
        return;
      }
      if (res.status === 409) {
        setError("Ce créneau vient d'être pris. Choisissez-en un autre.");
        setSlot(null);
        await load();
        return;
      }
      if (!res.ok) throw new Error();
      setSlot(null);
      setDay(null);
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
    const who = [data.contact?.firstName, data.contact?.lastName].filter(Boolean).join(" ").trim();
    // Nommée à part : `guests` (l'état) est la SAISIE en cours, celle-ci est ce
    // que le serveur a retenu. Les confondre serait afficher l'un pour l'autre.
    const invited = data.guests ?? [];
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {/* Bandeau vert : l'état « c'est fait » se lit avant le texte. Il occupe
            toute la largeur de la carte plutôt qu'une pastille perdue dans un
            coin — c'est la seule information qu'on vient chercher ici. */}
        <div className="flex items-center gap-3 border-b border-success/20 bg-success-bg px-6 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-white">
            <IconCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-success-text">Votre session est réservée</p>
            <p className="text-sm text-success-text/80">
              Une confirmation vient de partir par e-mail, avec l&apos;invitation à ajouter à votre
              agenda.
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-2xl font-bold capitalize text-foreground">{formatSlot(data.booked)}</p>

          {/* Un tableau plutôt qu'un paragraphe : on relit ce récapitulatif pour
              y chercher UNE information — l'heure, le lien, qui est convié. */}
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex gap-4">
              <dt className="w-32 shrink-0 text-muted">Durée</dt>
              <dd className="text-foreground">45 minutes</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-32 shrink-0 text-muted">Où</dt>
              <dd className="text-foreground">{data.modality}</dd>
            </div>
            {who && (
              <div className="flex gap-4">
                <dt className="w-32 shrink-0 text-muted">Personne formée</dt>
                <dd className="text-foreground">
                  <strong className="font-semibold">{who}</strong>
                  {data.contact?.role ? ` — ${data.contact.role}` : ""}
                  {data.contact?.email && (
                    <span className="block text-muted">{data.contact.email}</span>
                  )}
                </dd>
              </div>
            )}
            {invited.length > 0 && (
              <div className="flex gap-4">
                <dt className="w-32 shrink-0 text-muted">
                  {invited.length > 1 ? "Invités" : "Invité"}
                </dt>
                <dd className="text-foreground">
                  {invited.map((g) => (
                    <span key={g.email} className="block">
                      {g.name ? `${g.name} — ${g.email}` : g.email}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* Le lien de visio d'abord : c'est ce qu'on revient chercher le jour
                même. Il n'existe pas pour une session sur site. */}
            {data.meetingUrl && (
              <a
                href={data.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark"
              >
                Rejoindre la visio
              </a>
            )}
            <Link
              href="/espace-client/accueil"
              className={
                data.meetingUrl
                  ? "rounded-md border border-border px-5 py-2.5 font-semibold text-foreground transition hover:border-primary hover:text-primary"
                  : "rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark"
              }
            >
              Revenir à mon espace
            </Link>
          </div>

          <p className="mt-5 text-sm text-muted">
            Besoin de déplacer ce rendez-vous&nbsp;? Répondez à l&apos;e-mail de confirmation&nbsp;:
            votre interlocuteur se charge de modifier le créneau.
          </p>
        </div>
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

  if (days.length === 0) {
    return (
      <p className="rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text">
        Aucun créneau n&apos;est disponible pour le moment. Votre interlocuteur vous contactera
        directement pour caler la session.
      </p>
    );
  }

  // ── Étape 3 — confirmation ────────────────────────────────────────────────
  if (slot) {
    // Le nom et l'adresse conditionnent la réservation : sans eux, le partenaire
    // reçoit un rendez-vous avec une entreprise et personne en face.
    const ready = firstName.trim() && lastName.trim() && EMAIL_RE.test(email.trim());
    return (
      <div className="rounded-lg border border-border bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Confirmer</p>
        <p className="mt-2 text-2xl font-bold capitalize text-foreground">{longDay(parisDay(slot))}</p>
        <p className="mt-1 text-lg text-foreground">
          {hour(slot)} — 45 minutes, {data.modality}
        </p>
        <p className="mt-4 max-w-xl text-sm text-muted">
          Vous recevrez une confirmation par e-mail, avec l&apos;invitation à ajouter à votre agenda.
        </p>

        {/* Qui sera formé. Le partenaire prépare sa session en sachant à qui il
            s'adresse, et l'agenda invite la bonne personne : le compte de
            l'espace client donne une adresse, pas une identité. */}
        <fieldset className="mt-6 max-w-xl">
          <legend className="text-sm font-semibold text-foreground">Qui suivra la session&nbsp;?</legend>
          <p className="mt-1 text-sm text-muted">
            C&apos;est l&apos;administrateur de votre compte qui est formé — indiquez-le ici, même si
            ce n&apos;est pas vous.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Prénom</span>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Nom</span>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                Rôle dans l&apos;entreprise <span className="font-normal text-muted">(facultatif)</span>
              </span>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Gérant, responsable d'exploitation…"
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Adresse e-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>
        </fieldset>

        {/* Invités : une adresse suffit, l'agenda fait le reste. Bornés à huit —
            au-delà ce n'est plus une prise en main mais une réunion. */}
        <fieldset className="mt-5 max-w-xl">
          <legend className="text-sm font-semibold text-foreground">
            D&apos;autres personnes vous accompagnent&nbsp;?
          </legend>

          {guests.length > 0 && (
            <div className="mt-3 space-y-2">
              {guests.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={g}
                    placeholder="prenom.nom@entreprise.fr"
                    onChange={(e) =>
                      setGuests((list) => list.map((v, j) => (j === i ? e.target.value : v)))
                    }
                    className="w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setGuests((list) => list.filter((_, j) => j !== i))}
                    className="shrink-0 px-2 text-sm text-muted underline hover:text-foreground"
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}

          {guests.length < MAX_GUESTS && (
            <button
              type="button"
              onClick={() => setGuests((list) => [...list, ""])}
              className="mt-3 text-sm font-semibold text-primary hover:underline"
            >
              + Ajouter un invité
            </button>
          )}
          <p className="mt-2 text-xs text-muted">
            Ils recevront l&apos;invitation à l&apos;agenda, comme vous.
          </p>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !ready}
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

  const grid = month ? monthGrid(month) : [];
  const mIndex = months.indexOf(month ?? "");
  const [yy, mm] = (month ?? "0-0").split("-").map(Number);

  // ── Étapes 1 et 2 — le jour, puis l'heure ─────────────────────────────────
  return (
    <div>
      {error && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground" role="alert">
          {error}
        </p>
      )}

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
                    onClick={() => setSlot(s)}
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
    </div>
  );
}
