import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { createRateLimiter, incrementVue, maskIp, parseVue } from "@/modules/analytics/lib/video-views";
import { clientIp } from "@/modules/forms/lib/ingest";
import { APP_V2_PATH, APP_V2_VIDEO_ID } from "@/modules/marketing/lib/app-v2";

/**
 * POST /api/app-v2/vues  { etape, appareil? }  → +1 sur le compteur du jour.
 *
 * Même compteur anonyme que les vidéos de la vitrine (analyses → vidéos), mais
 * appelé directement par le navigateur : la page est sur le support lui-même,
 * pas besoin de relais ni de secret. En échange, la vidéo et la page sont FIXÉES
 * ici — on ne laisse pas une page publique écrire dans le compteur d'une autre
 * vidéo.
 */
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ max: 60, windowMs: 60 * 60 * 1000 });

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    /* corps illisible */
  }
  const vue = parseVue({ ...body, video_id: APP_V2_VIDEO_ID, page: APP_V2_PATH, canal: "direct" });
  if (!vue) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const payload = await payloadClient();
  const { ip } = clientIp(req);
  if (ip && !limiter.hit(ip)) {
    payload.logger.warn(`[app-v2] débit de vues dépassé pour ${maskIp(ip)}.`);
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  await incrementVue(payload, vue);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
