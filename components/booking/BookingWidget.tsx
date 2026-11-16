"use client";

import { useCallback, useEffect, useState } from "react";

import SlotCalendar from "@/components/portal/SlotCalendar";

/**
 * LA RÉSERVATION EN LIGNE (/rdv/<type>), comme Calendly : choisir le créneau d'abord (c'est la décision), se
 * présenter ensuite (c'est la formalité). Venu du formulaire de contact, le prospect ne ressaisit RIEN : un
 * récapitulatif « au nom de … » et « Confirmer » (16/11/2026 : « on les a déjà, non ? ») — « Modifier » rouvre les
 * champs. Plusieurs lieux (visio, téléphone…) : il choisit, comme dans Calendly. Le nom de qui reçoit n'apparaît pas :
 * c'est TIM Management.
 *
 * Le serveur revérifie tout ; si le créneau vient d'être pris, la liste se recharge et le prospect en choisit un
 * autre. Le même composant sert à DÉPLACER un rendez-vous (lien des e-mails) : `mode="deplacer"`.
 */

export type WidgetQuestion = { key: string; label: string; type: string; options: { value: string; label: string }[]; required: boolean };
export type WidgetPrefill = { firstName?: string; lastName?: string; email?: string; phone?: string; company?: string; answers: Record<string, string> };

type Props = {
  slotsUrl: string;
  postUrl: string;
  durationMin: number;
  /** Les lieux proposés (le prospect choisit s'il y en a plusieurs). */
  locations: { value: string; label: string; hint?: string }[];
  phoneRequired: boolean;
  /** Les questions sont celles du formulaire de contact : en visio (la démo), toutes obligatoires. */
  allRequiredInVisio?: boolean;
  questions: WidgetQuestion[];
  prefill: WidgetPrefill;
  demande: string | null;
  tracking: Record<string, string>;
  mode?: "reserver" | "deplacer";
};
type Done = { start: string; meetingUrl: string | null; message: string | null; redirectUrl: string | null };

const PARIS = "Europe/Paris";
const longDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long" });
const hour = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit" });
/** L'icône d'un lieu : une caméra pour la visio, un combiné pour le téléphone, un repère pour le reste. */
function LocationIcon({ kind }: { kind: string }) {
  const path =
    kind === "meet" ? (
      <>
        <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
        <path d="m15.5 10.5 6-3.5v10l-6-3.5z" />
      </>
    ) : kind === "telephone" ? (
      <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 5.3 5.3l1.4-2.2L19 14.5V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />
    ) : (
      <>
        <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>
    );
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

const input = "mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary";

/** Dans une page de la vitrine (iframe) : la hauteur suit le contenu. */
function useEmbedHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    const post = () => window.parent.postMessage({ type: "tim-rdv:height", height: document.documentElement.scrollHeight }, "*");
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
}

