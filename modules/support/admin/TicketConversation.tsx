"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  eventMeta,
  groupByMessage,
  stateForMessage,
  type BrevoEvent,
  type MailState,
} from "./email-events";
import { ticketMeta, type Media } from "./ticket-meta";

/**
 * Vue « conversation » d'un ticket dans l'admin : en-tête (n° + sujet +
 * pastilles statut/priorité) puis fil d'échanges en bulles (client à gauche,
 * support à droite), avec pièces jointes en vignettes. Lecture seule — la
 * réponse se fait via TicketReply. Se rafraîchit sur l'événement
 * `ticket:updated` (émis après une réponse). Libellés/couleurs via ticket-meta.
 */

type Message = {
  author?: string;
  body?: string;
  sentAt?: string;
  /** Destinataires en copie de cet envoi (liste séparée par des virgules). */
  cc?: string;
  attachments?: Media[];
};
type Ticket = {
  number?: number;
  subject?: string;
  description?: string;
  name?: string;
  email?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
  attachments?: Media[];
  messages?: Message[];
};

function formatDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Files({ items }: { items?: Media[] }) {
  const files = (items ?? []).filter((m) => m && m.url);
  if (files.length === 0) return null;
  return (
    <div className="ticket-msg__files">
      {files.map((m) => (
        <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="ticket-msg__file">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.url} alt={m.alt || m.filename || "pièce jointe"} />
        </a>
      ))}
    </div>
  );
}

function Bubble({
  side,
  author,
  when,
  body,
  attachments,
  previewUrl,
  onPreview,
  mailState,
  cc,
}: {
  side: "client" | "support";
  author: string;
  when?: string;
  body?: string;
  attachments?: Media[];
  /** Destinataires en copie, affichés sous la bulle. */
  cc?: string;
  /** Présent seulement sur les messages ENVOYÉS : eux seuls ont un rendu. */
  previewUrl?: string;
  onPreview?: (url: string) => void;
  /** Dernier état connu de l'e-mail correspondant (Brevo). */
  mailState?: MailState | null;
}) {
  const state = mailState ? eventMeta(mailState.event) : null;
  return (
    <div className={`ticket-msg ticket-msg--${side}`}>
      <div className="ticket-msg__meta">
        <span className="ticket-msg__author">{author}</span>
        {when ? <span className="ticket-msg__date">{when}</span> : null}
        {state ? (
          <span
            className="ticket-msg__state"
            style={{ color: state.color, background: state.bg }}
            title="Dernier état connu de l'e-mail (Brevo)"
          >
            {state.label}
          </span>
        ) : null}
        {previewUrl && onPreview ? (
          <button type="button" className="ticket-msg__preview" onClick={() => onPreview(previewUrl)}>
            Voir le rendu
          </button>
        ) : null}
      </div>
      <div className="ticket-msg__bubble">
        {body ? <p className="ticket-msg__body">{body}</p> : null}
        <Files items={attachments} />
        {cc ? <p className="ticket-msg__cc">En copie : {cc}</p> : null}
      </div>
    </div>
  );
}

/**
 * Aperçu de l'e-mail tel que le client le reçoit. Rendu dans une `iframe`
 * ISOLÉE (sandbox) : un HTML d'e-mail embarque ses propres styles et tables, qui
 * saccageraient la mise en page de l'admin s'ils étaient injectés directement.
 */
function PreviewOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="ticket-preview"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de l'e-mail"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="ticket-preview__panel">
        <header className="ticket-preview__head">
          <span className="ticket-preview__title">Rendu de l&apos;e-mail</span>
          <a className="ticket-preview__open" href={url} target="_blank" rel="noreferrer">
            Ouvrir dans un onglet ↗
          </a>
          <button type="button" className="ticket-preview__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <iframe className="ticket-preview__frame" src={url} title="Rendu de l'e-mail" sandbox="" />
      </div>
    </div>,
    document.body,
  );
}

