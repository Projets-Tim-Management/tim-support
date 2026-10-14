import { NextResponse } from "next/server";

import { requestRetouch } from "@/modules/ads/lib/retouch";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { FinalError } from "@/modules/ads/lib/rush-process";

/**
 * POST /api/admin/ads/creatives/:id/retouche  { instruction, generalize? }
 *
 * Met en file la retouche d'une créa « À valider » : ce que Charlie veut
 * changer (plan Publicité, retouche ciblée). Le clic EST la demande ; l'IA la
 * traite au prochain passage du cron (chaque minute). `generalize` crée aussi
 * une consigne active pour la campagne.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const body = (await req.json().catch(() => ({}))) as { instruction?: unknown; generalize?: unknown };
  try {
    const r = await requestRetouch(payload, id, { instruction: String(body.instruction ?? ""), generalize: body.generalize === true, author: user.id });
    return NextResponse.json({ id: r.id, status: "en-attente" });
  } catch (e) {
    const known = e instanceof FinalError;
    if (!known) payload.logger.error(`[publicité] retouche de la créa ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: known ? (e as Error).message : `Retouche impossible : ${(e as Error).message}` }, { status: known ? 409 : 502 });
  }
}
