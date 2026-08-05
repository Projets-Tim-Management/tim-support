import { sql } from "@payloadcms/db-postgres";
import { decodeJwt } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { IMPERSONATING, IMPERSONATOR, PAYLOAD_TOKEN } from "@/core/lib/auth-token";
import { payloadClient } from "@/core/payload-client";

/**
 * Ressort de l'impersonation : supprime la session d'impersonation, restaure le
 * token admin d'origine (conservé en cookie httpOnly, donc infalsifiable) et
 * nettoie les cookies. Si le token admin a expiré, on le supprime → reconnexion.
 */
export async function POST() {
  const jar = await cookies();
  const current = jar.get(PAYLOAD_TOKEN)?.value;
  const original = jar.get(IMPERSONATOR)?.value;

  // Nettoyage de la session d'impersonation (sid du token courant).
  if (current) {
    try {
      const sid = decodeJwt(current)?.sid as string | undefined;
      if (sid) {
        const payload = await payloadClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (payload.db as any).drizzle.execute(sql`DELETE FROM users_sessions WHERE id = ${sid}`);
      }
    } catch {
      /* best-effort : la session expirera d'elle-même */
    }
  }

  const secure = process.env.NODE_ENV === "production";
  const opts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

  const res = NextResponse.json({ ok: true });
  if (original) res.cookies.set(PAYLOAD_TOKEN, original, opts);
  else res.cookies.delete(PAYLOAD_TOKEN);
  res.cookies.delete(IMPERSONATOR);
  res.cookies.delete(IMPERSONATING);
  return res;
}
