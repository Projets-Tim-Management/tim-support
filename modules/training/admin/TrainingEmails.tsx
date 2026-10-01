"use client";

import { toast } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { EmailPreview } from "@/core/admin/EmailPreview";
import { MailDateEditor } from "@/modules/marketing/admin/MailDateEditor";
import { fmtDay } from "@/modules/training/admin/TrainingPlanParts";
import { CANCEL_REASONS } from "@/modules/training/lib/email-schedule";

/**
 * Onglet « E-mails » du plan de formation — le pendant de celui de la phase de
 * test : pour chaque journée, chaque envoi, quand il part (date réglable :
 * précise, dès que possible, ne pas envoyer, rétablir), son état, à qui il est
 * parti et à qui il ira, et l'aperçu du message tel qu'il partira.
 *
 * Lecture seule pour le partenaire ; « Envoyer maintenant » réservé à TIM.
 */

type Person = { email: string; name: string; sentAt?: string | null };
type Row = {
  key: string;
  label: string;
  audienceLabel: string;
  detail: string;
  scheduledAt: string | null;
  computedAt: string | null;
  overridden: boolean;
  sentAt: string | null;
  status: string;
  statusLabel: string;
  sentTo: Person[];
  willGoTo: Person[];
  cancel: { at: string; reason: string | null; reasonLabel: string; note: string | null; by: string | null } | null;
};
type DayEmails = { dayId: number | string; date: string | null; emails: Row[] };

/** États qui disent « ne partira pas » : MailDateEditor les affiche « sans objet ». */
const MOOT = new Set(["journee-passee", "formation-close", "convocation-recente", "trop-tard", "annule"]);

/** Inutile d'annuler ce qui ne partira plus de toute façon. */
const NOT_CANCELLABLE = new Set(["journee-passee", "formation-close", "annule"]);

const TONE: Record<string, string> = {
  annule: "is-cancelled",
  envoyer: "is-due",
  "deja-envoye": "is-sent",
  "a-venir": "is-planned",
  "attente-emargement": "is-waiting",
  "journee-sans-date": "is-waiting",
  "aucun-destinataire": "is-warn",
  "trop-tard": "is-warn",
};

const fmtWhen = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    : "";

const names = (people: Person[], max = 4) =>
  people.length <= max ? people.map((p) => p.name).join(", ") : `${people.slice(0, max).map((p) => p.name).join(", ")} +${people.length - max}`;

