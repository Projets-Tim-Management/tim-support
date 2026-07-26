"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { type Media } from "./ticket-meta";

/**
 * Affiche les pièces jointes du client (champ `attachments`) en galerie de
 * vignettes cliquables, en lecture seule — sans le widget d'upload Payload
 * (« créer / choisir / glisser-déposer »). Défile si nombreuses.
 */
export function TicketAttachments() {
  const { id } = useDocumentInfo();
  const [files, setFiles] = useState<Media[]>([]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch(`/payload-api/tickets/${id}?depth=1`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (active && t && Array.isArray(t.attachments)) {
          setFiles((t.attachments as Media[]).filter((m) => m && m.url));
        }
      })
      .catch((e) => console.warn("[TicketAttachments] chargement échoué:", e));
    return () => {
      active = false;
    };
  }, [id]);

  if (!id) return null;

  return (
    <div className="field-type ticket-attach-field">
      <label className="ticket-cfield__label">Pièces jointes du client</label>
      {files.length === 0 ? (
        <p className="ticket-attach__empty">Aucune pièce jointe</p>
      ) : (
        <div className="ticket-attach__grid">
          {files.map((m) => (
            <a
              key={m.id}
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="ticket-attach__item"
              title={m.filename || m.alt || "pièce jointe"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt || m.filename || "pièce jointe"} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
