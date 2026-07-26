import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

import { JWT_SECRET, SESSION_COOKIE, SESSION_MAX_AGE } from "@/core/lib/jwt-secret";

/**
 * Middleware d'authentification.
 *
 * Flux :
 *  1. L'app (app.tim-management.co) redirige vers :
 *     https://support.tim-management.co?token=<JWT signé avec JWT_SECRET>
 *     Payload du JWT : { sub: userId, email, name, exp }
 *
 *  2. Le middleware vérifie le token, crée un cookie de session, retire le
 *     paramètre de l'URL et redirige proprement.
 *
 *  3. Les visites suivantes utilisent le cookie de session.
 *
 *  Note : Le site est actuellement PUBLIC — les pages sont accessibles sans
 *  authentification. Décommentez le bloc "Accès protégé" ci-dessous pour
 *  restreindre l'accès aux utilisateurs connectés uniquement.
 */
export async function proxy(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // ── 1. Réception du token depuis l'app ────────────────────────────────────
  const incomingToken = searchParams.get("token");
  if (incomingToken) {
    try {
      const { payload } = await jwtVerify(incomingToken, JWT_SECRET);

      // Créer un cookie de session signé
      const sessionToken = await new SignJWT({
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_MAX_AGE}s`)
        .sign(JWT_SECRET);

      // Redirection propre (retire ?token= de l'URL)
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.searchParams.delete("token");

      const response = NextResponse.redirect(cleanUrl);
      response.cookies.set(SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
        path: "/",
      });
      return response;
    } catch {
      // Token invalide — on laisse passer sans session
    }
  }

  // ── 2. Accès protégé (décommentez pour restreindre l'accès) ───────────────
  // const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  // if (!sessionCookie) {
  //   const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tim-management.co";
  //   return NextResponse.redirect(new URL(appUrl));
  // }
  // try {
  //   await jwtVerify(sessionCookie, JWT_SECRET);
  // } catch {
  //   const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tim-management.co";
  //   return NextResponse.redirect(new URL(appUrl));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Toutes les routes sauf les assets statiques et les API Next.js
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
