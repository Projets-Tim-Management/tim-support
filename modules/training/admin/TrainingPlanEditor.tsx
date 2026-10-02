"use client";

import { toast } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PROFILS } from "@/modules/partner/lib/pricing";
import {
  DayCard,
  FormulaPicker,
  PeopleMatrix,
  asId,
  idOf,
  type ClientAddress,
  type Day,
  type User,
} from "@/modules/training/admin/TrainingPlanParts";
import { TrainingEmails } from "@/modules/training/admin/TrainingEmails";
import { TrainingPreparation } from "@/modules/training/admin/TrainingPreparation";
import { TrainingPrints } from "@/modules/training/admin/TrainingPrints";
import {
  DAY_SLOTS,
  draftFromFormula,
  matchingContacts,
  planSteps,
  canSignOn,
  planWarnings,
  profilesOf,
  sessionsOfDay,
  sortDays,
  type Formula,
  type PlanContact,
  type PlanSession,
} from "@/modules/training/lib/plan";
import { ACCESS_DELIVERY } from "@/modules/training/lib/training";

/**
 * Le plan de formation d'un client, en plein écran (ouvert depuis l'encart
 * « Formation » de la fiche) : des JOURNÉES, chacune avec ses CRÉNEAUX, et
 * pour chaque créneau les contacts du client qui y vont.
 *
 * Plusieurs séances le même jour (matin / après-midi), ou sur des jours
 * différents : c'est la même chose — une journée de plus ou un créneau de plus.
 *
 * Chaque changement s'enregistre AUSSITÔT (pas de bouton « Enregistrer ») : un
 * plan se construit par petites touches, souvent au téléphone avec le client,
 * et rien ne doit se perdre en fermant. Les champs texte s'enregistrent à la
 * sortie du champ.
 *
 * Seul TIM modifie ; le partenaire voit le même écran en lecture seule.
 */

async function api<T = { doc: Record<string, unknown> }>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/payload-api/${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const first = data?.errors?.[0];
    throw new Error(first?.data?.errors?.[0]?.message ?? first?.message ?? "L'enregistrement a échoué.");
  }
  return data as T;
}

/** Une journée telle qu'elle arrive de l'API (relations en id). */
const toDay = (d: Record<string, unknown>): Day => ({
  id: d.id as number | string,
  date: (d.date as string) ?? null,
  mode: (d.mode as string) ?? "sur-place",
  location: (d.location as string) ?? "",
  link: (d.link as string) ?? "",
  locationDetails: (d.locationDetails as string) ?? "",
  checklist: (d.checklist as Day["checklist"]) ?? null,
  emails: (d.emails as Day["emails"]) ?? null,
  trainerType: (d.trainerType as string) ?? "tim",
  trainer: idOf(d.trainer),
  trainerName: (d.trainerName as string) ?? null,
});

const toSession = (s: Record<string, unknown>): PlanSession => ({
  id: s.id as number | string,
  day: idOf(s.day) as number | string,
  startTime: (s.startTime as string) ?? "",
  endTime: (s.endTime as string) ?? "",
  profiles: (s.profiles as string[]) ?? [],
  participants: ((s.participants as unknown[]) ?? []).map(idOf).filter((v): v is number | string => v != null),
  attendance: ((s.attendance as unknown[]) ?? []).map(idOf).filter((v): v is number | string => v != null),
  accessDelivery: (s.accessDelivery as string) ?? null,
  status: (s.status as string) ?? "planifiee",
});

