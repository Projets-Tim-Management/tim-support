import {
  exchangeGoogleCode,
  googleAuthUrl,
  refreshGoogleTokens,
  type GoogleClient,
  type GoogleTokens,
} from "@/core/lib/google-oauth";

/**
 * Connexion d'une boîte Gmail — la partie consentement.
 *
 * Un client OAuth DISTINCT de celui des agendas (`GOOGLE_MAIL_*` et non
 * `GOOGLE_*`), pour deux raisons qui n'ont rien de cosmétique :
 *
 *  - le consentement Google est lié au `client_id` : séparés, quelqu'un peut
 *    retirer l'accès à sa boîte sans perdre son agenda ; mélangés, révoquer
 *    l'un casse l'autre ;
 *  - lire une boîte est un scope RESTREINT. L'écran de consentement du projet
 *    est de type « Interne », ce qui exempte de l'audit de sécurité annuel —
 *    tant qu'il reste interne. Isoler le client rend cette dépendance visible
 *    au lieu de la laisser dans un coin de la console.
 *
 * ⚠️ `gmail.readonly` est en LECTURE SEULE, et doit le rester. Rien dans ce
 * logiciel n'a de raison d'écrire, d'archiver ou de supprimer dans la boîte de
 * quelqu'un.
 */

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email"];

export const mailboxClient = (): GoogleClient | null => {
  const clientId = process.env.GOOGLE_MAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export const mailboxConfigured = (): boolean => mailboxClient() !== null;

/** URL de retour OAuth — doit correspondre EXACTEMENT à celle déclarée chez Google. */
export const mailboxRedirectUri = (): string => {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
  return `${base.replace(/\/$/, "")}/api/mailbox/callback`;
};

export function mailboxAuthUrl(state: string): string {
  const client = mailboxClient();
  if (!client) throw new Error("GOOGLE_MAIL_CLIENT_ID / _SECRET manquants");
  return googleAuthUrl({
    clientId: client.clientId,
    redirectUri: mailboxRedirectUri(),
    scopes: SCOPES,
    state,
  });
}

export async function exchangeMailboxCode(code: string): Promise<GoogleTokens> {
  const client = mailboxClient();
  if (!client) throw new Error("GOOGLE_MAIL_CLIENT_ID / _SECRET manquants");
  return exchangeGoogleCode(client, code, mailboxRedirectUri());
}

/**
 * Jeton d'accès valide, renouvelé si besoin.
 *
 * Renouvelé une minute AVANT l'échéance : un jeton qui expire pendant une
 * synchronisation de plusieurs minutes ferait échouer la moitié des appels,
 * avec une erreur d'authentification incompréhensible dans le journal.
 */
export async function freshAccessToken(conn: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
}): Promise<GoogleTokens | null> {
  const client = mailboxClient();
  if (!client) return null;

  const expires = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;
  if (conn.accessToken && expires > Date.now() + 60_000) {
    return { accessToken: conn.accessToken, expiresAt: expires };
  }
  if (!conn.refreshToken) return null;
  return refreshGoogleTokens(client, conn.refreshToken);
}
