"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityDrawer,
  type ActivityDraft,
  type DraftKind,
} from "@/modules/partner/admin/ActivityDrawer";
import { ActivityIcon } from "@/modules/partner/admin/ActivityIcons";
import {
  ACTIVITY_KINDS,
  MANUAL_KINDS,
  activityKind,
  taskKindLabel,
  taskKindMeta,
} from "@/modules/partner/lib/activity";
import { PARIS_TZ, dayKey } from "@/core/lib/dates";
import { firstStartableMonday, leadDaysOf } from "@/modules/marketing/lib/journey";
import { tarifsMarkdown } from "@/modules/partner/lib/pricing";
import { markdownToHtml } from "@/modules/partner/lib/rich-text";

/**
 * Onglet « Historique » d'une opportunité : tout ce qu'on a fait, et ce qui reste
 * à faire.
 *
 * Deux blocs, dans cet ordre :
 *  - « À faire » : les tâches ouvertes, échéance en tête. Une tâche noyée dans la
 *    chronologie est une tâche oubliée — c'est la seule partie de l'écran qui
 *    demande une action.
 *  - la CHRONOLOGIE : notes, appels, réunions, e-mails envoyés, tâches terminées
 *    et journal automatique (changements d'étape, contrat, dossier), du plus
 *    récent au plus ancien.
 *
 * La saisie se fait dans un DRAWER (ActivityDrawer) ouvert par les boutons du
 * haut : la chronologie reste lisible derrière — on écrit souvent en réponse à
 * ce qu'on vient d'y lire. Elle écrit directement dans `client-activities` via
 * l'API REST, sauf l'e-mail qui passe par une route dédiée (il faut l'ENVOYER
 * avant d'en garder la trace, cf. /api/partner/client-email).
 */

type Activity = {
  id: number | string;
  type?: string;
  title?: string | null;
  content?: string | null;
  occurredAt?: string;
  dueDate?: string | null;
  reminderAt?: string | null;
  highPriority?: boolean;
  taskKind?: string | null;
  done?: boolean;
  recipients?: string | null;
  attachments?: ({ id: number | string; url?: string; filename?: string } | number)[] | null;
  author?: { email?: string; name?: string } | number | string | null;
};

const API = "/payload-api/client-activities";

const authorLabel = (a: Activity["author"]): string | null => {
  if (!a || typeof a !== "object") return null;
  return a.name || a.email || null;
};

const dt = (iso?: string | null, withTime = true): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

/** Jour d'un instant, ou « — » quand la date manque (cf. core/lib/dates). */
const dayOf = (iso?: string): string => (iso ? dayKey(iso) : "—");

/** « Aujourd'hui », « Hier », sinon « mardi 12 août ». */
const dayLabel = (iso?: string): string => {
  if (!iso) return "Date inconnue";
  const key = dayOf(iso);
  const today = dayOf(new Date().toISOString());
  const yesterday = dayOf(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Aujourd'hui";
  if (key === yesterday) return "Hier";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", {
    timeZone: PARIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
};

/** Heure seule : la date est déjà portée par l'en-tête du jour. */
const hourOf = (iso?: string): string =>
  iso
    ? new Date(iso).toLocaleTimeString("fr-FR", { timeZone: PARIS_TZ, hour: "2-digit", minute: "2-digit" })
    : "";

/** « en retard de 2 jours », « dans 3 heures » — l'urgence se lit d'un coup. */
const relativeDue = (iso?: string | null): { text: string; late: boolean } | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  const late = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor(abs / 3_600_000);
  const unit = days >= 1 ? `${days} jour${days > 1 ? "s" : ""}` : `${Math.max(hours, 1)} h`;
  return { text: late ? `en retard de ${unit}` : `dans ${unit}`, late };
};

