"use client";

import { toast, useConfig } from "@payloadcms/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * La fenêtre « Prévenir les demandeurs » — partagée par la FICHE (changement
 * de statut dans le sélecteur) et le KANBAN (carte déposée dans « Terminé »).
 * Un seul endroit décide de ce qu'on y voit et de ce qu'envoie le bouton :
 * deux copies auraient divergé au premier ajustement de texte.
 *
 * Deux volets :
 *  - à gauche, LE MESSAGE tel qu'il partira au premier destinataire (prénom,
 *    téléphone et lien compris), rendu dans une iframe isolée, et qui se met à
 *    jour quand on corrige l'intitulé ;
 *  - à droite, ce qu'on règle : l'INTITULÉ du développement dans l'e-mail (le
 *    titre interne — « Fix export CSV » — n'est pas celui qu'on montre à un
 *    client), les FICHES DE LA DOC jointes (la « Fiche de documentation » du
 *    développement d'office ; on en retire, on en cherche d'autres parmi les
 *    publiées), les ADRESSES, une par opportunité « Demandé par », qu'on retire
 *    ou complète, et le bouton. Chaque adresse reçoit SON message : jamais de
 *    copie.
 *
 * Pilotée par `dev` : non nul, elle s'ouvre et charge ; refermée (bouton,
 * fond, Échap), elle prévient par `onClose`. Rendue par PORTAIL sur <body>,
 * au-dessus de tout — c'est une décision, pas un panneau latéral.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Recipient = { email: string; companyName?: string };
type Preview = { subject: string; html: string };
type Doc = { id: number | string; title: string };

/** Ce que montre un aperçu : l'intitulé et les fiches jointes. */
const keyOf = (t: string, d: Doc[]) => `${t}\u0000${d.map((x) => x.id).join(",")}`;

/** Comparaison sans accents ni casse, pour la recherche de fiches. */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type AnnounceTarget = { id: number | string; title: string };

