import { randomUUID } from "crypto";

import { sql } from "@payloadcms/db-postgres";
import { cookies, headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { IMPERSONATING, IMPERSONATOR, PAYLOAD_TOKEN, signUserToken } from "@/core/lib/auth-token";
import { payloadClient } from "@/core/payload-client";

/**
 * Démarre l'impersonation (« voir comme »). Réservé aux admins/super-admins.
 * On sauvegarde le token admin (pour ressortir), puis on bascule le cookie
 * d'auth sur la cible. Anti-escalade : on ne peut PAS voir comme un admin.
 */
export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: await nextHeaders() });

  if (!user || !hasAdminRole(user)) {
    return NextResponse.json({ code: "forbidden", message: "Réservé aux administrateurs." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { userId?: unknown };
  if (body?.userId == null) {
    return NextResponse.json({ code: "bad_request", message: "Compte manquant." }, { status: 400 });
  }

  const target = (await payload
    .findByID({ collection: "users", id: body.userId as string | number, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: number | string; email: string; roles?: string[] } | null;
  if (!target) {
    return NextResponse.json({ code: "not_found", message: "Compte introuvable." }, { status: 404 });
  }
  if (hasAdminRole(target)) {
    return NextResponse.json(
      { code: "forbidden", message: "Impossible de voir comme un administrateur." },
      { status: 403 },
    );
  }

  // Session Payload pour la cible (v3 exige un `sid` valide en base).
  const sid = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (payload.db as any).drizzle;
  const ord = await db.execute(
    sql`SELECT COALESCE(MAX(_order),0)+1 AS o FROM users_sessions WHERE _parent_id = ${target.id}`,
  );
  const order = Number(ord?.rows?.[0]?.o ?? 1);
  await db.execute(
    sql`INSERT INTO users_sessions (_order, _parent_id, id, created_at, expires_at) VALUES (${order}, ${target.id}, ${sid}, ${now}, ${expires})`,
  );

  const jar = await cookies();
  const adminToken = jar.get(PAYLOAD_TOKEN)?.value ?? "";
  const targetToken = await signUserToken({ id: target.id, email: target.email }, sid);

  const secure = process.env.NODE_ENV === "production";
  const opts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

  const res = NextResponse.json({ ok: true, email: target.email });
  res.cookies.set(IMPERSONATOR, adminToken, opts);
  res.cookies.set(PAYLOAD_TOKEN, targetToken, opts);
  res.cookies.set(IMPERSONATING, target.email, { ...opts, httpOnly: false });

  // Audit minimal.
  console.info(
    `[impersonate] ${(user as { email?: string }).email ?? user} → ${target.email}`,
  );
  return res;
}
