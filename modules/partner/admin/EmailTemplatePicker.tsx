"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "@payloadcms/ui";

import { RichNoteEditor } from "@/modules/partner/admin/RichNoteEditor";
import { hasAdminRole } from "@/core/access";
import { templatePreview } from "@/modules/partner/lib/email-template";

/**
 * Modèles d'e-mail : la liste et la recherche restent DANS le composeur, sous
 * les yeux pendant qu'on écrit. Seule l'ÉCRITURE d'un modèle ouvre une fenêtre —
 * c'est le seul moment qui demande de la place et toute l'attention.
 *
 * La liste se DÉPLOIE par-dessus les champs suivants plutôt que de les pousser :
 * dans le flux, elle n'avait que la place d'une ligne et demie entre le bouton
 * et l'objet — on choisissait sans voir. Elle se referme au clic à côté, comme
 * tout menu déroulant.
 *
 * La liste mêle deux natures, distinguées par une pastille :
 *  - les modèles TIM, proposés à tous les partenaires. Un ADMIN les corrige
 *    ici même — et la correction profite à tout le monde ; un partenaire, lui,
 *    ne peut que les utiliser ou les « Dupliquer » pour s'en faire une version ;
 *  - les modèles du PARTENAIRE, qu'il crée, corrige et supprime ici même. C'est
 *    le seul écran des modèles : tout doit être possible sans en sortir.
 *
 * Dans les deux cas, le texte INSÉRÉ dans le message se modifie librement : un
 * modèle est un point de départ, jamais un cadre.
 *
 * La recherche porte sur le NOM, l'OBJET et le CORPS : on cherche rarement un
 * modèle par son titre, on cherche « celui où je parle du prix ».
 */

export interface EmailTemplate {
  id: number | string;
  name?: string;
  subject?: string;
  body?: string;
  /** `tim` = modèle de la maison (tous les partenaires le voient). */
  scope?: string;
}

const API = "/payload-api/email-templates";

type Draft = {
  id?: number | string;
  name: string;
  subject: string;
  body: string;
  /** Portée conservée à l'enregistrement : corriger un modèle TIM le laisse TIM. */
  scope?: string;
};

