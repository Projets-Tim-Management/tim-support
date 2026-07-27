"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Bandeau de notifications en tête du dashboard (admin.components.beforeDashboard).
 * Résume ce qui demande une action côté support, en deux compteurs distincts :
 *   - 💬 réponses client en attente (unreadClientReply = true) ;
 *   - 🎫 nouveaux tickets à traiter (needsAttention sans réponse client, non résolus).
 * Chaque puce est un lien vers la liste des tickets pré-filtrée ; le bandeau
 * pointe aussi vers la page Notifications complète. Compteurs lus via l'API REST
 * Payload (même approche que TicketListFilters).
 */
const TICKETS = "/admin/collections/tickets";
const NOTIFICATIONS = "/admin/notifications";

// Filtres réutilisés pour le compte ET le lien (cohérence garantie).
const REPLIES = "where[unreadClientReply][equals]=true";
const NEWS =
  "where[and][0][needsAttention][equals]=true&where[and][1][unreadClientReply][not_equals]=true&where[and][2][status][not_equals]=resolved";
const URGENT = "where[priority][equals]=urgent&where[status][not_equals]=resolved";

async function countTickets(query: string): Promise<number> {
  try {
    const res = await fetch(`/payload-api/tickets?${query}&limit=1&depth=0`, {
      credentials: "include",
    });
    const data = res.ok ? await res.json() : { totalDocs: 0 };
    return Number(data.totalDocs) || 0;
  } catch {
    return 0;
  }
}

type Counts = { replies: number; news: number; urgents: number };

export function TicketNotifications() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [replies, news, urgents] = await Promise.all([
        countTickets(REPLIES),
        countTickets(NEWS),
        countTickets(URGENT),
      ]);
      if (active) setCounts({ replies, news, urgents });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!counts) return null; // évite le clignotement avant le chargement des compteurs

  const total = counts.replies + counts.news;

  // Rien à traiter → message rassurant.
  if (total === 0) {
    return (
      <div className="ticket-notif ticket-notif--clear">
        <span className="ticket-notif__icon" aria-hidden>
          ✅
        </span>
        <p className="ticket-notif__title">Aucun ticket en attente — tout est traité 🎉</p>
      </div>
    );
  }

  return (
    <div className="ticket-notif">
      <span className="ticket-notif__icon" aria-hidden>
        🔔
      </span>
      <div className="ticket-notif__body">
        <p className="ticket-notif__title">
          {total} ticket{total > 1 ? "s" : ""} en attente d’action
        </p>
        <div className="ticket-notif__chips">
          {counts.replies > 0 && (
            <Link className="ticket-notif__chip ticket-notif__chip--reply" href={`${TICKETS}?${REPLIES}`}>
              💬 {counts.replies} réponse{counts.replies > 1 ? "s" : ""} client
            </Link>
          )}
          {counts.news > 0 && (
            <Link className="ticket-notif__chip ticket-notif__chip--new" href={`${TICKETS}?${NEWS}`}>
              🎫 {counts.news} nouveau{counts.news > 1 ? "x" : ""}
            </Link>
          )}
          {counts.urgents > 0 && (
            <Link className="ticket-notif__chip ticket-notif__chip--urgent" href={`${TICKETS}?${URGENT}`}>
              ⚠️ {counts.urgents} urgent{counts.urgents > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      </div>
      <Link className="ticket-notif__cta" href={NOTIFICATIONS}>
        Voir tout →
      </Link>
    </div>
  );
}
