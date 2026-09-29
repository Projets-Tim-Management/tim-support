import { NextResponse } from "next/server";
import type { Payload } from "payload";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";

type User = NonNullable<Awaited<ReturnType<Payload["auth"]>>["user"]>;

/**
 * La barrière de toutes les routes du module Publicité : un compte connecté,
 * et le bon rôle (admin par défaut ; super-admin pour la purge). Une seule
 * écriture, pour qu'une route ajoutée ne puisse pas l'oublier à moitié.
 */
export async function adminRequest(
  req: Request,
  allowed: (user: unknown) => boolean = hasAdminRole,
  refusal = "forbidden",
): Promise<{ payload: Payload; user: User } | { response: NextResponse }> {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!allowed(user)) return { response: NextResponse.json({ error: refusal }, { status: 403 }) };
  return { payload, user };
}