export function TicketConversation() {
  const { id } = useDocumentInfo();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  /** URL de l'aperçu ouvert (null = aucun). */
  const [preview, setPreview] = useState<string | null>(null);
  /** États des e-mails partis pour ce ticket, un par envoi (Brevo). */
  const [mailStates, setMailStates] = useState<MailState[]>([]);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/payload-api/tickets/${id}?depth=2`, {
        credentials: "include",
      });
      if (res.ok) setTicket((await res.json()) as Ticket);
    } catch (e) {
      console.warn("[TicketConversation] chargement du ticket échoué:", e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  /**
   * État des e-mails partis pour ce ticket. Rechargé en même temps que le fil
   * (donc après une réponse) — mais Brevo met quelques secondes à enregistrer un
   * envoi : un message tout juste envoyé peut rester sans pastille un instant.
   */
  // L'adresse du ticket sert à filtrer les envois : la notification interne au
  // support porte le même tag et ne dit rien de ce que le client a reçu.
  const recipient = ticket?.email;

  const loadMailStates = useCallback(
    async (to?: string) => {
      if (!id) return;
      try {
        const res = await fetch(`/api/tickets/emails?id=${id}`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { events?: BrevoEvent[] };
        setMailStates(groupByMessage(data.events ?? [], to));
      } catch {
        /* suivi indisponible → le fil s'affiche simplement sans pastille */
      }
    },
    [id],
  );

  useEffect(() => {
    load();
    const onUpdate = () => {
      load();
      if (recipient) loadMailStates(recipient);
    };
    window.addEventListener("ticket:updated", onUpdate);
    return () => window.removeEventListener("ticket:updated", onUpdate);
  }, [load, loadMailStates, recipient]);

  // Le suivi ne peut être filtré qu'une fois l'adresse du ticket connue.
  useEffect(() => {
    if (recipient) loadMailStates(recipient);
  }, [recipient, loadMailStates]);

  if (!id) return null;
  if (loading && !ticket) {
    return <div className="ticket-conversation ticket-conversation--loading">Chargement…</div>;
  }
  if (!ticket) return null;

  const clientName = ticket.name || ticket.email || "Client";
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];

  return (
    <div className="ticket-conversation">
      <header className="ticket-conversation__head">
        <div>
          <h2 className="ticket-conversation__title">
            {ticket.number ? <span className="ticket-conversation__num">#{ticket.number}</span> : null}
            {ticket.subject}
          </h2>
          <p className="ticket-conversation__from">
            {clientName}
            {ticket.email ? ` · ${ticket.email}` : ""}
          </p>
        </div>
        <div className="ticket-conversation__pills">
          {ticket.status ? (
            <span className={`ticket-pill ticket-pill--status-${ticket.status}`}>
              {ticketMeta("status", ticket.status).label}
            </span>
          ) : null}
          {ticket.priority ? (
            <span className={`ticket-pill ticket-pill--prio-${ticket.priority}`}>
              {ticketMeta("priority", ticket.priority).label}
            </span>
          ) : null}
        </div>
      </header>

      <div className="ticket-conversation__thread">
        {/* Demande initiale du client — le rendu proposé est l'accusé de
            réception qui lui a été envoyé, pas son propre e-mail. */}
        <Bubble
          side="client"
          author={clientName}
          when={formatDate(ticket.createdAt)}
          body={ticket.description}
          attachments={ticket.attachments}
          previewUrl={`/api/tickets/preview?id=${id}&kind=confirmation`}
          onPreview={setPreview}
          mailState={stateForMessage(mailStates, ticket.createdAt)}
        />

        {/* Suite des échanges */}
        {messages.map((m, i) => (
          <Bubble
            key={i}
            side={m.author === "support" ? "support" : "client"}
            author={m.author === "support" ? "Support TIM" : clientName}
            when={formatDate(m.sentAt)}
            body={m.body}
            attachments={m.attachments}
            previewUrl={m.author === "support" ? `/api/tickets/preview?id=${id}&i=${i}` : undefined}
            onPreview={setPreview}
            // Un message reçu du client n'a pas d'état d'envoi côté Brevo.
            mailState={m.author === "support" ? stateForMessage(mailStates, m.sentAt) : null}
            cc={m.cc}
          />
        ))}
      </div>

      {preview && <PreviewOverlay url={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