export function ClientHistory() {
  const { id } = useDocumentInfo();
  // Adresse de la fiche : pré-remplit le destinataire d'un e-mail. La retaper
  // alors qu'elle est à l'écran n'apporte qu'une faute de frappe.
  const clientEmail = useFormFields(([fields]) => fields?.email?.value as string | undefined);
  const companyName = useFormFields(([fields]) => fields?.companyName?.value as string | undefined);
  // Partenaire de l'opportunité : c'est à SA fiche qu'un modèle enregistré
  // depuis ce composeur sera rattaché.
  // Prix réellement saisis pour CE client (onglet « Licences par profil »).
  const licences = useFormFields(([fields]) => {
    const out: Record<string, number> = {};
    for (const [path, field] of Object.entries(fields ?? {})) {
      if (!path.startsWith("licences.")) continue;
      const n = Number((field as { value?: unknown })?.value);
      if (!Number.isNaN(n)) out[path.slice("licences.".length)] = n;
    }
    return out;
  });
  const partnerId = useFormFields(([fields]) => {
    const v = fields?.partner?.value as unknown;
    return v && typeof v === "object" ? ((v as { id?: number | string }).id ?? null) : ((v as number | string) ?? null);
  });

  const [items, setItems] = useState<Activity[] | null>(null);
  const [contact, setContact] = useState<{ full: string; first: string } | null>(null);
  /**
   * Premier lundi démarrable, calculé avec le MÊME délai de préparation que le
   * modal de démarrage : annoncer au client une date que cet écran refuserait
   * ensuite serait la pire des incohérences.
   */
  const [firstMonday, setFirstMonday] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Geste en cours de saisie (null = aucun drawer ouvert). */
  const [kind, setKind] = useState<DraftKind | null>(null);
  /**
   * Activité en cours de CORRECTION (null = création).
   *
   * Seules les notes et les tâches se corrigent : ce sont des matières de
   * travail. Un e-mail envoyé et le journal automatique constatent ce qui a EU
   * LIEU — les réécrire ferait mentir l'historique, qui n'aurait alors plus
   * d'intérêt.
   */
  const [editing, setEditing] = useState<Activity | null>(null);
  /** Activité dont la suppression attend confirmation. */
  const [removing, setRemoving] = useState<number | string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(
        `${API}?where[client][equals]=${id}&sort=-occurredAt&limit=200&depth=1`,
        { credentials: "include" },
      );
      // Un refus ou une panne ne doit PAS se lire comme un historique vide :
      // « Rien pour l'instant » sur une fiche qui a dix notes est le pire des
      // mensonges — on croit avoir perdu le travail, ou pire, on le refait.
      if (!res.ok) throw new Error("Chargement de l'historique impossible.");
      const json = await res.json();
      setItems((json?.docs ?? []) as Activity[]);
    } catch (e) {
      setError((e as Error).message || "Chargement de l'historique impossible.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Délai de préparation du parcours « phase de test » → premier lundi possible.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/payload-api/marketing-journeys?where[key][equals]=phase-de-test&limit=1&depth=0",
          { credentials: "include" },
        );
        const doc = res.ok ? (await res.json())?.docs?.[0] : null;
        if (!cancelled) setFirstMonday(firstStartableMonday(leadDaysOf(doc?.steps ?? [])));
      } catch {
        // Modèle illisible : on reste sur le prochain lundi sans délai, plutôt
        // que de laisser la variable vide dans un e-mail déjà rédigé.
        if (!cancelled) setFirstMonday(firstStartableMonday());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Contact principal de l'opportunité (le plus ancien : celui du lead), pour
  // personnaliser les modèles d'e-mail.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/payload-api/client-contacts?where[client][equals]=${id}&limit=1&sort=createdAt&depth=0`,
          { credentials: "include" },
        );
        // Contact illisible → variables de modèle vides, ce qui se voit à
        // l'insertion. Pas d'alerte : le composeur reste utilisable.
        const json = res.ok ? await res.json() : { docs: [] };
        const c = json?.docs?.[0] as { firstName?: string; lastName?: string } | undefined;
        const first = (c?.firstName ?? "").trim();
        const full = [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim();
        if (!cancelled && full) setContact({ full, first: first || full });
      } catch {
        /* sans contact, les variables correspondantes s'effacent proprement */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const closeDrawer = () => {
    setKind(null);
    setEditing(null);
    setError(null);
  };

  /** Rouvre une note ou une tâche dans le drawer, pré-remplie. */
  const openEdit = (a: Activity) => {
    setEditing(a);
    setKind((a.type === "tache" ? "tache" : "note") as DraftKind);
    setError(null);
  };

  const remove = useCallback(
    async (id: number | string) => {
      setBusy(true);
      try {
        const res = await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error("Suppression impossible.");
        setRemoving(null);
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const openDrawer = (value: string) => {
    setKind(value as DraftKind);
    setError(null);
  };

  const { open: tasks, timeline } = useMemo(() => {
    const all = items ?? [];
    return {
      open: all
        .filter((a) => a.type === "tache" && !a.done)
        .sort((x, y) => Date.parse(x.dueDate ?? "") - Date.parse(y.dueDate ?? "")),
      timeline: all.filter((a) => !(a.type === "tache" && !a.done)),
    };
  }, [items]);

  /** Nature affichée dans la chronologie (`null` = tout). */
  const [filter, setFilter] = useState<string | null>(null);

  const shown = useMemo(
    () => (filter ? timeline.filter((a) => a.type === filter) : timeline),
    [filter, timeline],
  );

  /**
   * Chronologie découpée par JOUR.
   *
   * Une liste de vingt lignes horodatées se lit mal : on cherche « ce qui s'est
   * passé ce jour-là », pas la 14ᵉ ligne. Les jours proches sont nommés
   * (« Aujourd'hui », « Hier ») — c'est ainsi qu'on en parle.
   */
  const days = useMemo(() => {
    const out: { key: string; label: string; items: Activity[] }[] = [];
    for (const a of shown) {
      const key = dayOf(a.occurredAt);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(a);
      else out.push({ key, label: dayLabel(a.occurredAt), items: [a] });
    }
    return out;
  }, [shown]);

  /** Compteur par nature, pour les filtres. */
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of timeline) map[a.type ?? "?"] = (map[a.type ?? "?"] ?? 0) + 1;
    return map;
  }, [timeline]);

  const submit = useCallback(
    async (draft: ActivityDraft) => {
      if (!id) return;
      setBusy(true);
      setError(null);
      try {
        if (draft.kind === "email") {
          // L'e-mail part d'abord ; sa trace n'est écrite que s'il est parti.
          const res = await fetch("/api/partner/client-email", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            // Le brouillon est transmis EN ENTIER. Ne recopier que trois champs
            // faisait taire en silence tout ce que le composeur a gagné depuis :
            // l'expéditeur choisi (d'où un refus « adresse non configurée »
            // alors qu'elle l'était), les copies, la signature, les fichiers.
            body: JSON.stringify({
              client: id,
              to: draft.to,
              cc: draft.cc,
              bcc: draft.bcc,
              from: draft.from,
              subject: draft.title,
              body: draft.content,
              signature: draft.signature,
              attachments: draft.attachments,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error ?? "Envoi impossible.");
        } else {
          const body: Record<string, unknown> = {
            client: id,
            type: draft.kind,
            title: draft.title || null,
            content: draft.content || null,
          };
          if (draft.kind === "tache") {
            body.taskKind = draft.taskKind;
            body.dueDate = draft.dueDate ?? null;
            body.reminderAt = draft.reminderAt ?? null;
            body.highPriority = Boolean(draft.highPriority);
            // Rappel MODIFIÉ (déplacé, ajouté ou retiré) : on efface la trace
            // d'envoi. Ne l'effacer qu'au retrait laissait un rappel déjà parti
            // marqué comme traité — repoussé à la semaine suivante, il ne serait
            // jamais reparti.
            if ((editing?.reminderAt ?? null) !== (draft.reminderAt ?? null)) {
              body.reminderSentAt = null;
            }
          }
          const res = await fetch(editing ? `${API}/${editing.id}` : API, {
            method: editing ? "PATCH" : "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json?.errors?.[0]?.message ?? "Enregistrement impossible.");
          }
        }
        setKind(null);
        setEditing(null);
        await load();
      } catch (e) {
        // Le drawer reste OUVERT sur une erreur : la saisie n'est pas perdue et
        // le message s'affiche là où l'on vient d'agir.
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [editing, id, load],
  );

  const toggleDone = useCallback(
    async (a: Activity) => {
      // Optimiste : cocher une tâche doit répondre tout de suite.
      setItems((cur) => (cur ?? []).map((x) => (x.id === a.id ? { ...x, done: !a.done } : x)));
      try {
        const res = await fetch(`${API}/${a.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: !a.done }),
        });
        if (!res.ok) throw new Error();
        await load();
      } catch {
        setItems((cur) => (cur ?? []).map((x) => (x.id === a.id ? { ...x, done: a.done } : x)));
        setError("Impossible de mettre à jour cette tâche.");
      }
    },
    [load],
  );

  if (!id) {
    return (
      <div className="tim-history">
        <p className="tim-history__empty">
          Enregistrez l&apos;opportunité pour commencer son historique.
        </p>
      </div>
    );
  }

  return (
    <div className="tim-history">
      {/* ── Les gestes, comme dans Brevo : une icône, un mot ─────────────── */}
      <div className="tim-history__actions">
        {MANUAL_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className="tim-history__action"
            onClick={() => openDrawer(k.value)}
            title={k.verb}
          >
            <span className="tim-history__action-icon" style={{ color: k.color }}>
              <ActivityIcon kind={k.value} />
            </span>
            {k.label}
          </button>
        ))}
      </div>

      {/* Erreur hors saisie (chargement, case à cocher) : celles du drawer
          s'affichent DANS le drawer, au plus près du geste. */}
      {error && !kind && (
        <p className="tim-history__error" role="alert" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      {kind && (
        <ActivityDrawer
          kind={kind}
          initial={
            editing
              ? {
                  title: editing.title,
                  content: editing.content,
                  taskKind: editing.taskKind,
                  dueDate: editing.dueDate,
                  reminderAt: editing.reminderAt,
                  highPriority: editing.highPriority,
                }
              : null
          }
          defaultTo={clientEmail}
          companyName={companyName}
          clientId={id}
          // Le premier contact de la fiche personnalise les modèles : c'est la
          // personne à qui l'on écrit, celle dont on tape le prénom à la main
          // une fois sur deux.
          templateContext={{
            partnerId,
            entreprise: companyName ?? null,
            email: clientEmail ?? null,
            contact: contact?.full ?? null,
            prenom: contact?.first ?? null,
            tarifs: tarifsMarkdown(licences),
            premier_lundi: firstMonday
              ? new Date(`${firstMonday}T00:00:00Z`).toLocaleDateString("fr-FR", {
                  timeZone: "UTC",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : null,
          }}
          busy={busy}
          error={error}
          onClose={closeDrawer}
          onSubmit={(draft) => void submit(draft)}
        />
      )}

      {/* ── À faire ───────────────────────────────────────────────────────── */}
      {tasks.length > 0 && (
        <section className="tim-history__section tim-history__section--todo">
          <h3 className="tim-history__title tim-history__title--todo">À faire ({tasks.length})</h3>
          <ul className="tim-history__tasks">
            {tasks.map((t) => {
              const rel = relativeDue(t.dueDate);
              return (
                <li
                  key={t.id}
                  className="tim-history__task"
                  style={{ borderLeftColor: taskKindMeta(t.taskKind).color }}
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => void toggleDone(t)}
                    aria-label="Marquer comme terminée"
                  />
                  <span className="tim-history__task-body">
                    <span className="tim-history__task-title">
                      {t.highPriority && (
                        <span className="tim-history__flag" title="Priorité haute">
                          ⚑
                        </span>
                      )}
                      <span
                        className="tim-history__task-kind"
                        style={taskKindMeta(t.taskKind)}
                      >
                        {taskKindLabel(t.taskKind) ?? "Tâche"}
                      </span>
                      {t.title && t.title !== taskKindLabel(t.taskKind) ? t.title : null}
                    </span>
                    {t.content && <span className="tim-history__task-note">{t.content}</span>}
                  </span>
                  {rel && (
                    <span
                      className={`tim-history__due${rel.late ? " tim-history__due--late" : ""}`}
                      title={dt(t.dueDate)}
                    >
                      {rel.text}
                    </span>
                  )}
                  <div className="tim-history__row-actions">
                    {removing === t.id ? (
                      <>
                        <button
                          type="button"
                          className="tim-history__mini tim-history__mini--danger"
                          disabled={busy}
                          onClick={() => void remove(t.id)}
                        >
                          Oui
                        </button>
                        <button
                          type="button"
                          className="tim-history__mini"
                          onClick={() => setRemoving(null)}
                        >
                          Non
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="tim-history__mini"
                          onClick={() => openEdit(t)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="tim-history__mini"
                          onClick={() => setRemoving(t.id)}
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Chronologie ───────────────────────────────────────────────────── */}
      <section className="tim-history__section">
        <div className="tim-history__head">
          <h3 className="tim-history__title">Historique</h3>
          {timeline.length > 0 && (
            <div className="tim-history__filters" role="tablist" aria-label="Filtrer l'historique">
              <button
                type="button"
                role="tab"
                aria-selected={filter === null}
                className={`tim-history__filter${filter === null ? " is-on" : ""}`}
                onClick={() => setFilter(null)}
              >
                Tout <span>{timeline.length}</span>
              </button>
              {ACTIVITY_KINDS.filter((k) => counts[k.value]).map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === k.value}
                  className={`tim-history__filter${filter === k.value ? " is-on" : ""}`}
                  onClick={() => setFilter(filter === k.value ? null : k.value)}
                >
                  {k.label} <span>{counts[k.value]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {items === null && <p className="tim-history__empty">Chargement…</p>}

        {items !== null && timeline.length === 0 && (
          <div className="tim-history__blank">
            <p className="tim-history__blank-title">Rien pour l&apos;instant</p>
            <p className="tim-history__blank-text">
              La première note, le premier e-mail ou le premier changement d&apos;étape
              s&apos;afficheront ici, du plus récent au plus ancien.
            </p>
          </div>
        )}

        {items !== null && timeline.length > 0 && shown.length === 0 && (
          <p className="tim-history__empty">Rien de ce type dans l&apos;historique.</p>
        )}

        {days.map((day) => (
          <div key={day.key} className="tim-history__day">
            <p className="tim-history__day-label">{day.label}</p>

            {/* Le rail vertical relie les événements d'une même journée : on lit
                une suite, pas des lignes indépendantes. */}
            <ol className="tim-history__list">
              {day.items.map((a) => {
                const k = activityKind(a.type);
                const who = authorLabel(a.author);
                const system = a.type === "systeme";
                const iconKind = a.type === "tache" ? (a.taskKind ?? "tache") : a.type;
                return (
                  <li
                    key={a.id}
                    className={`tim-history__item${system ? " tim-history__item--system" : ""}`}
                  >
                    {/* Une tâche porte la couleur de SA nature, la même que dans
                        le Kanban : un appel est turquoise des deux côtés. */}
                    <span
                      className="tim-history__dot"
                      style={
                        a.type === "tache"
                          ? taskKindMeta(a.taskKind)
                          : { color: k?.color, background: k?.bg }
                      }
                      title={a.type === "tache" ? (taskKindLabel(a.taskKind) ?? k?.label) : k?.label}
                    >
                      <ActivityIcon kind={iconKind} />
                    </span>

                    <div className="tim-history__card">
                      <p className="tim-history__item-head">
                        <strong className="tim-history__item-title">
                          {a.title || k?.label}
                        </strong>
                        {a.done && a.type === "tache" && (
                          <span className="tim-history__done">terminée</span>
                        )}
                        <span className="tim-history__hour" title={dt(a.occurredAt)}>
                          {hourOf(a.occurredAt)}
                        </span>
                      </p>

                      {a.content &&
                        // Notes ET e-mails sont rédigés en Markdown : les
                        // afficher bruts laissait des « ## » et des « ** » en
                        // clair dans la chronologie.
                        (a.type === "note" || a.type === "email" ? (
                          // HTML reconstruit par `markdownToHtml` à partir de texte
                          // ÉCHAPPÉ et d'une liste fermée de balises : ce n'est pas
                          // la saisie de l'utilisateur qu'on réinjecte, c'est notre
                          // propre rendu de son Markdown (cf. lib/rich-text.ts).
                          <div
                            className="tim-history__item-rich"
                            dangerouslySetInnerHTML={{ __html: markdownToHtml(a.content) }}
                          />
                        ) : (
                          <p className="tim-history__item-text">{a.content}</p>
                        ))}

                      {/* Corriger ou retirer : réservé à ce qu'on a ÉCRIT (note,
                          tâche). Un e-mail parti et le journal automatique
                          constatent des faits — les retoucher ferait mentir
                          l'historique. */}
                      {(a.type === "note" || a.type === "tache") && (
                        <div className="tim-history__row-actions">
                          {removing === a.id ? (
                            <>
                              <span className="tim-history__confirm">Supprimer ?</span>
                              <button
                                type="button"
                                className="tim-history__mini tim-history__mini--danger"
                                disabled={busy}
                                onClick={() => void remove(a.id)}
                              >
                                Oui
                              </button>
                              <button
                                type="button"
                                className="tim-history__mini"
                                onClick={() => setRemoving(null)}
                              >
                                Non
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="tim-history__mini"
                                onClick={() => openEdit(a)}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className="tim-history__mini"
                                onClick={() => setRemoving(a.id)}
                              >
                                Supprimer
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {(who || a.recipients || a.attachments?.length) && (
                        <p className="tim-history__meta">
                          {who && <span>{who}</span>}
                          {a.recipients && <span>à {a.recipients}</span>}
                          {a.attachments?.map((f) =>
                            typeof f === "object" && f?.url ? (
                              <a
                                key={f.id}
                                className="tim-history__attachment"
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {f.filename ?? "pièce jointe"}
                              </a>
                            ) : null,
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}
