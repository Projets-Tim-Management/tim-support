import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";
import { signState } from "@/core/lib/secrets";
import { ACCOUNTS_LIST, metaAuthUrl, metaRedirectUri } from "@/modules/ads/lib/meta-oauth";
import { getPlatform, isMetaMock } from "@/modules/ads/platforms";

/**
 * GET /api/admin/ads/meta/connect → écran de consentement Meta.
 *
 * Le `state` signé (10 min) porte l'identité de l'admin qui lance la connexion :
 * au retour, un autre compte ne peut pas récupérer le jeton.
 *
 * En données simulées, pas d'écran Meta : on saute directement au retour, pour
 * que tout le reste du parcours (choix, enregistrement) soit le vrai.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const state = signState({ uid: String(user.id), kind: "ads-meta" });
  if (isMetaMock()) {
    const back = new URL(metaRedirectUri());
    back.searchParams.set("code", "simule");
    back.searchParams.set("state", state);
    return NextResponse.redirect(back);
  }
  try {
    getPlatform("meta"); // lève, en disant quoi, si l'app n'est pas configurée
  } catch (e) {
    const to = new URL(ACCOUNTS_LIST, req.url);
    to.searchParams.set("connexion", "erreur");
    to.searchParams.set("detail", (e as Error).message);
    return NextResponse.redirect(to);
  }
  return NextResponse.redirect(metaAuthUrl(state));
}