export default function BookingWidget(p: Props) {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // La visio est cochée d'office (16/11/2026) ; sinon le premier lieu proposé.
  const [location, setLocation] = useState((p.locations.find((l) => l.value === "meet") ?? p.locations[0])?.value ?? "");
  const v = p.prefill;
  // Venu du formulaire : sa demande fait foi — aucune question, le créneau, visio ou téléphone, « Confirmer ».
  const fromDemande = Boolean(p.demande);
  const all = Boolean(p.allRequiredInVisio) && location === "meet" && !fromDemande;
  const needPhone = p.phoneRequired || all || location === "telephone";
  const req = (q: WidgetQuestion) => q.required || all;
  // Tout est déjà connu (venu du formulaire) : pas de champs à remplir, un récapitulatif.
  const known = Boolean(v.firstName && v.email && v.company) && (fromDemande || (Boolean(v.lastName) && p.questions.every((q) => !req(q) || v.answers[q.key]))) && (!needPhone || Boolean(v.phone));
  const [editing, setEditing] = useState(!known);
  useEmbedHeight();

  const load = useCallback(async () => {
    try {
      const res = await fetch(p.slotsUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setSlots(((await res.json()) as { slots: string[] }).slots);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [p.slotsUrl]);
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
      const body =
        p.mode === "deplacer"
          ? { action: "deplacer", at: slot }
          : {
              at: slot,
              location,
              firstName: field("firstName"),
              lastName: field("lastName"),
              email: field("email"),
              phone: field("phone"),
              company: field("company"),
              // Un choix multiple (les besoins) : ses cases cochées, séparées par des virgules.
              answers: Object.fromEntries(p.questions.map((q) => [q.key, q.type === "multi" ? form.getAll(`q-${q.key}`).map(String).filter(Boolean).join(",") : field(`q-${q.key}`)])),
              website: field("website"),
              demande: p.demande,
              tracking: p.tracking,
            };
      const res = await fetch(p.postUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as Partial<Done> & { message?: string; field?: string; start?: string };
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
      setDone({ start: json.start ?? slot, meetingUrl: json.meetingUrl ?? null, message: json.message ?? null, redirectUrl: null });
    } catch {
      setError({ message: "La réservation n'a pas abouti — vérifiez votre connexion et réessayez." });
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-success/40 bg-success-bg p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-success-text">{p.mode === "deplacer" ? "Rendez-vous déplacé" : "C'est confirmé"}</p>
        <p className="mt-2 text-2xl font-bold capitalize text-foreground">{longDate(done.start)}</p>
        <p className="text-lg text-foreground">
          à {hour(done.start)} · {p.durationMin} minutes · {p.locations.find((l) => l.value === location)?.label ?? p.locations[0]?.label}
        </p>
        <p className="mt-4 max-w-xl text-sm text-foreground/80">{done.message ?? "La confirmation part par e-mail, avec de quoi l'ajouter à votre agenda, et un lien pour déplacer ou annuler."}</p>
        {done.meetingUrl && (
          <a href={done.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block rounded-btn bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark">
            Lien de la visio
          </a>
        )}
      </div>
    );
  }

  if (failed) {
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
  if (!slots) return <div className="h-80 animate-pulse rounded-lg border border-border bg-surface" aria-label="Chargement des créneaux" />;
  if (!slots.length) {
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

  if (!slot) {
    return (
      <div>
        {error && <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-foreground">{error.message}</p>}
        <SlotCalendar
          slots={slots}
          onPick={(s) => {
            setError(null);
            setSlot(s);
          }}
        />
        <p className="mt-3 text-xs text-muted">Heures de Paris.</p>
      </div>
    );
  }

  const bad = (name: string) => (error?.field === name ? " border-danger" : "");
  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-white p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">{p.mode === "deplacer" ? "Nouveau créneau" : "Votre créneau"}</p>
          <p className="mt-1 text-xl font-bold capitalize text-foreground">{longDate(slot)}</p>
          <p className="text-foreground">
            à {hour(slot)} · {p.durationMin} minutes
          </p>
        </div>
        <button type="button" onClick={() => setSlot(null)} className="text-sm font-semibold text-primary hover:underline">
          Changer de créneau
        </button>
      </div>

      {p.mode !== "deplacer" && p.locations.length > 1 && (
        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-foreground">Comment préférez-vous échanger ?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {p.locations.map((l) => {
              const on = location === l.value;
              return (
                <label key={l.value} className={`flex cursor-pointer items-start gap-3 rounded-md border-2 px-4 py-3 transition ${on ? "border-primary bg-primary-light" : "border-border bg-white hover:border-primary/40"}${error?.field === "location" ? " border-danger" : ""}`}>
                  <input type="radio" name="location" value={l.value} checked={on} onChange={() => setLocation(l.value)} required className="sr-only" />
                  <span className={`mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full ${on ? "bg-primary text-white" : "bg-surface text-foreground/70"}`}>
                    <LocationIcon kind={l.value} />
                  </span>
                  <span>
                    <span className="block font-semibold text-foreground">{l.label}</span>
                    {l.hint && <span className="block text-sm text-foreground/70">{l.hint}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {p.mode !== "deplacer" && !editing && (
        <div className="mt-6 rounded-md bg-surface px-4 py-3 text-sm text-foreground">
          <p>
            Au nom de <strong>{v.firstName} {v.lastName}</strong> ({v.company}) · {v.email}
            {v.phone ? ` · ${v.phone}` : ""}{" "}
            <button type="button" onClick={() => setEditing(true)} className="ml-1 font-semibold text-primary hover:underline">
              Modifier
            </button>
          </p>
          {/* Ce que la demande dit déjà : envoyé tel quel. */}
          <input type="hidden" name="firstName" value={v.firstName ?? ""} />
          <input type="hidden" name="lastName" value={v.lastName ?? ""} />
          <input type="hidden" name="email" value={v.email ?? ""} />
          <input type="hidden" name="company" value={v.company ?? ""} />
          {p.questions.map((q) => (
            <input key={q.key} type="hidden" name={`q-${q.key}`} value={v.answers[q.key] ?? ""} />
          ))}
          {v.phone || !needPhone ? (
            <input type="hidden" name="phone" value={v.phone ?? ""} />
          ) : (
            <label className="mt-3 block">
              <span className="text-sm font-medium text-foreground">{location === "telephone" ? "Le numéro où nous vous appelons" : "Téléphone"}</span>
              <input name="phone" type="tel" required autoComplete="tel" maxLength={30} className={input + bad("phone")} />
            </label>
          )}
        </div>
      )}

      {p.mode !== "deplacer" && editing && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-foreground">Prénom</span>
            <input name="firstName" required autoComplete="given-name" maxLength={60} defaultValue={v.firstName} className={input + bad("firstName")} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-foreground">Nom</span>
            <input name="lastName" required autoComplete="family-name" maxLength={60} defaultValue={v.lastName} className={input + bad("lastName")} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-foreground">E-mail professionnel</span>
            <input name="email" type="email" required autoComplete="email" defaultValue={v.email} className={input + bad("email")} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-foreground">
              {location === "telephone" ? "Le numéro où nous vous appelons" : "Téléphone"} {!needPhone && <span className="font-normal text-muted">(facultatif)</span>}
            </span>
            <input name="phone" type="tel" required={needPhone} autoComplete="tel" maxLength={30} defaultValue={v.phone} className={input + bad("phone")} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-foreground">Société</span>
            <input name="company" required autoComplete="organization" maxLength={120} defaultValue={v.company} className={input + bad("company")} />
          </label>
          {p.questions.map((q) =>
            q.type === "multi" ? (
              <fieldset key={q.key} className="sm:col-span-2">
                <legend className="text-sm font-medium text-foreground">
                  {q.label} {!req(q) && <span className="font-normal text-muted">(facultatif)</span>}
                </legend>
                <div className={`mt-1 flex flex-wrap gap-2${error?.field === `q-${q.key}` ? " rounded-md ring-1 ring-danger" : ""}`}>
                  {q.options.map((o) => (
                    <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-light">
                      <input type="checkbox" name={`q-${q.key}`} value={o.value} defaultChecked={(v.answers[q.key] ?? "").split(",").includes(o.value)} className="accent-primary" />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label key={q.key} className={`block${q.type === "paragraphe" ? " sm:col-span-2" : ""}`}>
                <span className="text-sm font-medium text-foreground">
                  {q.label} {!req(q) && <span className="font-normal text-muted">(facultatif)</span>}
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
                ) : q.type === "paragraphe" ? (
                  <textarea name={`q-${q.key}`} rows={3} required={req(q)} maxLength={2000} defaultValue={v.answers[q.key]} className={input + bad(`q-${q.key}`)} />
                ) : (
                  <input name={`q-${q.key}`} required={req(q)} maxLength={300} defaultValue={v.answers[q.key]} className={input + bad(`q-${q.key}`)} />
                )}
              </label>
            ),
          )}
        </div>
      )}
      {/* Leurre anti-robot : hors écran, ignoré des lecteurs d'écran. */}
      {p.mode !== "deplacer" && <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />}

      {error && <p className="mt-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-foreground">{error.message}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={sending} className="rounded-btn bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60">
          {sending ? "Un instant…" : p.mode === "deplacer" ? "Déplacer le rendez-vous" : "Confirmer le rendez-vous"}
        </button>
        <p className="text-xs text-muted">{location === "meet" ? "Le lien de la visio part par e-mail avec la confirmation." : "La confirmation part par e-mail."}</p>
      </div>

      {p.mode !== "deplacer" && (
        <p className="mt-6 text-xs leading-relaxed text-muted">
          Ces informations servent uniquement à organiser ce rendez-vous et à vous recontacter à son sujet. Elles sont conservées par Tim Management et ne sont jamais cédées. Pour y accéder ou les faire supprimer :{" "}
          <a href="mailto:support@tim-management.co" className="underline">
            support@tim-management.co
          </a>
          .
        </p>
      )}
    </form>
  );
}