export function TrainingPlanEditor({
  trainingId,
  clientId,
  partnerId,
  companyName,
  defaultAccessDelivery,
  clientAddress,
  readOnly,
  admin = false,
  userId,
  signable = true,
  userName,
  onStatusChange,
  onClose,
}: {
  /** Nom de la personne connectée : qui a coché un point de la préparation. */
  userName?: string | null;
  /** La formation vient de se terminer ou de se rouvrir (droits de l'écran à jour). */
  onStatusChange?: (status: string) => void;
  /** Faux pour une formation annulée : plus rien ne s'émarge. */
  signable?: boolean;
  clientAddress?: ClientAddress;
  /** TIM : émarge toutes les journées. */
  admin?: boolean;
  /** Le formateur d'une journée l'émarge aussi, même partenaire. */
  userId?: number | string | null;
  trainingId: number | string;
  clientId: number | string;
  partnerId: number | string | null;
  companyName?: string;
  defaultAccessDelivery?: string | null;
  readOnly: boolean;
  onClose: () => void;
}) {
  const [days, setDays] = useState<Day[]>([]);
  const [sessions, setSessions] = useState<PlanSession[]>([]);
  const [contacts, setContacts] = useState<PlanContact[]>([]);
  const [timUsers, setTimUsers] = useState<User[]>([]);
  const [partnerUsers, setPartnerUsers] = useState<User[]>([]);
  const [accessDefault, setAccessDefault] = useState(defaultAccessDelivery ?? "formateur");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"plan" | "preparation" | "impressions" | "emails">("plan");

  const load = useCallback(async () => {
    try {
      const by = `where[training][equals]=${trainingId}&depth=0&limit=300`;
      const [d, s, c] = await Promise.all([
        api<{ docs: Record<string, unknown>[] }>(`training-days?${by}`),
        api<{ docs: Record<string, unknown>[] }>(`training-sessions?${by}`),
        api<{ docs: PlanContact[] }>(`client-contacts?where[client][equals]=${clientId}&depth=0&limit=300&sort=lastName`),
      ]);
      setDays(d.docs.map(toDay));
      setSessions(s.docs.map(toSession));
      setContacts(c.docs);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [trainingId, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Les formateurs possibles : comptes TIM, comptes du partenaire du client.
  // Lecture réservée à l'admin (Users) — inutile en lecture seule.
  useEffect(() => {
    if (readOnly) return;
    void api<{ docs: User[] }>("users?where[roles][in][0]=admin&where[roles][in][1]=super-admin&depth=0&limit=100&sort=firstName")
      .then((r) => setTimUsers(r.docs))
      .catch(() => setTimUsers([]));
    if (partnerId != null) {
      void api<{ docs: User[] }>(`users?where[partner][equals]=${partnerId}&depth=0&limit=100&sort=firstName`)
        .then((r) => setPartnerUsers(r.docs))
        .catch(() => setPartnerUsers([]));
    }
  }, [readOnly, partnerId]);

  // Fermer enregistre d'abord le champ en cours de saisie (il s'enregistre à
  // la sortie) : sans ce blur, Échap perdait le texte tapé.
  const close = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    onClose();
  }, [onClose]);

  useEffect(() => {
    // Échap ferme d'abord ce qui est ouvert PAR-DESSUS (aperçu d'un e-mail,
    // réglage d'une date d'envoi), pas tout le plan.
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !document.querySelector(".email-preview, .jr-datepop, .tr-attend, .tr-cancel") && close();
    // Phase de CAPTURE : on passe avant les fenêtres ouvertes par-dessus, qui
    // se ferment sur la même touche — sinon elles auraient déjà disparu quand
    // on vérifie leur présence, et le plan se fermerait avec elles.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  /** Écriture avec indicateur ; en cas d'échec, on recharge l'état serveur. */
  const write = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setSaving((n) => n + 1);
      try {
        return await fn();
      } catch (e) {
        toast.error((e as Error).message);
        await load();
        return null;
      } finally {
        setSaving((n) => n - 1);
      }
    },
    [load],
  );

  /**
   * Écritures d'une même ligne mises EN FILE, et l'écran reste la référence.
   *
   * Deux clics rapides (cocher A, puis B) partent l'un après l'autre : le
   * serveur reçoit [A] puis [A, B], jamais l'inverse. Et la réponse ne
   * réécrit pas l'état local — elle arriverait après le clic suivant et
   * l'effacerait. Seul le nom du formateur, calculé par le serveur, en est lu.
   * En cas d'échec, `write` recharge l'état serveur.
   */
  const queues = useRef(new Map<string, Promise<unknown>>());
  const enqueue = (key: string, fn: () => Promise<unknown>) => {
    const next = (queues.current.get(key) ?? Promise.resolve()).then(() => write(fn));
    queues.current.set(key, next);
  };

  const patchDay = (id: Day["id"], patch: Partial<Day>) => {
    setDays((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    enqueue(`d${id}`, async () => {
      const r = await api(`training-days/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if ("trainer" in patch) {
        setDays((ds) => ds.map((d) => (d.id === id ? { ...d, trainerName: toDay(r.doc).trainerName } : d)));
      }
    });
  };

  /** Le statut de la formation a pu bouger (dernier créneau annulé, supprimé) : on le relit. */
  const refreshStatus = useCallback(async () => {
    const r = await api<{ status?: string }>(`trainings/${trainingId}?depth=0`).catch(() => null);
    if (r?.status) onStatusChange?.(r.status);
  }, [trainingId, onStatusChange]);

  const patchSession = (id: PlanSession["id"], patch: Partial<PlanSession>) => {
    setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    enqueue(`s${id}`, async () => {
      await api(`training-sessions/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if ("status" in patch) await refreshStatus();
    });
  };

  const createDay = async (): Promise<Day | null> =>
    write(async () => {
      const r = await api("training-days", {
        method: "POST",
        body: JSON.stringify({ training: trainingId, mode: "sur-place", trainerType: "tim" }),
      });
      const day = toDay(r.doc);
      setDays((ds) => [...ds, day]);
      return day;
    });

  const createSession = async (dayId: Day["id"], body: Partial<PlanSession>): Promise<PlanSession | null> =>
    write(async () => {
      const r = await api("training-sessions", {
        method: "POST",
        body: JSON.stringify({ day: dayId, order: sessions.length + 1, ...body }),
      });
      const s = toSession(r.doc);
      setSessions((ss) => [...ss, s]);
      return s;
    });

  /** Créneau suivant : le matin si la journée est vide, l'après-midi ensuite. */
  const addSession = async (dayId: Day["id"]) => {
    const inDay = sessionsOfDay(sessions, dayId).filter((s) => s.status !== "annulee");
    const slot = DAY_SLOTS[inDay.length] ?? { startTime: "", endTime: "" };
    // Le premier profil du client qui n'a pas encore de séance — sinon l'admin.
    const covered = new Set(sessions.filter((s) => s.status !== "annulee").flatMap((s) => s.profiles ?? []));
    const present = PROFILS.map((p) => p.key).filter((k) => contacts.some((c) => c.licenceProfile === k));
    const profile = present.find((k) => !covered.has(k)) ?? present[0] ?? "admin";
    await createSession(dayId, {
      ...slot,
      profiles: [profile],
      participants: matchingContacts(contacts, [profile]).map((c) => c.id),
    });
  };

  const removeDay = (day: Day) => {
    const n = sessionsOfDay(sessions, day.id).length;
    if (n && !window.confirm(`Supprimer cette journée et ses ${n} séance${n > 1 ? "s" : ""} ?`)) return;
    setDays((ds) => ds.filter((d) => d.id !== day.id));
    setSessions((ss) => ss.filter((s) => String(s.day) !== String(day.id)));
    enqueue(`d${day.id}`, () => api(`training-days/${day.id}`, { method: "DELETE" }));
  };

  const removeSession = (s: PlanSession) => {
    if (!window.confirm("Supprimer ce créneau ?")) return;
    setSessions((ss) => ss.filter((x) => x.id !== s.id));
    enqueue(`s${s.id}`, async () => {
      await api(`training-sessions/${s.id}`, { method: "DELETE" });
      await refreshStatus();
    });
  };

  const applyFormula = async (f: Formula | null) => {
    setBusy(true);
    try {
      const draft = f ? draftFromFormula(f, contacts) : [[]];
      for (const daySessions of draft) {
        const day = await createDay();
        if (!day) return;
        for (const s of daySessions) await createSession(day.id, s);
      }
    } finally {
      setBusy(false);
    }
  };

  // L'horloge est lue à l'ouverture du plan : l'émargement s'ouvre au jour J.
  const [openedAt] = useState(() => Date.now());
  const canSignDay = (day: Day) =>
    signable && (admin || (userId != null && String(day.trainer) === String(userId))) && canSignOn(day.date, openedAt);

  /** Émarger (ou annuler l'émargement) : le geste qui valide la séance. */
  const signSession = (session: PlanSession, attendance: (number | string)[] | null): Promise<boolean> => {
    // Dans la file du créneau : une modification de participants encore en
    // route doit arriver AVANT l'émargement qui s'appuie dessus.
    const key = `s${session.id}`;
    const run = (queues.current.get(key) ?? Promise.resolve()).then(() => doSign(session, attendance));
    queues.current.set(key, run);
    return run;
  };
  const doSign = async (session: PlanSession, attendance: (number | string)[] | null): Promise<boolean> => {
    setSaving((n) => n + 1);
    try {
      const res = await fetch("/api/admin/training-attendance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, attendance }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "L'émargement n'a pas pu être enregistré.");
      setSessions((ss) =>
        ss.map((s) =>
          s.id === session.id
            ? { ...s, attendance: attendance ?? [], status: attendance ? "realisee" : "planifiee" }
            : s,
        ),
      );
      const change = data?.trainingChange as string | null;
      if (change === "termine") toast.success("Toutes les séances sont réalisées : formation terminée.");
      else if (change === "ouvert") toast.success("Émargement annulé : la formation est rouverte.");
      else if (change === "refuse")
        toast.warning("Émargement annulé, mais la formation reste terminée : une autre formation est ouverte pour ce client.");
      else toast.success(attendance ? "Séance émargée." : "Émargement annulé.");
      if (change === "termine" || change === "ouvert") onStatusChange?.(change);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSaving((n) => n - 1);
    }
  };

  /** Cocher / décocher des personnes dans un créneau ; son groupe suit. */
  const toggleParticipants = (session: PlanSession, ids: (number | string)[], on: boolean) => {
    const current = (session.participants ?? []).map(String);
    const wanted = ids.map(String);
    const next = on ? [...current, ...wanted.filter((id) => !current.includes(id))] : current.filter((id) => !wanted.includes(id));
    patchSession(session.id, {
      participants: next.map(asId),
      profiles: profilesOf(next, contacts, session.profiles ?? []),
    });
  };

  const changeAccessDefault = (v: string) => {
    setAccessDefault(v);
    enqueue(`t${trainingId}`, () =>
      api(`trainings/${trainingId}`, { method: "PATCH", body: JSON.stringify({ defaultAccessDelivery: v }) }),
    );
  };

  const sorted = useMemo(() => sortDays(days), [days]);
  const steps = useMemo(() => planSteps(days, sessions), [days, sessions]);
  const warnings = useMemo(() => planWarnings(days, sessions, contacts), [days, sessions, contacts]);
  // Où se trouve chaque point d'attention, pour la colonne de droite.
  const whereOf = useMemo(() => {
    const at = new Map<string, string>();
    sorted.forEach((d, i) => {
      at.set(`d${d.id}`, `Journée ${i + 1}`);
      for (const s of sessionsOfDay(sessions, d.id)) {
        at.set(`s${s.id}`, `Journée ${i + 1}${s.startTime ? ` · ${s.startTime}` : ""}`);
      }
    });
    return (w: { dayId?: number | string; sessionId?: number | string }) =>
      (w.sessionId != null ? at.get(`s${w.sessionId}`) : undefined) ?? (w.dayId != null ? at.get(`d${w.dayId}`) : undefined);
  }, [sorted, sessions]);
  const unprofiled = contacts.filter((c) => !c.licenceProfile).length;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="tr-plan" role="dialog" aria-modal="true" aria-label="Plan de formation">
      <header className="tr-plan__head">
        <div className="tr-plan__who">
          <p className="tr-plan__eyebrow">Plan de formation{readOnly ? " · lecture seule" : ""}</p>
          <h2 className="tr-plan__title">{companyName ?? "Client"}</h2>
        </div>
        <ol className="tr-steps" aria-label="Étapes constatées">
          {steps.map((s) => (
            <li key={s.key} className={`tr-steps__item${s.done ? " is-done" : ""}`} title={s.hint}>
              <span className="tr-steps__dot" aria-hidden="true">
                {s.done && (
                  <svg viewBox="0 0 12 12" width="10" height="10">
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {s.label}
            </li>
          ))}
        </ol>
        <div className="tr-plan__actions">
          <span className="tr-plan__saved" aria-live="polite">
            {saving > 0 ? "Enregistrement…" : readOnly ? "" : "Enregistré"}
          </span>
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={close}>
            Fermer
          </button>
        </div>
      </header>

      <nav className="tr-tabs" aria-label="Sections du plan">
        <button type="button" className={`tr-tabs__tab${tab === "plan" ? " is-on" : ""}`} onClick={() => setTab("plan")}>
          Plan
        </button>
        <button
          type="button"
          className={`tr-tabs__tab${tab === "preparation" ? " is-on" : ""}`}
          // Relu en arrivant sur l'onglet (une convocation a pu partir depuis),
          // APRÈS les enregistrements en cours : relire avant écraserait ce qui
          // vient d'être coché ou saisi. Déjà sur l'onglet : rien à relire.
          onClick={async () => {
            if (tab === "preparation") return;
            setTab("preparation");
            await Promise.all([...queues.current.values()]);
            await load();
          }}
        >
          Préparation
        </button>
        <button
          type="button"
          className={`tr-tabs__tab${tab === "impressions" ? " is-on" : ""}`}
          onClick={() => setTab("impressions")}
        >
          Impressions
        </button>
        <button type="button" className={`tr-tabs__tab${tab === "emails" ? " is-on" : ""}`} onClick={() => setTab("emails")}>
          E-mails
        </button>
      </nav>

      <div className="tr-plan__body">
        <main className="tr-plan__main">
          {tab === "emails" ? (
            <TrainingEmails trainingId={trainingId} readOnly={readOnly} />
          ) : tab === "impressions" ? (
            <TrainingPrints trainingId={trainingId} days={sorted} sessions={sessions} admin={admin} userId={userId} />
          ) : tab === "preparation" ? (
            <TrainingPreparation
              days={sorted}
              sessions={sessions}
              contacts={contacts}
              readOnly={readOnly}
              userName={userName}
              onPatchDay={patchDay}
            />
          ) : loading ? (
            <p className="tr-plan__empty">Chargement du plan…</p>
          ) : !days.length ? (
            readOnly ? (
              <p className="tr-plan__empty">TIM n&apos;a pas encore construit le plan de cette formation.</p>
            ) : (
              <FormulaPicker contacts={contacts} busy={busy} onPick={applyFormula} />
            )
          ) : (
            <>
              <h3 className="tr-section-title tr-section-title--first">Déroulé</h3>
              {sorted.map((day, i) => (
                <DayCard
                  key={day.id}
                  index={i + 1}
                  day={day}
                  sessions={sessionsOfDay(sessions, day.id)}
                  contacts={contacts}
                  warnings={warnings}
                  trainers={day.trainerType === "partenaire" ? partnerUsers : timUsers}
                  accessDefault={accessDefault}
                  clientAddress={clientAddress}
                  readOnly={readOnly}
                  canSign={canSignDay(day)}
                  canUndoSign={admin && signable}
                  canPrint={admin || (userId != null && String(day.trainer) === String(userId))}
                  onSign={signSession}
                  onPatch={(p) => patchDay(day.id, p)}
                  onRemove={() => removeDay(day)}
                  onAddSession={() => addSession(day.id)}
                  onPatchSession={patchSession}
                  onRemoveSession={removeSession}
                />
              ))}
              {!readOnly && (
                <button type="button" className="tr-add" disabled={busy || saving > 0} onClick={() => void createDay()}>
                  + Ajouter une journée
                </button>
              )}
              <PeopleMatrix days={days} sessions={sessions} contacts={contacts} readOnly={readOnly} onToggle={toggleParticipants} />
            </>
          )}
        </main>

        <aside className="tr-plan__aside">
          <section className="tr-aside">
            <h3 className="tr-aside__title">Remise des accès</h3>
            <p className="tr-aside__text">Qui donne leurs identifiants aux participants, par défaut :</p>
            <select
              className="ctr-select tr-aside__select"
              value={accessDefault}
              disabled={readOnly}
              onChange={(e) => changeAccessDefault(e.target.value)}
            >
              {ACCESS_DELIVERY.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="tr-aside__hint">Modifiable séance par séance.</p>
          </section>

          <section className="tr-aside">
            <h3 className="tr-aside__title">Points d&apos;attention</h3>
            {warnings.length ? (
              <ul className="tr-warns">
                {warnings.map((w, i) => (
                  <li key={i} className={`tr-warn tr-warn--${w.level}`}>
                    {whereOf(w) && <strong className="tr-warn__where">{whereOf(w)}</strong>}
                    {w.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tr-aside__text">{days.length ? "Rien à signaler." : "Le plan est vide."}</p>
            )}
          </section>

          <section className="tr-aside">
            <h3 className="tr-aside__title">Contacts du client</h3>
            <p className="tr-aside__text">
              {contacts.length} contact{contacts.length > 1 ? "s" : ""}
              {unprofiled ? `, dont ${unprofiled} sans profil de licence` : ""}. Les participants se choisissent parmi eux ;
              leur profil les range sous la bonne séance.
            </p>
            <p className="tr-aside__hint">Un contact manque ? Ajoutez-le dans l&apos;onglet « Contact » de la fiche, puis rouvrez le plan.</p>
          </section>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

