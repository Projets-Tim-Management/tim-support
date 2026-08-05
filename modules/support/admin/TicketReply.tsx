"use client";

import { useDocumentInfo, useField, useForm } from "@payloadcms/ui";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

// Type importé (et non redéclaré) pour rester aligné sur la réponse de l'API :
// un `import type` est effacé à la compilation, rien du module serveur n'atterrit
// dans le bundle client.
import type { BrevoSender as Sender } from "../lib/brevo";
import { ticketMeta } from "./ticket-meta";

/**
 * Zone de réponse au client depuis la vue ticket. En plus d'envoyer un message
 * (+ images) par e-mail et de l'ajouter au fil, elle pilote le STATUT :
 *  - commencer à écrire fait passer un ticket « Nouveau » à « Pris en compte » ;
 *  - un bouton « statut suivant » avance rapidement dans le workflow ;
 *  - sélectionner un statut pré-remplit un message type (réponse rapide).
 * Le statut est partagé avec le badge de la barre latérale (même form state).
 */

const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILES = 5;
const MAX_SIZE = 5 * 1024 * 1024;

// Enchaînement « logique » proposé par le bouton statut suivant.
const NEXT: Record<string, string | null> = {
  new: "acknowledged",
  acknowledged: "in_progress",
  in_progress: "resolved",
  resolved: null,
};

// Messages types pré-remplis selon le statut sélectionné.
function template(status: string, name?: string): string {
  const hello = name ? `Bonjour ${name},\n\n` : "Bonjour,\n\n";
  switch (status) {
    case "acknowledged":
      return `${hello}Nous avons bien pris en compte votre demande et nous l'examinons. Nous revenons vers vous très rapidement.`;
    case "in_progress":
      return `${hello}Votre demande est en cours de traitement par notre équipe. `;
    case "resolved":
      return `${hello}Votre demande est à présent résolue. N'hésitez pas à revenir vers nous si besoin. Belle journée !`;
    default:
      return "";
  }
}