export function AnnounceDrawer({
  dev,
  onClose,
  onSent,
  beforeSend,
}: {
  dev: AnnounceTarget | null;
  onClose: () => void;
  /** Envoi réussi : la date posée côté serveur, pour l'écran qui l'affiche. */
  onSent?: (announcedAt: string) => void;
  /** À faire AVANT d'envoyer — enregistrer la fiche, par exemple. Une erreur annule l'envoi. */
  beforeSend?: () => Promise<void>;
}) {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const [title, setTitle] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  /** Toutes les fiches publiées, pour la recherche ; chargées à l'ouverture. */
  const [published, setPublished] = useState<Doc[]>([]);
  const [docQuery, setDocQuery] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  /** Date d'un envoi précédent : la fenêtre rouverte le dit, pour ne pas écrire deux fois au même client. */
  const [already, setAlready] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  /** L'intitulé et les fiches pour lesquels l'aperçu affiché a été demandé. */
  const shownFor = useRef<string | null>(null);

  /**
   * Chaque chargement porte un numéro ; seule la réponse du DERNIER lancé
   * s'affiche. Sans ça, une première réponse lente (destinataires + aperçu)
   * pouvait écraser l'aperçu d'un intitulé déjà corrigé — et on relisait un
   * message qui n'était pas celui qui allait partir.
   */
  const seq = useRef(0);
  /** `forDocs` absent (ouverture) : le serveur prend la fiche du développement et la renvoie. */
  const load = useCallback(async (id: number | string, forTitle: string, withRecipients: boolean, forDocs?: Doc[]) => {
    const mine = ++seq.current;
    const q = new URLSearchParams({ id: String(id), title: forTitle });
    if (forDocs) q.set("features", forDocs.map((d) => d.id).join(","));
    const res = await fetch(`/api/dev/announce?${q}`, { credentials: "include" });
    const j = res.ok ? await res.json() : null;
    if (!j || mine !== seq.current) return;
    if (j.preview) setPreview(j.preview);
    if (withRecipients) {
      setRecipients(
        ((j.recipients ?? []) as { email: string; companyName: string }[])
          .filter((r) => r.email)
          .map((r) => ({ email: r.email, companyName: r.companyName })),
      );
      setAlready(j.announcedAt ?? null);
      const got = ((j.features ?? []) as Doc[]).map((d) => ({ id: d.id, title: d.title }));
      setDocs(got);
      const t = !forTitle.trim() && j.title ? j.title : forTitle;
      if (t !== forTitle) setTitle(t);
      shownFor.current = keyOf(t, got);
    }
  }, []);

  // Ouverture : on repart de zéro pour CE développement.
  useEffect(() => {
    if (!dev) {
      shownFor.current = null;
      return;
    }
    let active = true;
    setTitle(dev.title);
    setDocs([]);
    setDocQuery("");
    setAlready(null);
    setRecipients([]);
    setDraft("");
    setPreview(null);
    setLoading(true);
    shownFor.current = keyOf(dev.title, []);
    load(dev.id, dev.title, true)
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [dev, load]);

  // Les fiches publiées, pour la recherche (titre seul : c'est ce qu'on cherche).
  useEffect(() => {
    if (!dev) return;
    const q = "where[_status][equals]=published&limit=1000&depth=0&sort=title&select[title]=true";
    fetch(`${api}/features?${q}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((j: { docs?: { id: number | string; title?: string }[] }) => setPublished((j.docs ?? []).map((d) => ({ id: d.id, title: d.title ?? "" }))))
      .catch(() => setPublished([]));
  }, [api, dev]);

  // L'intitulé ou les fiches changent → l'aperçu suit, un peu après la
  // dernière frappe. Rien tant que c'est ce qui est déjà affiché : l'ouverture
  // ne recharge pas deux fois.
  useEffect(() => {
    if (!dev || loading || keyOf(title, docs) === shownFor.current) return;
    const t = setTimeout(() => {
      shownFor.current = keyOf(title, docs);
      void load(dev.id, title, false, docs).catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, [dev, docs, load, loading, title]);

  const docMatches = docQuery.trim()
    ? published.filter((d) => !docs.some((x) => String(x.id) === String(d.id)) && norm(d.title).includes(norm(docQuery.trim()))).slice(0, 6)
    : [];

  // Échap ferme.
  useEffect(() => {
    if (!dev) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dev, onClose, sending]);

  const addDraft = () => {
    const clean = draft.trim().toLowerCase();
    if (!clean) return;
    if (!EMAIL_RE.test(clean)) {
      toast.error("Adresse invalide.");
      return;
    }
    if (!recipients.some((r) => r.email.toLowerCase() === clean)) {
      setRecipients((list) => [...list, { email: clean }]);
    }
    setDraft("");
  };

  const send = async () => {
    if (!dev || sending) return;
    const clean = title.trim();
    if (!clean || recipients.length === 0) return;
    setSending(true);
    try {
      await beforeSend?.();
      const res = await fetch("/api/dev/announce", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dev.id, title: clean, emails: recipients.map((r) => r.email), featureIds: docs.map((d) => d.id) }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(j?.error === "forbidden" ? "Réservé aux administrateurs." : "Envoi impossible.");
        return;
      }
      if (j?.announcedAt) onSent?.(j.announcedAt);
      if (j?.sent === j?.total) toast.success(`${j.sent} e-mail${j.sent > 1 ? "s" : ""} envoyé${j.sent > 1 ? "s" : ""}.`);
      else toast.error(`${j?.sent ?? 0} envoyé(s) sur ${j?.total ?? 0} : voir les journaux pour les échecs.`);
      onClose();
    } catch (err) {
      toast.error(
        (err as Error)?.message === "save_failed"
          ? "La fiche n'a pas pu être enregistrée : rien n'a été envoyé."
          : "Envoi impossible : le serveur n'a pas répondu.",
      );
    } finally {
      setSending(false);
    }
  };

  if (!dev || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="dev-popup"
      role="dialog"
      aria-modal="true"
      aria-label="Prévenir les demandeurs"
      onClick={(e) => e.target === e.currentTarget && !sending && onClose()}
    >
      <div className="dev-popup__panel">
        <header className="dev-popup__head">
          <div>
            <h3 className="dev-popup__title">Prévenir les demandeurs</h3>
            <p className="dev-popup__sub">
              Chaque adresse reçoit <strong>son propre e-mail</strong> — personne n'est en copie.
              À gauche, le message tel qu'il partira au premier destinataire.
            </p>
          </div>
          <button type="button" className="dev-popup__close" onClick={onClose} disabled={sending} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="dev-popup__body">
          {/* ── Le message ─────────────────────────────────────────────── */}
          <section className="dev-popup__mail">
            <p className="dev-popup__subject">
              <span>Objet</span>
              {preview?.subject ?? (loading ? "Chargement…" : "—")}
            </p>
            {preview ? (
              // `sandbox` vide : aucun script, aucune navigation. Un aperçu ne
              // doit rien pouvoir exécuter dans le back-office.
              <iframe title="Aperçu de l'e-mail" className="dev-popup__frame" sandbox="" srcDoc={preview.html} />
            ) : (
              <div className="dev-popup__frame dev-popup__frame--empty">{loading ? "Chargement…" : "Aperçu indisponible."}</div>
            )}
          </section>

          {/* ── Les réglages ───────────────────────────────────────────── */}
          <aside className="dev-popup__side">
            {already && (
              <p className="dev-announce__already" role="status">
                <strong>Déjà envoyé le {new Date(already).toLocaleString("fr-FR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}.</strong> Retirez les clients déjà prévenus et
                ajoutez l&apos;adresse oubliée : seules les adresses de la liste recevront l&apos;e-mail.
              </p>
            )}
            <label className="dev-need__label">
              Intitulé dans l'e-mail
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ce que le client reconnaîtra — ex. Export des heures par chantier"
              />
            </label>

            {/* Les fiches du site support jointes : une carte cliquable chacune dans l'e-mail. */}
            <div className="dev-need__label">
              Fiches de la doc dans l&apos;e-mail ({docs.length})
              {docs.length === 0 ? (
                <span className="dev-cfield__hint">{loading ? "Chargement…" : "Aucune : cherchez une fiche publiée ci-dessous."}</span>
              ) : (
                <ul className="dev-announce__list">
                  {docs.map((d) => (
                    <li key={d.id} className="dev-announce__item">
                      <span className="dev-announce__who">
                        <span className="dev-announce__email">📄 {d.title}</span>
                      </span>
                      <button type="button" className="dev-announce__remove" aria-label={`Retirer la fiche ${d.title}`} onClick={() => setDocs((list) => list.filter((x) => x.id !== d.id))}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="dev-announce__docsearch">
                <input type="search" value={docQuery} placeholder="Chercher une fiche à ajouter…" onChange={(e) => setDocQuery(e.target.value)} />
                {docQuery.trim() && (
                  <ul className="dev-announce__matches" role="listbox" aria-label="Fiches trouvées">
                    {docMatches.length === 0 ? (
                      <li className="dev-announce__nomatch">Aucune fiche publiée ne correspond.</li>
                    ) : (
                      docMatches.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            className="dev-announce__match"
                            onClick={() => {
                              setDocs((list) => [...list, d]);
                              setDocQuery("");
                            }}
                          >
                            + {d.title}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>

            <div className="dev-need__label">
              Destinataires ({recipients.length})
              {loading && recipients.length === 0 ? (
                <span className="dev-cfield__hint">Chargement…</span>
              ) : recipients.length === 0 ? (
                <span className="dev-cfield__hint">Aucune adresse : ajoutez-en une ci-dessous.</span>
              ) : (
                <ul className="dev-announce__list">
                  {recipients.map((r) => (
                    <li key={r.email} className="dev-announce__item">
                      <span className="dev-announce__who">
                        <span className="dev-announce__email">{r.email}</span>
                        {r.companyName && <span className="dev-announce__company">{r.companyName}</span>}
                      </span>
                      <button
                        type="button"
                        className="dev-announce__remove"
                        aria-label={`Retirer ${r.email}`}
                        onClick={() => setRecipients((list) => list.filter((x) => x.email !== r.email))}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="dev-announce__add">
                <input
                  type="email"
                  value={draft}
                  placeholder="Ajouter une adresse…"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDraft();
                    }
                  }}
                />
                <button type="button" className="dev-need__close" onClick={addDraft} disabled={!draft.trim()}>
                  Ajouter
                </button>
              </div>
            </div>

            <div className="dev-popup__actions">
              <button
                type="button"
                className="dev-announce__send"
                disabled={sending || loading || !title.trim() || recipients.length === 0}
                onClick={() => void send()}
              >
                {sending ? "Envoi…" : `Envoyer ${recipients.length} e-mail${recipients.length > 1 ? "s" : ""}`}
              </button>
              <button type="button" className="dev-need__close" onClick={onClose} disabled={sending}>
                Plus tard
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
