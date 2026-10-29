"use client";

import { toast } from "@payloadcms/ui";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEscape } from "@/core/admin/useEscape";
import { frDate } from "@/core/lib/dates";

/**
 * « Relancer le client » : l'e-mail tel qu'il partira, puis l'envoi.
 *
 * Un seul panneau pour toutes les relances (signature d'un devis ou d'un
 * contrat, dossier de démarrage) : seule change la route appelée, qui répond
 * `{ to, subject, html }` avec `preview: true` et envoie sans.
 *
 * L'aperçu EST la confirmation — pas de boîte « Êtes-vous sûr ? » par-dessus :
 * on voit le destinataire, l'objet et le message, et le bouton envoie. Le mot
 * personnel, facultatif, se glisse dans le message et l'aperçu suit la saisie.
 */

type Preview = { to: string; subject: string; html: string };

async function post<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok) throw new Error(data?.message || "La relance n'est pas disponible.");
  return data as T;
}

export function ReminderDrawer({
  title,
  endpoint,
  body,
  onClose,
  onSent,
}: {
  title: string;
  endpoint: string;
  /** Ce qui désigne la relance (client, document…) ; le mot personnel s'y ajoute. */
  body: Record<string, unknown>;
  onClose: () => void;
  onSent: () => void;
}) {
  // Stable d'un rendu à l'autre tant que son contenu ne change pas : l'aperçu
  // ne se redemande pas à chaque rendu du parent.
  const bodyKey = JSON.stringify(body);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Seul le dernier aperçu demandé s'affiche : une réponse lente ne remplace
  // pas celle d'une saisie plus récente.
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    const t = window.setTimeout(
      () => {
        post<Preview>(endpoint, { ...body, note, preview: true })
          .then((p) => {
            if (n !== seq.current) return;
            setPreview(p);
            setError(null);
          })
          .catch((e) => n === seq.current && setError((e as Error).message));
      },
      preview ? 400 : 0,
    );
    return () => window.clearTimeout(t);
    // L'aperçu suit le mot personnel ; `preview` ne sert qu'au délai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, bodyKey, note]);

  useEscape(() => !sending && onClose());

  const send = async () => {
    setSending(true);
    try {
      const res = await post<{ email: string; logged?: boolean }>(endpoint, { ...body, note });
      toast.success(`Relance envoyée à ${res.email}.`);
      if (res.logged === false) toast.warning("Envoyée, mais pas inscrite dans l'historique.");
      onSent();
    } catch (e) {
      toast.error((e as Error).message);
      setSending(false);
    }
  };

  return createPortal(
    <div className="ctr-drawer" onClick={() => !sending && onClose()}>
      <div
        className="ctr-drawer__panel sig-remind"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ctr-drawer__head">
          <h2>{title}</h2>
          <div className="ctr-drawer__actions">
            <button type="button" className="ctr-btn ctr-btn--ghost" onClick={onClose} disabled={sending}>
              Fermer
            </button>
          </div>
        </header>

        <div className="sig-remind__meta">
          <p>
            <span>À</span>
            <strong>{preview?.to ?? "…"}</strong>
          </p>
          <p>
            <span>Objet</span>
            <strong>{preview?.subject ?? "…"}</strong>
          </p>
          <label className="ctr-field">
            <span className="ctr-field__label">Un mot personnel (facultatif)</span>
            <textarea
              className="ctr-input sig-remind__note"
              value={note}
              maxLength={2000}
              rows={3}
              placeholder="Ex. : Comme convenu au téléphone, je reste disponible pour en parler."
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="ctr-field__hint">
              Ajouté dans un encadré du message. Si le client répond, sa réponse vous arrive directement.
            </span>
          </label>
        </div>

        {error ? (
          <p className="ctr-note sig-remind__error">{error}</p>
        ) : preview ? (
          <iframe className="ctr-drawer__frame" srcDoc={preview.html} title="Aperçu de la relance" sandbox="" />
        ) : (
          <div className="ctr-editor__placeholder">Préparation de l&apos;aperçu…</div>
        )}

        <footer className="sig-remind__foot">
          <span className="ctr-muted">Aperçu fidèle : c&apos;est exactement ce que le client recevra.</span>
          <button
            type="button"
            className="ctr-btn ctr-btn--primary"
            onClick={send}
            disabled={!preview || Boolean(error) || sending}
          >
            {sending ? "Envoi…" : "Envoyer la relance"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** Les relances déjà faites, la plus récente d'abord (renvoyées par les routes de relance). */
export type ReminderHistory = { at: string; by: string | null }[];

/** « Relancé le 26/10/2026 par Charlie · 3 relances », ou null s'il n'y en a pas eu. */
export function reminderLine(reminders: ReminderHistory | undefined): string | null {
  const last = reminders?.[0];
  if (!last) return null;
  const n = reminders.length;
  return `Relancé le ${frDate(last.at)}${last.by ? ` par ${last.by}` : ""}${n > 1 ? ` · ${n} relances` : ""}`;
}
