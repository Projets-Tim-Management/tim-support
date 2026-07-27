"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Injecté via admin.components.afterNavLinks. Deux rôles :
 *   1. Ajoute une entrée « Notifications » dans le menu, avec deux puces
 *      distinctes (💬 réponses client / 🎫 nouveaux tickets).
 *   2. Colle les mêmes puces sur l'entrée « Tickets » du menu (injection DOM,
 *      car ce lien est rendu par Payload en dehors de ce composant).
 * Compteurs lus via l'API REST Payload et rafraîchis au changement de page.
 */
const REPLIES = "where[unreadClientReply][equals]=true";
const NEWS =
  "where[and][0][needsAttention][equals]=true&where[and][1][unreadClientReply][not_equals]=true&where[and][2][status][not_equals]=resolved";

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

type Counts = { replies: number; news: number };

/** Puces réutilisées (menu Notifications + injection sur Tickets). */
function badgesMarkup(counts: Counts): string {
  const parts: string[] = [];
  if (counts.replies > 0) {
    parts.push(
      `<span class="nav-badge nav-badge--reply" title="Réponses client en attente">${counts.replies}</span>`,
    );
  }
  if (counts.news > 0) {
    parts.push(
      `<span class="nav-badge nav-badge--new" title="Nouveaux tickets">${counts.news}</span>`,
    );
  }
  return parts.join("");
}

export function NavNotifications() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const pathname = usePathname();

  // (Re)charge les compteurs à chaque navigation dans l'admin.
  useEffect(() => {
    let active = true;
    (async () => {
      const [replies, news] = await Promise.all([countTickets(REPLIES), countTickets(NEWS)]);
      if (active) setCounts({ replies, news });
    })();
    return () => {
      active = false;
    };
  }, [pathname]);

  // Injecte les puces sur l'entrée « Tickets » du menu (rendue par Payload).
  useEffect(() => {
    if (!counts) return;
    const link = document.querySelector<HTMLAnchorElement>(
      'a[href$="/admin/collections/tickets"]',
    );
    if (!link) return;
    let holder = link.querySelector<HTMLSpanElement>(".nav-badges");
    if (!holder) {
      holder = document.createElement("span");
      holder.className = "nav-badges";
      link.appendChild(holder);
    }
    holder.innerHTML = badgesMarkup(counts);
    return () => {
      holder?.replaceChildren();
    };
  }, [counts]);

  const total = (counts?.replies ?? 0) + (counts?.news ?? 0);

  return (
    <Link
      className={`nav__link nav-notif-link${total > 0 ? " nav-notif-link--active" : ""}`}
      href="/admin/notifications"
    >
      <span className="nav-notif-link__icon" aria-hidden>
        🔔
      </span>
      <span className="nav-notif-link__label">Notifications</span>
      <span className="nav-badges">
        {counts && counts.replies > 0 && (
          <span className="nav-badge nav-badge--reply" title="Réponses client en attente">
            {counts.replies}
          </span>
        )}
        {counts && counts.news > 0 && (
          <span className="nav-badge nav-badge--new" title="Nouveaux tickets">
            {counts.news}
          </span>
        )}
      </span>
    </Link>
  );
}
