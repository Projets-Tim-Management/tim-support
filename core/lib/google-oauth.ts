/**
 * OAuth Google — la partie qui ne dépend d'aucun produit.
 *
 * Écrite ici, et pas dans le module des agendas où elle est née, parce qu'il y
 * a désormais DEUX consentements distincts : l'agenda d'un partenaire, et la
 * boîte mail d'un commercial. Ils ne partagent ni leurs scopes, ni leur client,
 * ni leur écran — mais la mécanique de jetons est la même, et deux copies de
 * `access_type=offline` finiraient par diverger sur le détail qui compte.
 *
 * Un client OAuth par usage, volontairement : le consentement Google est lié au
 * `client_id`. Séparés, quelqu'un peut retirer l'accès à sa boîte sans perdre
 * son agenda. Mélangés, révoquer l'un casse l'autre.
 */

export type GoogleTokens = {
  accessToken: string;
  /** Absent lors d'un rafraîchissement : Google ne le renvoie qu'une fois. */
  refreshToken?: string;
  /** Expiration de l'access token, en ms epoch. */
  expiresAt: number;
  /** Compte connecté, lu dans l'id_token. */
  accountEmail?: string;
};

export type GoogleClient = { clientId: string; clientSecret: string };

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

/**
 * POST en `application/x-www-form-urlencoded`, avec un délai.
 *
 * `fetch` n'expire pas tout seul : un échange de jetons resté sans réponse
 * suspendrait l'opération qui l'a déclenché sans jamais échouer. Dix secondes
 * suffisent très largement pour un échange de jetons.
 */
export async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = body.error_description ?? body.error ?? res.statusText;
    throw new Error(`OAuth (${res.status}) : ${detail}`);
  }
  return body;
}

/** L'adresse du compte connecté, lue dans l'id_token (déjà signé par Google). */
export const emailFromIdToken = (idToken?: unknown): string | undefined => {
  if (typeof idToken !== "string") return undefined;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return typeof payload?.email === "string" ? payload.email : undefined;
  } catch {
    return undefined;
  }
};

export const toTokens = (body: Record<string, unknown>): GoogleTokens => ({
  accessToken: String(body.access_token ?? ""),
  refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
  expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
  accountEmail: emailFromIdToken(body.id_token),
});

/**
 * URL vers laquelle envoyer la personne pour qu'elle autorise l'accès.
 *
 * `access_type=offline` et `prompt=consent` ne sont pas décoratifs : sans eux,
 * Google ne renvoie PAS de refresh token et la connexion meurt au bout d'une
 * heure — sans erreur, simplement en cessant de fonctionner le lendemain.
 */
export function googleAuthUrl(args: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string {
  return `${AUTH}?${new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: args.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: args.state,
  }).toString()}`;
}

/** Échange le code d'autorisation contre des jetons. */
export async function exchangeGoogleCode(
  client: GoogleClient,
  code: string,
  redirectUri: string,
): Promise<GoogleTokens> {
  return toTokens(
    await postForm(TOKEN, {
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
}

/** Renouvelle l'access token. Le refresh token, lui, n'est pas renvoyé. */
export async function refreshGoogleTokens(
  client: GoogleClient,
  refreshToken: string,
): Promise<GoogleTokens> {
  return toTokens(
    await postForm(TOKEN, {
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "refresh_token",
    }),
  );
}
