"use client";

import { useAuth } from "@payloadcms/ui";
import { useEffect, type ReactNode } from "react";

import { hasAdminRole } from "@/core/access";

/**
 * Pose sur <body> une classe reflétant le rôle courant : `tim-is-admin` (admin /
 * super-admin) ou `tim-not-admin` (partenaires, support…). Permet de piloter en
 * CSS des éléments qui n'ont pas d'option de visibilité par rôle côté config
 * (ex. onglet API du document, action « Créer un » des contrôles de document).
 *
 * Monté via `admin.components.providers` → englobe toute l'admin ; rend `children`.
 */
export default function RoleBodyClass({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = hasAdminRole(user);

  useEffect(() => {
    const cls = isAdmin ? "tim-is-admin" : "tim-not-admin";
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [isAdmin]);

  return <>{children}</>;
}
