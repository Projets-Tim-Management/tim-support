"use client";

import { useAuth } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hasAdminRole } from "@/core/access";

/**
 * « Voir comme un compte » (impersonation) dans la barre du haut.
 *  - Admin, hors impersonation : un sélecteur pour basculer sur un compte non-admin.
 *  - Pendant l'impersonation (piloté par le cookie `tim_impersonating`, donc affiché
 *    quel que soit le rôle courant) : un bandeau avec « Revenir en admin ».
 */

interface U {
  id: number | string;
  email: string;
  name?: string;
  roles?: string[];
}

const readCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
};

const ROLE_LABEL: Record<string, string> = {
  "partner-metier": "Partenaire — Métier",
  "partner-utilisateur": "Partenaire — Utilisateur",
  support: "Support",
};

export default function ImpersonationControl() {
  const { user } = useAuth();
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<U[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImpersonating(readCookie("tim_impersonating"));
  }, []);

  const isAdmin = hasAdminRole(user);

  const loadUsers = useCallback(async () => {
    if (users) return;
    try {
      const r = await fetch(`/payload-api/users?limit=300&depth=0&sort=email`, {
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
    if (open) void loadUsers();
  }, [open, loadUsers]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

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

  const filtered = useMemo(() => {
    const list = users ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => [u.email, u.name].some((v) => v?.toLowerCase().includes(q)));
  }, [users, query]);

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

  // ── Sélecteur « Voir comme » (admins seulement) ────────────────────────────
  if (!isAdmin) return null;

  return (
    <div className="tim-imp" ref={ref}>
      <button
        type="button"
        className="tim-imp__btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="tim-imp__eye" aria-hidden>
          👁
        </span>
        <span className="tim-imp__label">Voir comme…</span>
        <svg className="tim-imp__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="tim-imp__pop" role="dialog" aria-label="Voir comme un compte">
          <div className="tim-imp__search">
            <input
              autoFocus
              type="text"
              placeholder="Rechercher un compte…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="tim-imp__list" role="listbox">
            {users === null ? (
              <div className="tim-imp__empty">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="tim-imp__empty">Aucun compte à afficher</div>
            ) : (
              filtered.map((u) => {
                const role = (u.roles ?? []).find((r) => ROLE_LABEL[r]);
                return (
                  <button
                    key={String(u.id)}
                    type="button"
                    role="option"
                    className="tim-imp__item"
                    onClick={() => void start(u)}
                    disabled={busy}
                  >
                    <span className="tim-imp__item-name">{u.name || u.email}</span>
                    <span className="tim-imp__item-meta">
                      {u.email}
                      {role ? ` · ${ROLE_LABEL[role]}` : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
