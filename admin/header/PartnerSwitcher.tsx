"use client";

import { useAuth, useConfig, useNav } from "@payloadcms/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAvatarUrl } from "../graphics/Avatar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Barre du haut unique (façon « switcher d'entreprise » Pennylane), rendue via
 * admin.components.header. Remplace l'app-header natif de Payload (fil d'Ariane +
 * profil), qui est masqué en CSS pour n'avoir QU'UNE barre.
 *
 *   [ switcher partenaire ........................ cloche · compte ]
 *
 * Sélection d'un partenaire : mémorise le partenaire actif dans un cookie
 * (`tim_active_partner`) puis navigue vers sa fiche.
 *
 * TODO (prochaine étape) : basculer vers une VUE À ACCÈS PARTENAIRE dédiée, qui
 * ne montre que ce qu'on autorise le partenaire à voir. Elle lira le cookie
 * `tim_active_partner`. Point de bascule : `goToPartner()`.
 */

interface Partner {
  id: string | number;
  name?: string;
  societe?: string;
  code?: string;
  status?: string;
  partnerKind?: string;
}

interface NotifItem {
  id: string | number;
  number?: number;
  subject?: string;
  who?: string;
  unread?: boolean;
  updatedAt?: string;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Actif",
  paused: "En pause",
  archived: "Archivé",
};
const KIND_LABEL: Record<string, string> = {
  metier: "Métier",
  utilisateur: "Utilisateur",
};

const COOKIE = "tim_active_partner";
const COOKIE_LABEL = "tim_active_partner_label";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

const plabel = (p: Partner) => p.name || p.societe || `#${p.id}`;

