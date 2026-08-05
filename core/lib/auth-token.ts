import { createHash } from "crypto";

import { SignJWT } from "jose";

/**
 * Utilitaires d'impersonation (« voir comme un compte »).
 *
 * Un admin peut basculer temporairement sur la session d'un autre compte pour
 * voir EXACTEMENT sa vue. On signe un JWT compatible Payload pour la cible ;
 * Payload ré-authentifie ensuite par `id` + `collection` (re-lecture en base),
 * donc un token minimal signé avec le secret suffit.
 */

/** Cookie d'auth Payload (préfixe par défaut « payload »). */
export const PAYLOAD_TOKEN = "payload-token";
/** httpOnly : token admin d'origine, conservé pour pouvoir ressortir. */
export const IMPERSONATOR = "tim_impersonator";
/** Lisible côté client : e-mail de la cible, pour afficher le bandeau. */
export const IMPERSONATING = "tim_impersonating";

/**
 * Signe un JWT compatible Payload pour un utilisateur donné.
 * Payload v3 utilise des SESSIONS : le token doit porter un `sid` correspondant
 * à une ligne `users_sessions` valide (créée par l'appelant).
 */
export async function signUserToken(
  user: { id: number | string; email: string },
  sid: string,
): Promise<string> {
  return new SignJWT({ id: user.id, collection: "users", email: user.email, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(jwtSecret());
}

/**
 * Clé de signature des JWT Payload : Payload dérive la clé de `PAYLOAD_SECRET`
 * via `sha256(secret)` tronqué à 32 caractères hex (et NON le secret brut).
 */
function jwtSecret(): Uint8Array {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) throw new Error("PAYLOAD_SECRET manquant");
  const derived = createHash("sha256").update(secret).digest("hex").slice(0, 32);
  return new TextEncoder().encode(derived);
}
