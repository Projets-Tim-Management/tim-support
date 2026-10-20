import { NextResponse } from "next/server";

import { AccountUnavailable, checkAccountAccess } from "@/modules/ads/lib/account-access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { AdTokenError } from "@/modules/ads/platforms/types";

/**
 * POST /api/admin/ads/accounts/:id/acces — « Vérifier les droits » : ce que le
 * jeton permet chez la régie, et les Pages, comptes Instagram et pixels qu'il
 * ouvre (voir lib/account-access). Le jeton ne sort jamais du serveur.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  try {
    return NextResponse.json(await checkAccountAccess(payload, id));
  } catch (e) {
    const known = e instanceof AccountUnavailable || e instanceof AdTokenError;
    if (!known) payload.logger.error(`[publicité] vérification des droits du compte ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: (e as Error).message }, { status: known ? 409 : 502 });
  }
}
