import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import {
  MAX_ATTEMPTS,
  PORTAL_COOKIE,
  SESSION_MAX_AGE_S,
  codeMatches,
  cookieOptions,
  createSessionToken,
} from "@/modules/marketing/lib/portal-auth";

/**
 * POST /api/portal/verify  { email, code }  → ouvre une session de 24 h.
 *
 * Le code est à usage unique : qu'il soit bon ou mauvais, on le consomme dès que
 * le quota d'essais est atteint. Un code juste mais expiré est refusé comme un
 * code faux — un attaquant ne doit pas apprendre qu'il avait trouvé le bon.
 */
export async function POST(req: Request) {
  let email: string | undefined;
  let code: string | undefined;
  try {
    const body = await req.json();
    email = body?.email?.toString().trim().toLowerCase();
    code = body?.code?.toString().trim();
  } catch {
    /* corps illisible */
  }
  if (!email || !code) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const payload = await payloadClient();
  const found = await payload.find({
    collection: "client-portal-accounts",
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const account = found.docs[0] as
    | {
        id: number | string;
        client?: number | string;
        active?: boolean;
        codeHash?: string;
        codeExpiresAt?: string;
        codeAttempts?: number;
      }
    | undefined;

  const invalid = () => NextResponse.json({ error: "invalid_code" }, { status: 401 });

  if (!account || account.active === false || !account.codeHash) return invalid();

  const attempts = account.codeAttempts ?? 0;
  const expired = !account.codeExpiresAt || Date.parse(account.codeExpiresAt) < Date.now();

  if (attempts >= MAX_ATTEMPTS || expired || !codeMatches(code, account.codeHash)) {
    const next = attempts + 1;
    await payload.update({
      collection: "client-portal-accounts",
      id: account.id,
      // Au-delà du quota, le code est effacé : il faut en redemander un.
      data:
        next >= MAX_ATTEMPTS || expired
          ? { codeAttempts: next, codeHash: null, codeExpiresAt: null }
          : { codeAttempts: next },
      overrideAccess: true,
    });
    return invalid();
  }

  const clientId =
    typeof account.client === "object" ? (account.client as { id: unknown })?.id : account.client;
  if (clientId == null) return invalid();

  // Code correct → consommé immédiatement (usage unique).
  await payload.update({
    collection: "client-portal-accounts",
    id: account.id,
    data: {
      codeHash: null,
      codeExpiresAt: null,
      codeAttempts: 0,
      lastLoginAt: new Date().toISOString(),
    },
    overrideAccess: true,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    PORTAL_COOKIE,
    createSessionToken(account.id, clientId as string | number),
    cookieOptions(SESSION_MAX_AGE_S),
  );
  return res;
}