export function TicketReply() {
  const { id } = useDocumentInfo();
  const { setModified } = useForm();
  const inputRef = useRef<HTMLInputElement>(null);

  const { value: status, setValue: setStatus } = useField<string>({ path: "status" });
  const { value: clientName } = useField<string>({ path: "name" });
  const { value: clientEmail } = useField<string>({ path: "email" });

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  // Expéditeurs vérifiés du compte Brevo : le support est le défaut, mais on
  // peut répondre depuis une autre adresse vérifiée (direction, commercial…).
  const [senders, setSenders] = useState<Sender[]>([]);
  const [from, setFrom] = useState("");
  const [cc, setCc] = useState("");
  const [ccOpen, setCcOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tickets/senders", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { senders?: Sender[]; default?: string } | null) => {
        if (cancelled || !d) return;
        setSenders(d.senders ?? []);
        setFrom((prev) => prev || d.default || "");
      })
      // Liste indisponible → l'envoi partira de l'adresse par défaut du serveur.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!id) return null;

  const current = status ?? "new";
  const next = NEXT[current];

  function onBodyChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setBody(v);
    // Règle : commencer à répondre → « Nouveau » devient « Pris en compte ».
    if (current === "new" && v.trim().length > 0) setStatus("acknowledged");
  }

  function goToStatus(target: string) {
    setStatus(target);
    // Pré-remplit un message type si la zone est vide (ne remplace jamais un
    // texte déjà saisi).
    if (body.trim().length === 0) {
      const tpl = template(target, clientName);
      if (tpl) setBody(tpl);
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter(
      (f) => ACCEPTED.includes(f.type) && f.size <= MAX_SIZE,
    );
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function send() {
    const text = body.trim();
    if (!text || state === "sending") return;
    setState("sending");
    setMessage("");
    try {
      const fd = new FormData();
      fd.set("ticketId", String(id));
      fd.set("body", text);
      fd.set("status", current); // persiste le statut choisi côté serveur
      if (from) fd.set("from", from);
      if (cc.trim()) fd.set("cc", cc.trim());
      files.forEach((f, i) => fd.append(`attachment_${i}`, f, f.name));

      const res = await fetch("/api/tickets/reply", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; emailSent?: boolean };
      if (res.ok && data.ok) {
        setBody("");
        setFiles([]);
        setCc("");
        setCcOpen(false);
        setState("sent");
        setMessage(
          data.emailSent
            ? "Réponse envoyée au client ✓"
            : "Message enregistré, mais l'e-mail n'est pas parti (voir logs).",
        );
        // La réponse (message + statut) est déjà enregistrée côté serveur →
        // on remet le formulaire « propre » pour ne pas réclamer de sauvegarde.
        setModified(false);
        window.dispatchEvent(new CustomEvent("ticket:updated"));
        setTimeout(() => setState("idle"), 4000);
      } else {
        setState("error");
        setMessage("Échec de l'envoi. Réessayez.");
      }
    } catch {
      setState("error");
      setMessage("Impossible de joindre le serveur.");
    }
  }

  return (
    <div className="ticket-reply">
      <div className="ticket-reply__head">
        <label className="ticket-reply__label">✍️ Répondre au client</label>
        {next ? (
          <button
            type="button"
            className={`ticket-reply__status ticket-reply__status--${next}`}
            onClick={() => goToStatus(next)}
            title={`Marquer le ticket « ${ticketMeta("status", next).label} » et pré-remplir un message`}
          >
            Passer à « {ticketMeta("status", next).label} » ▸
          </button>
        ) : null}
      </div>

      {/* En-tête d'envoi : qui écrit, à qui, et qui reçoit une copie — visible
          AVANT d'envoyer, pour qu'aucune réponse ne parte de la mauvaise adresse. */}
      <div className="ticket-reply__env">
        <div className="ticket-reply__env-row">
          <span className="ticket-reply__env-key">De</span>
          {senders.length > 0 ? (
            <select
              className="ticket-reply__env-select"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Adresse d'expédition"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.email}>
                  {s.name} — {s.email}
                </option>
              ))}
            </select>
          ) : (
            <span className="ticket-reply__env-val">{from || "adresse par défaut du support"}</span>
          )}
        </div>

        <div className="ticket-reply__env-row">
          <span className="ticket-reply__env-key">À</span>
          <span className="ticket-reply__env-val">{clientEmail || "—"}</span>
          {!ccOpen && (
            <button
              type="button"
              className="ticket-reply__env-add"
              onClick={() => setCcOpen(true)}
            >
              + Copie
            </button>
          )}
        </div>

        {ccOpen && (
          <div className="ticket-reply__env-row">
            <span className="ticket-reply__env-key">Cc</span>
            <input
              type="text"
              className="ticket-reply__env-input"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="adresse@exemple.com, autre@exemple.com"
              aria-label="Adresses en copie"
            />
          </div>
        )}
      </div>

      <textarea
        className="ticket-reply__input"
        value={body}
        onChange={onBodyChange}
        placeholder="Votre réponse… (envoyée par e-mail au client, avec suivi dans le fil)"
        rows={4}
      />

      {files.length > 0 ? (
        <ul className="ticket-reply__files">
          {files.map((f, i) => (
            <li key={i} className="ticket-reply__file">
              <span className="ticket-reply__file-name">📎 {f.name}</span>
              <button
                type="button"
                className="ticket-reply__file-remove"
                onClick={() => removeFile(i)}
                aria-label="Retirer"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        onChange={onPick}
        style={{ display: "none" }}
      />

      {message ? (
        <p className={`ticket-reply__msg ticket-reply__msg--${state}`}>{message}</p>
      ) : null}

      <div className="ticket-reply__actions">
        <button
          type="button"
          className="ticket-reply__attach"
          onClick={() => inputRef.current?.click()}
          disabled={files.length >= MAX_FILES}
        >
          📎 Joindre une image
        </button>
        <button
          type="button"
          className="ticket-reply__btn"
          onClick={send}
          disabled={state === "sending" || body.trim().length === 0}
        >
          {state === "sending" ? "Envoi…" : "Envoyer au client"}
        </button>
      </div>
    </div>
  );
}
