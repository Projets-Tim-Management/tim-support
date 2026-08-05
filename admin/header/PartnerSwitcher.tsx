"use client";

import { useAuth, useConfig, useNav } from "@payloadcms/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { hasAdminRole, isSupport } from "@/core/access";

import { useAvatarUrl } from "../graphics/Avatar";
import ImpersonationControl from "./ImpersonationControl";

/**
 * Barre du haut unique (façon Pennylane), rendue via admin.components.header.
 * Remplace l'app-header natif de Payload (masqué en CSS pour n'avoir QU'UNE barre).
 *
 *   [ collapse · « Voir comme » ............. cloche · compte ]
 *
 * - « Voir comme » : impersonation (voir la vue d'un compte) → ImpersonationControl.
 * - Cloche : tickets à traiter (admins + support).
 * - Compte : profil + déconnexion.
 */

interface NotifItem {
  id: string | number;
  number?: number;
  subject?: string;
  who?: string;
  unread?: boolean;
  updatedAt?: string;
}

export default function PartnerSwitcher() {
  const { config } = useConfig();
  const { user } = useAuth();
  const { navOpen, setNavOpen } = useNav();
  const adminRoute = config.routes.admin;

  // Cloche (tickets) réservée aux admins + support ; pendant l'impersonation,
  // `user` est la cible → la barre reflète naturellement sa vue.
  const canSeeTickets = hasAdminRole(user) || isSupport(user);

  const [menu, setMenu] = useState<null | "account" | "notif">(null);
  const [notifs, setNotifs] = useState<{ count: number; items: NotifItem[] }>({ count: 0, items: [] });
  const rootRef = useRef<HTMLDivElement>(null);

  // Notifications = tickets à traiter, rafraîchis au changement de page.
  const pathname = usePathname();
  useEffect(() => {
    if (!canSeeTickets) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/payload-api/tickets?where[and][0][needsAttention][equals]=true&where[and][1][status][not_equals]=resolved&sort=-updatedAt&limit=15&depth=0`,
          { credentials: "include" },
        );
        const json = await res.json();
        if (cancelled) return;
        setNotifs({
          count: json?.totalDocs ?? 0,
          items: ((json?.docs as Record<string, unknown>[]) ?? []).map((t) => ({
            id: t.id as string | number,
            number: t.number as number,
            subject: t.subject as string,
            who: (t.name as string) || (t.email as string),
            unread: t.unreadClientReply === true,
            updatedAt: t.updatedAt as string,
          })),
        });
      } catch {
        /* silencieux : la puce reste à sa dernière valeur */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, canSeeTickets]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const userLabel = (user?.name as string) || (user?.email as string) || "Compte";
  const userInitial = userLabel.charAt(0).toUpperCase();
  const avatarUrl = useAvatarUrl();

  return (
    <div className={`tim-topbar${navOpen ? "" : " tim-topbar--full"}`} ref={rootRef}>
      {/* ── Gauche : repli du menu + « Voir comme » ── */}
      <div className="tim-topbar__left">
        <button
          type="button"
          className="tim-collapse"
          onClick={() => setNavOpen(!navOpen)}
          aria-label={navOpen ? "Replier le menu" : "Déplier le menu"}
          title={navOpen ? "Replier le menu" : "Déplier le menu"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        <ImpersonationControl />
      </div>

      {/* ── Droite : notifications + compte ── */}
      <div className="tim-topbar__right">
        {canSeeTickets && (
          <div className="tim-notif">
            <button
              type="button"
              className="tim-iconbtn"
              onClick={() => setMenu((m) => (m === "notif" ? null : "notif"))}
              aria-haspopup="dialog"
              aria-expanded={menu === "notif"}
              aria-label={`Notifications${notifs.count ? ` (${notifs.count})` : ""}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {notifs.count > 0 && <span className="tim-notif__dot-badge" aria-hidden />}
            </button>

            {menu === "notif" && (
              <div className="tim-notif__pop" role="dialog" aria-label="Notifications">
                <div className="tim-notif__head">
                  <span>Notifications</span>
                  {notifs.count > 0 && <span className="tim-notif__count">{notifs.count}</span>}
                </div>
                <div className="tim-notif__list">
                  {notifs.items.length === 0 ? (
                    <p className="tim-notif__empty">Rien à signaler 🎉</p>
                  ) : (
                    notifs.items.map((n) => (
                      <Link
                        key={String(n.id)}
                        href={`${adminRoute}/collections/tickets/${n.id}`}
                        className="tim-notif__item"
                        onClick={() => setMenu(null)}
                      >
                        <span className={`tim-notif__dot${n.unread ? " is-reply" : ""}`} aria-hidden>
                          {n.unread ? "💬" : "🎫"}
                        </span>
                        <span className="tim-notif__item-main">
                          <span className="tim-notif__item-title">
                            {n.number ? `#${n.number} · ` : ""}
                            {n.subject || "(sans sujet)"}
                          </span>
                          <span className="tim-notif__item-meta">{n.who || "—"}</span>
                        </span>
                      </Link>
                    ))
                  )}
                </div>
                <Link href={`${adminRoute}/notifications`} className="tim-notif__all" onClick={() => setMenu(null)}>
                  Voir toutes les notifications →
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="tim-account">
          <button
            type="button"
            className="tim-account__btn"
            onClick={() => setMenu((m) => (m === "account" ? null : "account"))}
            aria-haspopup="menu"
            aria-expanded={menu === "account"}
            aria-label="Mon compte"
          >
            <span className="tim-account__avatar">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="tim-avatar__img" src={avatarUrl} alt="" />
              ) : (
                userInitial
              )}
            </span>
          </button>
          {menu === "account" && (
            <div className="tim-account__pop" role="menu">
              <div className="tim-account__head">
                <span className="tim-account__name">{userLabel}</span>
                {user?.email && userLabel !== user.email && (
                  <span className="tim-account__email">{user.email as string}</span>
                )}
              </div>
              <Link href={`${adminRoute}/account`} className="tim-account__item" role="menuitem" onClick={() => setMenu(null)}>
                Mon compte
              </Link>
              <Link href={`${adminRoute}/logout`} className="tim-account__item tim-account__item--danger" role="menuitem">
                Déconnexion
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