export default function PartnerSwitcher() {
  const router = useRouter();
  const { config } = useConfig();
  const { user } = useAuth();
  const { navOpen, setNavOpen } = useNav();
  const adminRoute = config.routes.admin;

  const [menu, setMenu] = useState<null | "partner" | "account" | "notif">(null);
  const [query, setQuery] = useState("");
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<{ id: string; label: string } | null>(null);
  const [highlight, setHighlight] = useState<Partner | null>(null);
  const [notifs, setNotifs] = useState<{ count: number; items: NotifItem[] }>({ count: 0, items: [] });

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = readCookie(COOKIE);
    const lbl = readCookie(COOKIE_LABEL);
    if (id && lbl) setActive({ id, label: lbl });
  }, []);

  // Notifications = tickets à traiter (needsAttention & non résolus). Compteur
  // pour la puce + liste pour le popover, rafraîchis au changement de page.
  const pathname = usePathname();
  useEffect(() => {
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
  }, [pathname]);

  const load = useCallback(async () => {
    if (partners || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/payload-api/partners?limit=200&depth=0&sort=name`, {
        credentials: "include",
      });
      const json = await res.json();
      setPartners((json?.docs as Partner[]) ?? []);
    } catch {
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }, [partners, loading]);

  useEffect(() => {
    if (menu === "partner") {
      void load();
      setTimeout(() => searchRef.current?.focus(), 20);
    }
  }, [menu, load]);

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

  const filtered = useMemo(() => {
    const list = partners ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => [p.name, p.societe, p.code].some((v) => v?.toLowerCase().includes(q)));
  }, [partners, query]);

  const goToPartner = (p: Partner) => {
    writeCookie(COOKIE, String(p.id));
    writeCookie(COOKIE_LABEL, plabel(p));
    setActive({ id: String(p.id), label: plabel(p) });
    setMenu(null);
    // Intérim : fiche du partenaire. À remplacer par la vue à accès partenaire.
    router.push(`${adminRoute}/collections/partners/${p.id}`);
  };

  const reset = () => {
    clearCookie(COOKIE);
    clearCookie(COOKIE_LABEL);
    setActive(null);
    setMenu(null);
  };

  const details = highlight ?? filtered[0] ?? null;
  const userLabel = (user?.name as string) || (user?.email as string) || "Compte";
  const userInitial = userLabel.charAt(0).toUpperCase();
  const avatarUrl = useAvatarUrl();

  return (
    <div className={`tim-topbar${navOpen ? "" : " tim-topbar--full"}`} ref={rootRef}>
      {/* ── Gauche : bouton de repli (custom, remplace le ‹ natif) + switcher ── */}
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
        <div className="tim-pswitch">
        <button
          type="button"
          className={`tim-pswitch__btn${active ? " is-active" : ""}`}
          onClick={() => setMenu((m) => (m === "partner" ? null : "partner"))}
          aria-haspopup="dialog"
          aria-expanded={menu === "partner"}
        >
          <span className="tim-pswitch__avatar" aria-hidden>
            {(active?.label ?? "P").charAt(0).toUpperCase()}
          </span>
          <span className="tim-pswitch__current">
            <span className="tim-pswitch__eyebrow">Partenaire</span>
            <span className="tim-pswitch__name">{active?.label ?? "Sélectionner…"}</span>
          </span>
          <svg className="tim-pswitch__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {menu === "partner" && (
          <div className="tim-pswitch__pop" role="dialog" aria-label="Changer de partenaire">
            <div className="tim-pswitch__main">
              <div className="tim-pswitch__search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Rechercher un partenaire…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="tim-pswitch__list" role="listbox">
                <div className="tim-pswitch__list-title">Vos partenaires</div>
                {loading && <div className="tim-pswitch__empty">Chargement…</div>}
                {!loading && filtered.length === 0 && (
                  <div className="tim-pswitch__empty">Aucun partenaire trouvé</div>
                )}
                {filtered.map((p) => (
                  <button
                    key={String(p.id)}
                    type="button"
                    role="option"
                    aria-selected={active?.id === String(p.id)}
                    className={`tim-pswitch__item${active?.id === String(p.id) ? " is-current" : ""}`}
                    onMouseEnter={() => setHighlight(p)}
                    onClick={() => goToPartner(p)}
                  >
                    <span className="tim-pswitch__item-avatar" aria-hidden>
                      {plabel(p).charAt(0).toUpperCase()}
                    </span>
                    <span className="tim-pswitch__item-label">{plabel(p)}</span>
                    {p.code && <span className="tim-pswitch__item-code">{p.code}</span>}
                  </button>
                ))}
              </div>
              {active && (
                <button type="button" className="tim-pswitch__reset" onClick={reset}>
                  Quitter le partenaire actif
                </button>
              )}
            </div>

            <aside className="tim-pswitch__details">
              {details ? (
                <>
                  <div className="tim-pswitch__details-name">{plabel(details)}</div>
                  <dl className="tim-pswitch__dl">
                    {details.code && (
                      <>
                        <dt>Code</dt>
                        <dd>{details.code}</dd>
                      </>
                    )}
                    {details.status && (
                      <>
                        <dt>Statut</dt>
                        <dd>{STATUS_LABEL[details.status] ?? details.status}</dd>
                      </>
                    )}
                    {details.partnerKind && (
                      <>
                        <dt>Type</dt>
                        <dd>{KIND_LABEL[details.partnerKind] ?? details.partnerKind}</dd>
                      </>
                    )}
                    {details.societe && (
                      <>
                        <dt>Société</dt>
                        <dd>{details.societe}</dd>
                      </>
                    )}
                  </dl>
                  <button type="button" className="tim-pswitch__open" onClick={() => goToPartner(details)}>
                    Ouvrir ce partenaire
                  </button>
                </>
              ) : (
                <p className="tim-pswitch__details-empty">Survolez un partenaire pour voir ses infos.</p>
              )}
            </aside>
          </div>
        )}
        </div>
      </div>

      {/* ── Droite : notifications + compte ───────────────────────────── */}
      <div className="tim-topbar__right">
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
              <Link
                href={`${adminRoute}/notifications`}
                className="tim-notif__all"
                onClick={() => setMenu(null)}
              >
                Voir toutes les notifications →
              </Link>
            </div>
          )}
        </div>

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
