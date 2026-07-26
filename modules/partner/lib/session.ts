import { cookies } from "next/headers";
import { jwtVerify } from "jose";

import { JWT_SECRET, SESSION_COOKIE } from "@/core/lib/jwt-secret";

export interface Session {
  /** Identifiant utilisateur de l'app (claim `sub` du JWT). */
  sub: string;
  email: string;
  name?: string;
}

/**
 * Lit et vérifie le cookie de session posé par le middleware (proxy.ts).
 * Retourne null si absent ou invalide — les pages partenaires affichent alors
 * une invitation à se connecter depuis l'app.
 *
 * Server-only (utilise next/headers). À appeler dans un Server Component ou
 * une route handler.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  // ── Bypass de prévisualisation (DEV UNIQUEMENT) ───────────────────────────
  // Permet de voir l'espace partenaires sans login pendant qu'on met la
  // connexion de côté. Garde-fou strict : jamais actif en production, et
  // seulement si PARTNER_DEV_EMAIL est défini. À retirer/ignorer en prod.
  if (
    !token &&
    process.env.NODE_ENV !== "production" &&
    process.env.PARTNER_DEV_EMAIL
  ) {
    return {
      sub: "dev",
      email: process.env.PARTNER_DEV_EMAIL,
      name: process.env.PARTNER_DEV_NAME ?? "Aperçu dev",
    };
  }

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!email) return null;
    return {
      sub,
      email,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}
