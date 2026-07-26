"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Bandeau de notifications en tête du dashboard (admin.components.beforeDashboard).
 * Résume ce qui demande une action côté support :
 *   - tickets « à traiter » (needsAttention = true, non résolus) ;
 *   - dont les nouveaux (status = new) et les urgents.
 * Chaque puce est un lien vers la liste des tickets pré-filtrée. Compteurs lus
 * via l'API REST Payload (même approche que TicketListFilters).
 */
const TICKETS = "/admin/collections/tickets";

// Filtres réutilisés pour le compte ET le lien (cohérence garantie).
const AWAITING = "where[needsAttention][equals]=true&where[status][not_equals]=resolved";
const NEW = "where[status][equals]=new";
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

type Counts = { awaiting: number; nouveaux: number; urgents: number };

export function TicketNotifications() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [awaiting, nouveaux, urgents] = await Promise.all([
        countTickets(AWAITING),
        countTickets(NEW),
        countTickets(URGENT),
      ]);
      if (active) setCounts({ awaiting, nouveaux, urgents });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!counts) return null; // évite le clignotement avant le chargement des compteurs

  // Rien à traiter → message rassurant.
  if (counts.awaiting === 0) {
    return (
      <div className="ticket-notif ticket-notif--clear">
        <span className="ticket-notif__icon" aria-hidden>
          ✅
        </span>
        <p className="ticket-notif__title">Aucun ticket en attente — tout est traité 🎉</p>
      </div>
    );
  }

  const plural = counts.awaiting > 1 ? "s" : "";
  return (
    <div className="ticket-notif">
      <span className="ticket-notif__icon" aria-hidden>
        🎫
      </span>
      <div className="ticket-notif__body">
        <p className="ticket-notif__title">
          {counts.awaiting} ticket{plural} en attente de réponse
        </p>
        <div className="ticket-notif__chips">
          {counts.nouveaux > 0 && (
            <Link className="ticket-notif__chip" href={`${TICKETS}?${NEW}`}>
              {counts.nouveaux} nouveau{counts.nouveaux > 1 ? "x" : ""}
            </Link>
          )}
          {counts.urgents > 0 && (
            <Link className="ticket-notif__chip ticket-notif__chip--urgent" href={`${TICKETS}?${URGENT}`}>
              {counts.urgents} urgent{counts.urgents > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      </div>
      <Link className="ticket-notif__cta" href={`${TICKETS}?${AWAITING}`}>
        Traiter →
      </Link>
    </div>
  );
}
