"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { NEWS, REPLIES, URGENT, countTickets } from "@/modules/support/lib/counts";

/**
 * Bandeau de notifications en tête du dashboard (admin.components.beforeDashboard).
 * Résume ce qui demande une action côté support, en deux compteurs distincts :
 *   - 💬 réponses client en attente (unreadClientReply = true) ;
 *   - 🎫 nouveaux tickets à traiter (needsAttention sans réponse client, non résolus).
 * Chaque puce est un lien vers la liste des tickets pré-filtrée ; le bandeau
 * pointe aussi vers la page Notifications complète. Sans rien en attente, il ne
 * s'affiche pas du tout. Compteurs lus via l'API REST
 * Payload (même approche que TicketListFilters).
 */
const TICKETS = "/admin/collections/tickets";
const NOTIFICATIONS = "/admin/notifications";

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

  /**
   * Rien à traiter → rien à afficher.
   *
   * Ce bandeau existe pour signaler ce qui attend une action. Un bandeau qui
   * dit « il n'y a rien » occupe le haut du tableau de bord tous les jours où
   * tout va bien : à force, on cesse de le lire, et le jour où il annonce trois
   * tickets urgents il ressemble à celui de la veille.
   */
  if (total === 0) return null;

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
