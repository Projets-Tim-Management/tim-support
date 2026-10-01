import { NextResponse } from "next/server";

import { LaunchError, stopRun } from "@/modules/ads/agent/run";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * « Arrêter » : le passage et tous ses agents s'arrêtent tout de suite. Une
 * étape déjà partie (un appel au modèle en vol) se termine et s'inscrit ; aucune
 * autre ne démarre. Ce qui a été produit reste.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  try {
    await stopRun(payload, id, (user as { email?: string }).email ?? "un admin");
    payload.logger.info(`[publicité] passage ${id} arrêté par ${(user as { email?: string }).email}.`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LaunchError ? 409 : 502 });
  }
}
