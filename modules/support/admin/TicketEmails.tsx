"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

// La forme de la réponse vient de la lib serveur (`import type` : effacé à la
// compilation, aucun code serveur dans le bundle client).
import type { TicketEmailActivity as Activity } from "../lib/brevo";
import { eventMeta, type BrevoEvent } from "./email-events";

/**
 * Onglet « E-mails » d'un ticket : ce que Brevo sait des messages partis pour ce
 * ticket — envoyé, remis, ouvert, cliqué, rejeté — dans l'ordre chronologique.
 *
 * Les événements sont lus côté serveur (`/api/tickets/emails`), jamais depuis le
 * navigateur : la clé API Brevo ne doit pas transiter par le client.
 */


const fmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function EventRow({ e }: { e: BrevoEvent }) {
  const m = eventMeta(e.event);
  return (
    <li className="tmail__row">
      <span className="tmail__badge" style={{ color: m.color, background: m.bg }}>
        {m.label}
      </span>
      <span className="tmail__body">
        <span className="tmail__subject">{e.subject || "(sans objet)"}</span>
        <span className="tmail__meta">
          {fmt(e.date)} · {e.email}
          {e.reason ? ` · ${e.reason}` : ""}
        </span>
        {e.link && (
          <a className="tmail__link" href={e.link} target="_blank" rel="noreferrer">
            {e.link}
          </a>
        )}
      </span>
    </li>
  );
}

export function TicketEmails() {
  const { id } = useDocumentInfo();
  const [data, setData] = useState<Activity | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/tickets/emails?id=${id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => !cancelled && setData(json as Activity))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;
  if (failed) return <p className="tmail__empty">Suivi des e-mails indisponible pour le moment.</p>;
  if (!data) return <p className="tmail__empty">Chargement de l&apos;activité e-mail…</p>;

  if (!data.configured) {
    return (
      <p className="tmail__empty">
        Suivi inactif : la clé API Brevo (<code>BREVO_API_KEY</code>) n&apos;est pas configurée sur cet
        environnement.
      </p>
    );
  }
  if (data.error) {
    return (
      <p className="tmail__empty">
        Brevo n&apos;a pas répondu ({data.error}). Si l&apos;erreur persiste, vérifiez que la clé API
        est toujours active — une clé sans expiration est révoquée après 90 jours d&apos;inactivité.
      </p>
    );
  }

  return (
    <div className="tmail">
      {data.events.length === 0 ? (
        <p className="tmail__empty">
          Aucun e-mail suivi pour ce ticket. Seuls les envois postérieurs à la mise en place du suivi
          sont rattachés — et Brevo ne conserve que 90 jours d&apos;historique.
        </p>
      ) : (
        <ul className="tmail__list">
          {data.events.map((e, i) => (
            <EventRow key={`${e.messageId}-${e.event}-${i}`} e={e} />
          ))}
        </ul>
      )}

      {data.otherToAddress.length > 0 && (
        <details className="tmail__more">
          <summary>
            Autres e-mails envoyés à cette adresse ({data.otherToAddress.length}) — hors ticket
          </summary>
          <ul className="tmail__list">
            {data.otherToAddress.map((e, i) => (
              <EventRow key={`other-${e.messageId}-${e.event}-${i}`} e={e} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