export function TrainingEmails({ trainingId, readOnly }: { trainingId: number | string; readOnly: boolean }) {
  const [days, setDays] = useState<DayEmails[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/training-emails?training=${trainingId}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { admin: boolean; days: DayEmails[] };
      setDays(data.days);
      setAdmin(data.admin);
    } catch {
      toast.error("Impossible de lire les envois de cette formation.");
      setDays([]);
    }
  }, [trainingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, okMessage?: string) => {
    setBusy(`${body.dayId}:${body.key}`);
    try {
      const res = await fetch("/api/admin/training-emails", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "L'opération a échoué.");
      if (okMessage) toast.success(okMessage);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const sendNow = (day: DayEmails, row: Row) => {
    const who = row.willGoTo.length ? row.willGoTo : row.sentTo;
    const again = !row.willGoTo.length && row.sentTo.length > 0;
    if (!who.length) return;
    const msg = again
      ? `Renvoyer « ${row.label} » à ${names(who, 10)} ? Ils l'ont déjà reçu.`
      : `Envoyer « ${row.label} » maintenant à ${names(who, 10)} ?`;
    if (!window.confirm(msg)) return;
    void post({ dayId: day.dayId, key: row.key, action: "send" }, "Envoyé.");
  };

  if (!days) return <p className="tr-plan__empty">Chargement des envois…</p>;
  if (!days.length) {
    return (
      <p className="tr-plan__empty">
        Aucune journée pour l&apos;instant. Construisez le plan : les envois se programment dès qu&apos;une journée est datée.
      </p>
    );
  }

  const canAct = admin && !readOnly;

  return (
    <div className="tr-mails">
      <p className="tr-section-hint">
        Les envois partent tout seuls, à l&apos;heure prévue (heure de Paris). Une journée fixée à moins de 7 jours resserre
        les dates : rien ne part dans le passé, la convocation part au plus vite.
      </p>
      {days.map((day, i) => (
        <section key={day.dayId} className="tr-day">
          <div className="tr-day__top">
            <span className="tr-day__badge">Journée {i + 1}</span>
            <h3 className={`tr-day__title${day.date ? "" : " is-missing"}`}>{fmtDay(day.date)}</h3>
          </div>
          <ol className="tr-mails__list">
            {day.emails.map((row) => {
              const k = `${day.dayId}:${row.key}`;
              return (
                <li key={row.key} className="tr-mail">
                  <div className="tr-mail__what">
                    <span className="tr-mail__label">{row.label}</span>
                    <span className="tr-mail__to">→ {row.audienceLabel}</span>
                    <span className="tr-mail__detail">{row.detail}</span>
                  </div>

                  <div className="tr-mail__when">
                    <MailDateEditor
                      subject={row.label}
                      scheduledAt={row.scheduledAt}
                      computedAt={row.computedAt}
                      overridden={row.overridden}
                      sentAt={row.willGoTo.length ? null : row.sentAt}
                      readOnly={!canAct || !day.date}
                      sansObjet={MOOT.has(row.status) ? row.statusLabel : null}
                      onChange={(at, overridden) => void post({ dayId: day.dayId, key: row.key, action: "set", at, overridden })}
                    />
                  </div>

                  <div className="tr-mail__state">
                    <span className={`tr-mail__status ${TONE[row.status] ?? ""}`}>{row.statusLabel}</span>
                    {row.cancel && (
                      <span className="tr-mail__people">
                        {row.cancel.by ? `par ${row.cancel.by}, ` : ""}le {fmtWhen(row.cancel.at)}
                        {row.cancel.note ? ` — « ${row.cancel.note} »` : ""}
                      </span>
                    )}
                    {row.sentTo.length > 0 && (
                      <span className="tr-mail__people" title={row.sentTo.map((p) => `${p.name} <${p.email}> — ${fmtWhen(p.sentAt)}`).join("\n")}>
                        Envoyé à {names(row.sentTo)}
                        {row.sentAt ? ` · ${fmtWhen(row.sentAt)}` : ""}
                      </span>
                    )}
                    {row.willGoTo.length > 0 && !row.cancel && (
                      <span className="tr-mail__people tr-mail__people--next" title={row.willGoTo.map((p) => `${p.name} <${p.email}>`).join("\n")}>
                        {row.sentTo.length ? "Reste à envoyer à" : "Ira à"} {names(row.willGoTo)}
                      </span>
                    )}
                  </div>

                  <div className="tr-mail__actions">
                    <button
                      type="button"
                      className="tr-text-btn"
                      disabled={!day.date}
                      onClick={() =>
                        setPreview({
                          url: `/api/admin/training-emails/preview?dayId=${day.dayId}&key=${row.key}`,
                          title: `${row.label} — ${fmtDay(day.date)}`,
                        })
                      }
                    >
                      Aperçu
                    </button>
                    {canAct && row.cancel && (
                      <button
                        type="button"
                        className="tr-text-btn tr-text-btn--strong"
                        disabled={busy === k}
                        onClick={() => void post({ dayId: day.dayId, key: row.key, action: "restore" }, "Envoi rétabli.")}
                      >
                        Rétablir
                      </button>
                    )}
                    {canAct && !row.cancel && !NOT_CANCELLABLE.has(row.status) && !(row.status === "deja-envoye" && !row.willGoTo.length) && (
                      <button type="button" className="tr-text-btn" onClick={() => setCancelling(cancelling === k ? null : k)}>
                        Annuler l&apos;envoi
                      </button>
                    )}
                    {canAct && !row.cancel && day.date && (row.willGoTo.length > 0 || row.sentTo.length > 0) && (
                      <button type="button" className="tr-text-btn tr-text-btn--strong" disabled={busy === k} onClick={() => sendNow(day, row)}>
                        {busy === k ? "Envoi…" : row.willGoTo.length ? "Envoyer maintenant" : "Renvoyer"}
                      </button>
                    )}
                  </div>

                  {cancelling === k && (
                    <CancelForm
                      label={row.label}
                      busy={busy === k}
                      onCancel={() => setCancelling(null)}
                      onConfirm={async (reason, note) => {
                        await post({ dayId: day.dayId, key: row.key, action: "cancel", reason, note }, "Envoi annulé.");
                        setCancelling(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {preview && <EmailPreview url={preview.url} title={preview.title} onClose={() => setPreview(null)} />}
    </div>
  );
}

/**
 * Annuler un envoi : ce qu'il annonçait a été vu autrement — au téléphone, sur
 * place. Le motif reste écrit sur la ligne : dans un mois, on saura que ce
 * n'était pas un oubli.
 */
function CancelForm({
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  label: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<string>("telephone");
  const [note, setNote] = useState("");
  return (
    <div className="tr-cancel" role="group" aria-label={`Annuler « ${label} »`}>
      <span className="tr-cancel__title">Pourquoi annuler « {label} » ?</span>
      <div className="tr-cancel__reasons">
        {CANCEL_REASONS.map((r) => (
          <label key={r.value} className="tr-cancel__reason">
            <input type="radio" name={`motif-${label}`} checked={reason === r.value} onChange={() => setReason(r.value)} />
            {r.label}
          </label>
        ))}
      </div>
      <input
        type="text"
        className="tr-input tr-cancel__note"
        placeholder="Précision (facultatif) : avec qui, quand…"
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="tr-cancel__foot">
        <button type="button" className="tr-text-btn" disabled={busy} onClick={onCancel}>
          Fermer
        </button>
        <button type="button" className="tr-sign-btn" disabled={busy} onClick={() => void onConfirm(reason, note)}>
          {busy ? "Annulation…" : "Annuler l'envoi"}
        </button>
      </div>
    </div>
  );
}
