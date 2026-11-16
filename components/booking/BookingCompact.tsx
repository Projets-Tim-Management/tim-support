"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { WidgetPrefill, WidgetQuestion } from "@/components/booking/BookingWidget";
import HeardFrom from "@/components/booking/HeardFrom";

/**
 * LA RÉSERVATION COMPACTE (16/11/2026 : « la même chose en simplifié, comme Calendly ») — pour une fenêtre étroite :
 * le bouton « Prendre rendez-vous » de la vitrine, ou toute page qui intègre /rdv/<type>?embed=1. Trois écrans :
 * le jour (calendrier du mois, jours libres en couleur), l'heure (la liste des départs), vos informations (nom,
 * e-mail, visio ou téléphone, un mot). Venu du formulaire de contact : rien à remplir, il confirme.
 */

type Props = {
  slotsUrl: string;
  postUrl: string;
  durationMin: number;
  locations: { value: string; label: string; hint?: string }[];
  phoneRequired: boolean;
  simpleForm: boolean;
  allRequiredInVisio?: boolean;
  questions: WidgetQuestion[];
  prefill: WidgetPrefill;
  demande: string | null;
  tracking: Record<string, string>;
};

const PARIS = "Europe/Paris";
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { timeZone: PARIS });
const hour = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit" });
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const pad = (n: number) => String(n).padStart(2, "0");
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
function grid(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`)];
}
const input = "mt-1 w-full rounded-md border border-border bg-white px-3 py-2.5 text-foreground outline-none focus:border-primary";

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Retour" className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-foreground hover:bg-surface">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

function Icon({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "meet" ? (
        <>
          <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
          <path d="m15.5 10.5 6-3.5v10l-6-3.5z" />
        </>
      ) : (
        <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 5.3 5.3l1.4-2.2L19 14.5V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />
      )}
    </svg>
  );
}

export default function BookingCompact(p: Props) {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [location, setLocation] = useState((p.locations.find((l) => l.value === "meet") ?? p.locations[0])?.value ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = useState<{ start: string; meetingUrl: string | null; message: string | null; token: string | null } | null>(null);
  const v = p.prefill;
  const fromDemande = Boolean(p.demande);
  const all = Boolean(p.allRequiredInVisio) && location === "meet" && !fromDemande;
  const needPhone = p.phoneRequired || all || location === "telephone";
  const req = (q: WidgetQuestion) => q.required || all;
  const known = Boolean(v.firstName && v.email && (p.simpleForm || v.company)) && (fromDemande || p.questions.every((q) => !req(q) || v.answers[q.key])) && (!needPhone || Boolean(v.phone));
  const [editing, setEditing] = useState(!known);

  // Dans une page (iframe) : la hauteur suit le contenu.
  useEffect(() => {
    if (window.parent === window) return;
    const post = () => window.parent.postMessage({ type: "tim-rdv:height", height: document.documentElement.scrollHeight }, "*");
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(p.slotsUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const list = ((await res.json()) as { slots: string[] }).slots;
      setSlots(list);
      setMonth((m) => m ?? (list[0] ? dayOf(list[0]).slice(0, 7) : null));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [p.slotsUrl]);
  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots ?? []) m.set(dayOf(s), [...(m.get(dayOf(s)) ?? []), s]);
    return m;
  }, [slots]);
  const today = dayOf(new Date().toISOString());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return;
    const form = new FormData(e.currentTarget);
    const field = (k: string) => String(form.get(k) ?? "");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(p.postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          at: slot,
          location,
          name: field("name"),
          firstName: field("firstName"),
          lastName: field("lastName"),
          email: field("email"),
          phone: field("phone"),
          company: field("company"),
          answers: Object.fromEntries(p.questions.map((q) => [q.key, q.type === "multi" ? form.getAll(`q-${q.key}`).map(String).filter(Boolean).join(",") : field(`q-${q.key}`)])),
          website: field("website"),
          demande: p.demande,
          tracking: p.tracking,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; field?: string; start?: string; meetingUrl?: string | null; redirectUrl?: string | null; token?: string };
      if (!res.ok) {
        setError({ message: json.message ?? "La réservation n'a pas abouti. Réessayez.", field: json.field });
        if (res.status === 409) {
          setSlot(null);
          void load();
        }
        return;
      }
      if (json.redirectUrl) {
        (window.top ?? window).location.href = json.redirectUrl;
        return;
      }
      setDone({ start: json.start ?? slot, meetingUrl: json.meetingUrl ?? null, message: json.message ?? null, token: json.token ?? null });
    } catch {
      setError({ message: "La réservation n'a pas abouti — vérifiez votre connexion et réessayez." });
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="px-2 py-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-2xl text-success-text">✓</div>
        <p className="mt-4 text-xl font-bold text-ink">C&apos;est confirmé</p>
        <p className="mt-1 capitalize text-foreground">
          {weekday(dayOf(done.start))} {longDay(dayOf(done.start))} à {hour(done.start)}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm text-foreground/75">{done.message ?? "La confirmation part par e-mail, avec de quoi l'ajouter à votre agenda."}</p>
        {done.meetingUrl && (
          <a href={done.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block rounded-btn bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark">
            Lien de la visio
          </a>
        )}
        <HeardFrom jeton={done.token} />
      </div>
    );
  }
  if (failed) return <p className="m-4 rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text">La prise de rendez-vous est momentanément indisponible. Réessayez dans quelques minutes.</p>;
  if (!slots || !month) return <div className="m-4 h-96 animate-pulse rounded-lg bg-surface" aria-label="Chargement des créneaux" />;

  // ── 3. Vos informations ─────────────────────────────────────────────────
  if (slot) {
    const bad = (name: string) => (error?.field === name ? " border-danger" : "");
    return (
      <form onSubmit={submit} className="px-2 py-4">
        <div className="flex items-center gap-3">
          <Back onClick={() => setSlot(null)} />
          <div>
            <p className="font-semibold capitalize text-ink">
              {weekday(dayOf(slot))} {longDay(dayOf(slot))}
            </p>
            <p className="text-sm text-foreground/75">
              {hour(slot)} · {p.durationMin} min
            </p>
          </div>
        </div>

        <h2 className="mt-6 text-xl font-bold text-ink">{editing ? "Indiquez vos informations" : "Confirmez votre rendez-vous"}</h2>

        {!editing ? (
          <p className="mt-2 text-sm text-foreground">
            Au nom de <strong>{[v.firstName, v.lastName].filter(Boolean).join(" ")}</strong> · {v.email}{" "}
            <button type="button" onClick={() => setEditing(true)} className="font-semibold text-primary hover:underline">
              Modifier
            </button>
          </p>
        ) : p.simpleForm ? (
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Nom *</span>
              <input name="name" required autoComplete="name" maxLength={120} defaultValue={[v.firstName, v.lastName].filter(Boolean).join(" ")} className={input + bad("name")} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">E-mail *</span>
              <input name="email" type="email" required autoComplete="email" defaultValue={v.email} className={input + bad("email")} />
            </label>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Prénom *</span>
              <input name="firstName" required autoComplete="given-name" maxLength={60} defaultValue={v.firstName} className={input + bad("firstName")} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Nom *</span>
              <input name="lastName" required autoComplete="family-name" maxLength={60} defaultValue={v.lastName} className={input + bad("lastName")} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-foreground">E-mail *</span>
              <input name="email" type="email" required autoComplete="email" defaultValue={v.email} className={input + bad("email")} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-foreground">Société *</span>
              <input name="company" required autoComplete="organization" maxLength={120} defaultValue={v.company} className={input + bad("company")} />
            </label>
          </div>
        )}
        {!editing && (
          <>
            <input type="hidden" name="firstName" value={v.firstName ?? ""} />
            <input type="hidden" name="lastName" value={v.lastName ?? ""} />
            <input type="hidden" name="email" value={v.email ?? ""} />
            <input type="hidden" name="company" value={v.company ?? ""} />
            {p.questions.map((q) => (
              <input key={q.key} type="hidden" name={`q-${q.key}`} value={v.answers[q.key] ?? ""} />
            ))}
          </>
        )}

        {p.locations.length > 1 && (
          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-foreground">Lieu *</legend>
            <div className="mt-2 space-y-2">
              {p.locations.map((l) => {
                const on = location === l.value;
                return (
                  <label key={l.value} className={`flex cursor-pointer items-center gap-3 rounded-md border-2 px-3 py-2.5 ${on ? "border-primary bg-primary-light" : "border-border bg-white"}${error?.field === "location" ? " border-danger" : ""}`}>
                    <input type="radio" name="location" value={l.value} checked={on} onChange={() => setLocation(l.value)} className="sr-only" />
                    <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${on ? "bg-primary text-white" : "bg-surface text-foreground/70"}`}>
                      <Icon kind={l.value} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{l.label}</span>
                      {l.hint && <span className="block text-xs text-foreground/70">{l.hint}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {(editing || !v.phone) && needPhone && (
          <label className="mt-4 block">
            <span className="text-sm font-medium text-foreground">{location === "telephone" ? "Le numéro où nous vous appelons *" : "Téléphone *"}</span>
            <input name="phone" type="tel" required autoComplete="tel" maxLength={30} defaultValue={v.phone} className={input + bad("phone")} />
          </label>
        )}
        {!editing && v.phone && <input type="hidden" name="phone" value={v.phone} />}
        {editing && !needPhone && (
          <label className="mt-4 block">
            <span className="text-sm font-medium text-foreground">
              Téléphone <span className="font-normal text-muted">(facultatif)</span>
            </span>
            <input name="phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={v.phone} className={input + bad("phone")} />
          </label>
        )}

        {editing &&
          p.questions.map((q) => (
            <label key={q.key} className="mt-4 block">
              <span className="text-sm font-medium text-foreground">
                {q.label} {req(q) ? "*" : <span className="font-normal text-muted">(facultatif)</span>}
              </span>
              {q.type === "choix" ? (
                <select name={`q-${q.key}`} required={req(q)} defaultValue={q.options.some((o) => o.value === v.answers[q.key]) ? v.answers[q.key] : ""} className={input + bad(`q-${q.key}`)}>
                  <option value="">Choisissez une valeur</option>
                  {q.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : q.type === "multi" ? (
                <span className="mt-1 flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <span key={o.value} className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm">
                      <input type="checkbox" name={`q-${q.key}`} value={o.value} defaultChecked={(v.answers[q.key] ?? "").split(",").includes(o.value)} className="accent-primary" />
                      {o.label}
                    </span>
                  ))}
                </span>
              ) : q.type === "paragraphe" ? (
                <textarea name={`q-${q.key}`} rows={3} required={req(q)} maxLength={2000} defaultValue={v.answers[q.key]} className={input + bad(`q-${q.key}`)} />
              ) : (
                <input name={`q-${q.key}`} required={req(q)} maxLength={300} defaultValue={v.answers[q.key]} className={input + bad(`q-${q.key}`)} />
              )}
            </label>
          ))}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

        {error && <p className="mt-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-foreground">{error.message}</p>}
        <button type="submit" disabled={sending} className="mt-6 w-full rounded-btn bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60">
          {sending ? "Un instant…" : "Confirmer le rendez-vous"}
        </button>
      </form>
    );
  }

  // ── 2. L'heure ──────────────────────────────────────────────────────────
  if (day) {
    return (
      <div className="px-2 py-4">
        <div className="flex items-center gap-3">
          <Back onClick={() => setDay(null)} />
          <div className="flex-1 text-center">
            <p className="text-2xl font-bold capitalize text-ink">{weekday(day)}</p>
            <p className="text-foreground">{longDay(day)}</p>
          </div>
          <span className="w-10" />
        </div>
        <p className="mt-6 text-center text-xl font-bold text-ink">Choisissez un horaire</p>
        <p className="mt-1 text-center text-sm text-foreground/75">Durée : {p.durationMin} min · heure de Paris</p>
        <div className="mt-5 space-y-3">
          {(byDay.get(day) ?? []).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setError(null);
                setSlot(s);
              }}
              className="w-full rounded-md border-2 border-primary/50 bg-white py-3 text-lg font-bold text-primary transition hover:border-primary hover:bg-primary-light"
            >
              {hour(s)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 1. Le jour ──────────────────────────────────────────────────────────
  const first = slots[0] ? dayOf(slots[0]).slice(0, 7) : month;
  const last = slots.length ? dayOf(slots[slots.length - 1]).slice(0, 7) : month;
  const [y, m] = month.split("-").map(Number);
  return (
    <div className="px-2 py-4">
      {error && <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-foreground">{error.message}</p>}
      <p className="text-center text-2xl font-bold text-ink">Choisissez un jour</p>
      {!slots.length ? (
        <p className="mt-6 rounded-md bg-surface px-4 py-3 text-sm text-foreground">Tous les créneaux sont pris pour le moment. Écrivez-nous à support@tim-management.co.</p>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-center gap-8">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= first} aria-label="Mois précédent" className="text-2xl text-primary disabled:text-border">
              ‹
            </button>
            <span className="min-w-36 text-center font-semibold text-ink">
              {MONTHS[m - 1]} {y}
            </span>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= last} aria-label="Mois suivant" className="text-2xl text-primary disabled:text-border">
              ›
            </button>
          </div>
          <div className="mt-5 grid grid-cols-7 gap-y-2 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-xs text-foreground/60">
                {w}
              </span>
            ))}
            {grid(month).map((d, i) =>
              d ? (
                <span key={d} className="flex flex-col items-center">
                  <button
                    type="button"
                    disabled={!byDay.has(d)}
                    onClick={() => setDay(d)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-base ${byDay.has(d) ? "bg-primary-light font-bold text-primary hover:bg-primary hover:text-white" : "text-foreground/45"}`}
                  >
                    {Number(d.slice(8))}
                  </button>
                  {d === today && <span className="mt-0.5 h-1 w-1 rounded-full bg-foreground/60" aria-hidden="true" />}
                </span>
              ) : (
                <span key={`v${i}`} />
              ),
            )}
          </div>
          <p className="mt-5 text-center text-xs text-foreground/60">Heures de Paris</p>
        </>
      )}
    </div>
  );
}
