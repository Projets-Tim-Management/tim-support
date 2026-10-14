import { NextResponse } from "next/server";

import { FinalError } from "@/modules/ads/lib/rush-process";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { requestVideo } from "@/modules/ads/video/render";

/**
 * POST /api/admin/ads/creatives/:id/video  { styleId }
 *
 * Met la vidéo d'une créa en file de rendu, dans le style choisi, avec la
 * partition par défaut (plan Publicité, §9 sexies, D3) : de quoi essayer les
 * styles sur une créa existante. La partition est vérifiée avant ; le rendu
 * part au prochain passage du cron (chaque minute, quelques minutes de calcul).
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const body = (await req.json().catch(() => ({}))) as { styleId?: unknown };
  if (body.styleId == null) return NextResponse.json({ error: "Choisissez un style." }, { status: 400 });
  try {
    const { score } = await requestVideo(payload, id, { styleId: body.styleId as number });
    return NextResponse.json({ status: "en-attente", shots: score.shots.length });
  } catch (e) {
    const known = e instanceof FinalError;
    if (!known) payload.logger.error(`[publicité] vidéo de la créa ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: known ? (e as Error).message : `Vidéo impossible : ${(e as Error).message}` }, { status: known ? 409 : 502 });
  }
}
