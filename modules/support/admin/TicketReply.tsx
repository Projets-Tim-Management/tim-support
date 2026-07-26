"use client";

import { useDocumentInfo, useField, useForm } from "@payloadcms/ui";
import { useRef, useState, type ChangeEvent } from "react";

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

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

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