export function EmailTemplatePicker({
  templates,
  partnerId,
  onPick,
  onChanged,
  onClose,
}: {
  templates: EmailTemplate[];
  /** Partenaire auquel rattacher un modèle créé ici. */
  partnerId?: number | string | null;
  onPick: (t: EmailTemplate) => void;
  /** Rechargement de la liste après création / modification / suppression. */
  onChanged: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = hasAdminRole(user);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirming, setConfirming] = useState<number | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clic à côté = fermeture. `mousedown` et non `click` : un clic qui commence
  // dans la liste et finit ailleurs (glisser sur la barre de défilement) ne
  // doit pas la refermer sous les doigts.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      // Le formulaire d'écriture est rendu par portail, hors de `rootRef` :
      // tant qu'il est ouvert, on ne ferme rien.
      if (!el || draft) return;
      if (!el.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [draft, onClose]);

  // Échap ferme la fenêtre d'écriture si elle est ouverte, la liste sinon : un
  // seul niveau à la fois, sinon on perd une saisie en croyant fermer une liste.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (draft) setDraft(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [draft, onClose]);

  /** Les modèles TIM d'abord : ce sont eux qu'on cherche en arrivant. */
  const all = useMemo<EmailTemplate[]>(
    () =>
      [...templates].sort((a, b) =>
        a.scope === b.scope ? (a.name ?? "").localeCompare(b.name ?? "") : a.scope === "tim" ? -1 : 1,
      ),
    [templates],
  );

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((t) =>
      `${t.name ?? ""} ${t.subject ?? ""} ${t.body ?? ""}`.toLowerCase().includes(needle),
    );
  }, [q, all]);

  useEffect(() => {
    setIndex(0);
  }, [q]);

  const save = async () => {
    if (!draft?.name.trim() || !draft.subject.trim() || !draft.body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // « Dupliquer » a produit un brouillon SANS identifiant : il part donc en
      // création, et devient un modèle du partenaire.
      const editing = draft.id != null;
      const res = await fetch(editing ? `${API}/${draft.id}` : API, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          subject: draft.subject.trim(),
          body: draft.body.trim(),
          // Un modèle TIM le reste ; une création est toujours un modèle de
          // partenaire, rattaché à la fiche de l'opportunité ouverte.
          ...(editing
            ? draft.scope === "tim"
              ? { scope: "tim" }
              : {}
            : { partner: partnerId, scope: "partenaire" }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.errors?.[0]?.message ?? "Enregistrement impossible.");
      setDraft(null);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number | string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Suppression impossible.");
      setConfirming(null);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* ── Liste, déployée par-dessus le composeur ───────────────────────── */}
      <div className="tim-tpl" ref={rootRef}>
        <div className="tim-tpl__search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            className="tim-tpl__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom, objet, message…"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, found.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && found[index]) {
                e.preventDefault();
                onPick(found[index]);
              }
            }}
          />
          <button
            type="button"
            className="tim-tpl__new"
            onClick={() => setDraft({ name: "", subject: "", body: "" })}
          >
            Nouveau
          </button>
        </div>

        {error && !draft && (
          <p className="tim-tpl__error" role="alert">
            {error}
          </p>
        )}

        <ul className="tim-tpl__list">
          {found.map((t, i) => {
            const tim = t.scope === "tim";
            // Un modèle TIM ne se corrige que par un admin ; sinon on ne propose
            // que « Dupliquer », plutôt qu'un bouton qui échouerait au clic.
            const editable = !tim || isAdmin;
            return (
              <li key={t.id} className={`tim-tpl__item${i === index ? " is-on" : ""}`}>
                <button
                  type="button"
                  className="tim-tpl__use"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => onPick(t)}
                  title="Utiliser ce modèle"
                >
                  <span className="tim-tpl__name">
                    {t.name || "Sans nom"}
                    {tim && <span className="tim-tpl__badge">TIM</span>}
                  </span>
                  <span className="tim-tpl__subject">
                    <strong>Objet :</strong> {t.subject || "—"}
                  </span>
                  <span className="tim-tpl__preview">{templatePreview(t.body ?? "")}</span>
                </button>
                <div className="tim-tpl__actions">
                  {confirming === t.id ? (
                    <>
                      <span className="tim-tpl__confirm">Supprimer ?</span>
                      <button
                        type="button"
                        className="tim-tpl__mini tim-tpl__mini--danger"
                        disabled={busy}
                        onClick={() => void remove(t.id)}
                      >
                        Oui
                      </button>
                      <button type="button" className="tim-tpl__mini" onClick={() => setConfirming(null)}>
                        Non
                      </button>
                    </>
                  ) : (
                    <>
                      {tim && (
                        <button
                          type="button"
                          className="tim-tpl__mini"
                          title="En faire ma propre version, modifiable"
                          onClick={() =>
                            setDraft({
                              name: `${t.name} (ma version)`,
                              subject: t.subject ?? "",
                              body: t.body ?? "",
                            })
                          }
                        >
                          Dupliquer
                        </button>
                      )}
                      {editable && (
                        <>
                          <button
                            type="button"
                            className="tim-tpl__mini"
                            onClick={() =>
                              setDraft({
                                id: t.id,
                                name: t.name ?? "",
                                subject: t.subject ?? "",
                                body: t.body ?? "",
                                scope: t.scope,
                              })
                            }
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="tim-tpl__mini"
                            onClick={() => setConfirming(t.id)}
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {found.length === 0 && <li className="tim-tpl__empty">Aucun modèle ne correspond.</li>}
        </ul>

        <div className="tim-tpl__foot">
          <kbd>↓</kbd> <kbd>↑</kbd> naviguer · <kbd>↵</kbd> utiliser · <kbd>esc</kbd> fermer
        </div>
      </div>

      {/* ── Écriture d'un modèle : là, une vraie fenêtre ───────────────────── */}
      {draft &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="tim-tplm"
            role="dialog"
            aria-modal="true"
            aria-label="Écrire un modèle"
            onClick={(e) => {
              if (e.target === e.currentTarget && !busy) setDraft(null);
            }}
          >
            <div className="tim-tplm__panel">
              <header className="tim-tplm__head">
                <h2 className="tim-tplm__title">
                  {draft.id != null ? "Modifier le modèle" : "Nouveau modèle"}
                  {draft.scope === "tim" && <span className="tim-tpl__badge">TIM</span>}
                </h2>
                <button
                  type="button"
                  className="tim-tplm__close"
                  onClick={() => setDraft(null)}
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </header>

              {error && (
                <p className="tim-tplm__error" role="alert">
                  {error}
                </p>
              )}

              <div className="tim-tplm__form">
                <label className="tim-tplm__field">
                  <span className="tim-tplm__label">Nom</span>
                  <input
                    className="tim-tplm__input"
                    value={draft.name}
                    autoFocus
                    placeholder="Relance sans retour"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="tim-tplm__field">
                  <span className="tim-tplm__label">Objet</span>
                  <input
                    className="tim-tplm__input"
                    value={draft.subject}
                    placeholder="Votre projet avec TIM"
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  />
                </label>
                <div className="tim-tplm__field">
                  <span className="tim-tplm__label">Message</span>
                  <RichNoteEditor
                    key={String(draft.id ?? "new")}
                    value={draft.body}
                    onChange={(body) => setDraft({ ...draft, body })}
                    placeholder="Rédiger le modèle…"
                    rows={9}
                  />
                  <span className="tim-tplm__vars">
                    Variables : <code>{"{{entreprise}}"}</code> <code>{"{{contact}}"}</code>{" "}
                    <code>{"{{prenom}}"}</code> <code>{"{{email}}"}</code>{" "}
                    <code>{"{{partenaire}}"}</code> — remplacées à l&apos;insertion. Votre signature
                    est ajoutée automatiquement : inutile de la recopier ici.
                  </span>
                </div>
                <div className="tim-tplm__form-actions">
                  <button type="button" className="tim-tplm__btn" onClick={() => setDraft(null)}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="tim-tplm__btn tim-tplm__btn--primary"
                    disabled={
                      busy || !draft.name.trim() || !draft.subject.trim() || !draft.body.trim()
                    }
                    onClick={() => void save()}
                  >
                    {busy ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
