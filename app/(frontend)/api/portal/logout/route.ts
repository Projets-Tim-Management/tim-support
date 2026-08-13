import { NextResponse } from "next/server";

import { PORTAL_COOKIE, cookieOptions } from "@/modules/marketing/lib/portal-auth";

/** POST /api/portal/logout — ferme la session de l'espace client. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Mêmes attributs qu'à la pose, sinon le navigateur garde l'ancien cookie.
  res.cookies.set(PORTAL_COOKIE, "", cookieOptions(0));
  return res;
}
