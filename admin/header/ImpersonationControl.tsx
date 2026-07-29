"use client";

import { useAuth } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hasAdminRole } from "@/core/access";

/**
 * « Voir comme un compte » (impersonation) dans la barre du haut — même rendu
 * que l'ancien switcher (recherche + liste + panneau de détails), mais listant
 * les COMPTES : un clic bascule sur la session du compte (voir sa vue).
 * Pendant l'impersonation (cookie `tim_impersonating`), on affiche un bandeau
 * « Revenir en admin ».
 */

interface Partner {
  name?: string;
  partnerKind?: string;
}
interface U {
  id: number | string;
  email: string;
  name?: string;
  roles?: string[];
  partner?: Partner | number | null;
}

const ROLE_LABEL: Record<string, string> = {
  "partner-metier": "Partenaire — Métier",
  "partner-utilisateur": "Partenaire — Utilisateur",
  support: "Support",
};

const readCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
};

const ulabel = (u: U) => u.name || u.email;
const roleOf = (u: U) => (u.roles ?? []).find((r) => ROLE_LABEL[r]);
const partnerName = (u: U): string | null =>
  u.partner && typeof u.partner === "object" ? (u.partner.name ?? null) : null;

export default function ImpersonationControl() {
  const { user } = useAuth();
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<U[] | null>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<U | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImpersonating(readCookie("tim_impersonating"));
  }, []);

  const isAdmin = hasAdminRole(user);

  const load = useCallback(async () => {
    if (users) return;
    try {
      const r = await fetch(`/payload-api/users?limit=300&depth=1&sort=email`, {
        credentials: "include",
      }).then((res) => res.json());
      const list = ((r?.docs as U[]) ?? []).filter(
        (u) => !(u.roles ?? []).some((x) => x === "admin" || x === "super-admin"),
      );
      setUsers(list);
    } catch {
      setUsers([]);
    }
  }, [users]);

  useEffect(() => {
    if (open) {
      void load();
      setTimeout(() => searchRef.current?.focus(), 20);
    }
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const list = users ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => [u.email, u.name].some((v) => v?.toLowerCase().includes(q)));
  }, [users, query]);

  const details = highlight ?? filtered[0] ?? null;

  const start = async (u: U) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: u.id }),
      });
      if (res.ok) {
        window.location.href = "/admin";
        return;
      }
    } catch {
      /* noop */
    }
    setBusy(false);
  };

  const exit = async () => {
    setBusy(true);
    await fetch(`/api/admin/impersonate/exit`, { method: "POST", credentials: "include" }).catch(
      () => {},
    );
    window.location.href = "/admin";
  };

  // ── Bandeau pendant l'impersonation (indépendant du rôle courant) ──────────
  if (impersonating) {
    return (
      <div className="tim-imp-bar">
        <span className="tim-imp-bar__eye" aria-hidden>
          👁
        </span>
        <span className="tim-imp-bar__text">
          Vous voyez la vue de <strong>{impersonating}</strong>
        </span>
        <button type="button" className="tim-imp-bar__exit" onClick={() => void exit()} disabled={busy}>
          {busy ? "…" : "Revenir en admin"}
        </button>
      </div>
    );
  }

  // ── Switcher « Voir comme » (admins seulement) — rendu d'origine ───────────
  if (!isAdmin) return null;

  return (
    <div className="tim-pswitch" ref={rootRef}>
      <button
        type="button"
        className="tim-pswitch__btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="tim-pswitch__current">
          <span className="tim-pswitch__eyebrow">Voir comme</span>
          <span className="tim-pswitch__name">Sélectionner un compte…</span>
        </span>
        <svg className="tim-pswitch__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="tim-pswitch__pop" role="dialog" aria-label="Voir comme un compte">
          <div className="tim-pswitch__main">
            <div className="tim-pswitch__search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Rechercher un compte…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="tim-pswitch__list" role="listbox">
              <div className="tim-pswitch__list-title">Comptes</div>
              {users === null && <div className="tim-pswitch__empty">Chargement…</div>}
              {users !== null && filtered.length === 0 && (
                <div className="tim-pswitch__empty">Aucun compte trouvé</div>
              )}
              {filtered.map((u) => {
                const role = roleOf(u);
                return (
                  <button
                    key={String(u.id)}
                    type="button"
                    role="option"
                    className="tim-pswitch__item"
                    onMouseEnter={() => setHighlight(u)}
                    onClick={() => void start(u)}
                    disabled={busy}
                  >
                    <span className="tim-pswitch__item-avatar" aria-hidden>
                      {ulabel(u).charAt(0).toUpperCase()}
                    </span>
                    <span className="tim-pswitch__item-label">{ulabel(u)}</span>
                    {role && <span className="tim-pswitch__item-code">{ROLE_LABEL[role]}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="tim-pswitch__details">
            {details ? (
              <>
                <div className="tim-pswitch__details-name">{ulabel(details)}</div>
                <dl className="tim-pswitch__dl">
                  <dt>Email</dt>
                  <dd>{details.email}</dd>
                  {roleOf(details) && (
                    <>
                      <dt>Rôle</dt>
                      <dd>{ROLE_LABEL[roleOf(details) as string]}</dd>
                    </>
                  )}
                  {partnerName(details) && (
                    <>
                      <dt>Fiche</dt>
                      <dd>{partnerName(details)}</dd>
                    </>
                  )}
                </dl>
                <button
                  type="button"
                  className="tim-pswitch__open"
                  onClick={() => void start(details)}
                  disabled={busy}
                >
                  Voir comme ce compte
                </button>
              </>
            ) : (
              <p className="tim-pswitch__details-empty">Survolez un compte pour voir ses infos.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
