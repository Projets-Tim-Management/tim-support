"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { ticketMeta, type Media } from "./ticket-meta";

/**
 * Vue « conversation » d'un ticket dans l'admin : en-tête (n° + sujet +
 * pastilles statut/priorité) puis fil d'échanges en bulles (client à gauche,
 * support à droite), avec pièces jointes en vignettes. Lecture seule — la
 * réponse se fait via TicketReply. Se rafraîchit sur l'événement
 * `ticket:updated` (émis après une réponse). Libellés/couleurs via ticket-meta.
 */

type Message = { author?: string; body?: string; sentAt?: string; attachments?: Media[] };
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
}: {
  side: "client" | "support";
  author: string;
  when?: string;
  body?: string;
  attachments?: Media[];
}) {
  return (
    <div className={`ticket-msg ticket-msg--${side}`}>
      <div className="ticket-msg__meta">
        <span className="ticket-msg__author">{author}</span>
        {when ? <span className="ticket-msg__date">{when}</span> : null}
      </div>
      <div className="ticket-msg__bubble">
        {body ? <p className="ticket-msg__body">{body}</p> : null}
        <Files items={attachments} />
      </div>
    </div>
  );
}

export function TicketConversation() {
  const { id } = useDocumentInfo();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    load();
    const onUpdate = () => load();
    window.addEventListener("ticket:updated", onUpdate);
    return () => window.removeEventListener("ticket:updated", onUpdate);
  }, [load]);

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
        {/* Demande initiale du client */}
        <Bubble
          side="client"
          author={clientName}
          when={formatDate(ticket.createdAt)}
          body={ticket.description}
          attachments={ticket.attachments}
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
          />
        ))}
      </div>
    </div>
  );
}
