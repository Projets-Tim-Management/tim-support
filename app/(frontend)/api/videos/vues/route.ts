import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { createRateLimiter, incrementVue, maskIp, parseVue } from "@/modules/analytics/lib/video-views";
import { checkIngestKey, clientIp } from "@/modules/forms/lib/ingest";

/**
 * POST /api/videos/vues  { video_id, etape, page }  → +1 sur le compteur du jour.
 *
 * Appelée par le relais serveur du site vitrine, à chaque étape d'une vidéo de
 * démonstration (lecture, 25 %, 50 %, 75 %, fin). Même secret et même en-tête
 * que les formulaires. L'adresse du visiteur (X-Visitor-IP) ne sert qu'au
 * plafond de débit, en mémoire : elle n'est JAMAIS écrite en base (voir
 * lib/video-views.ts — mesure anonyme, exemptée de consentement).
 */
export const dynamic = "force-dynamic";

const MAX_PER_IP_PER_HOUR = 60;
const limiter = createRateLimiter({ max: MAX_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 });

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function POST(req: Request) {
  const key = checkIngestKey(req);
  if (!key.ok) return key.reason === "misconfigured" ? fail("misconfigured", 503) : fail("unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const vue = parseVue(body);
  if (!vue) return fail("invalid", 400);

  const payload = await payloadClient();
  // Seule l'adresse du VISITEUR compte : sans l'en-tête, on aurait celle du
  // relais, commune à tout le site — la plafonner couperait toutes les vidéos.
  const { ip, trusted } = clientIp(req);
  if (ip && trusted && !limiter.hit(ip)) {
    payload.logger.warn(`[vidéos] débit dépassé pour ${maskIp(ip)} (« ${vue.videoId} »).`);
    return fail("rate_limited", 429);
  }

  await incrementVue(payload, vue);
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
