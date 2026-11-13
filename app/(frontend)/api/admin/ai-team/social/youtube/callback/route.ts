import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { readState } from "@/core/lib/secrets";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { connectYoutube, SOCIAL_RETURN } from "@/modules/ai-team/lib/social-accounts";

/** Retour de Google : le code contre un jeton durable, puis la chaîne. On revient sur la fiche de Cléo avec le résultat. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (v: string) => NextResponse.redirect(`${url.origin}${SOCIAL_RETURN}&youtube=${encodeURIComponent(v)}`);
  if (url.searchParams.get("error")) return back("annule");

  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const code = url.searchParams.get("code");
  const state = readState<{ userId?: string | number; for?: string }>(url.searchParams.get("state"));
  // Le retour doit appartenir à la personne qui a lancé la connexion.
  if (!code || state?.for !== "youtube" || String(state.userId) !== String(auth.user.id)) return back("etat_invalide");

  try {
    await connectYoutube(auth.payload, code, url.origin);
    return back("connecte");
  } catch (e) {
    const m = (e as Error).message;
    auth.payload.logger.error(`[équipe IA] connexion YouTube : ${m}`);
    return back(m === "sans_jeton_durable" || m === "aucune_chaine" ? m : "echec");
  }
}
