import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { signState } from "@/core/lib/secrets";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { youtubeAuthUrl, youtubeClient } from "@/modules/ai-team/lib/social-accounts";

/** GET → l'écran de consentement Google pour la chaîne YouTube (lecture seule). Réservé à la direction. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  if (!youtubeClient()) return NextResponse.json({ error: "Application OAuth YouTube absente (YOUTUBE_CLIENT_ID / _SECRET)." }, { status: 501 });
  // State signé et daté (10 minutes) : il porte l'identité de la demande jusqu'au retour.
  return NextResponse.redirect(youtubeAuthUrl(signState({ userId: auth.user.id, for: "youtube" }), new URL(req.url).origin));
}
