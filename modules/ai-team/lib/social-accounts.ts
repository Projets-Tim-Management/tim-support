import type { Payload } from "payload";

import { exchangeGoogleCode, googleAuthUrl, refreshGoogleTokens, revokeGoogleToken, type GoogleClient } from "@/core/lib/google-oauth";
import { decryptSecret, encryptSecret } from "@/core/lib/secrets";
import { META_DEFAULT_VERSION } from "@/modules/ads/platforms/meta";
import type { MetaAccount, SocialAccess } from "@/modules/ai-team/lib/social-sources";

/**
 * BRANCHER LES RÉSEAUX de l'agent Réseaux & vidéo (13/11/2026) :
 *
 *  - YouTube : consentement Google (lecture seule : `youtube.readonly` et
 *    `yt-analytics.readonly`) — un compte de service ne peut pas lire une
 *    chaîne, Google l'interdit. Le client OAuth est le SIEN seul
 *    (`YOUTUBE_CLIENT_*`, projet Google « TIM YouTube ») — jamais celui des
 *    agendas : chez Google, retirer une autorisation retire tout ce que le
 *    compte a accordé à l'application. Le 13/11, débrancher une chaîne branchée
 *    par l'application des agendas a coupé l'agenda du même compte.
 *  - Facebook et Instagram : un jeton d'utilisateur système du portefeuille
 *    business (sans échéance, comme pour la publicité), collé une fois ; on en
 *    tire la page, son jeton, et le compte Instagram relié.
 *
 * Les jetons sont chiffrés en base ; un seul compte par réseau.
 */

const YT_SCOPES = ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly", "openid", "email"];
export const SOCIAL_RETURN = "/admin/equipe-ia?membre=seo-reseaux";

export const youtubeClient = (): GoogleClient | null => {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

/**
 * URL de retour OAuth — à déclarer telle quelle dans le client Google. Prise sur l'adresse où l'on se trouve
 * (le support en ligne, ou le poste de dev quel que soit son port) : l'aller et le retour restent sur le même site.
 */
export const youtubeRedirectUri = (origin: string) => `${origin.replace(/\/$/, "")}/api/admin/ai-team/social/youtube/callback`;

export function youtubeAuthUrl(state: string, origin: string): string {
  const client = youtubeClient();
  if (!client) throw new Error("YOUTUBE_CLIENT_ID / _SECRET manquants");
  return googleAuthUrl({ clientId: client.clientId, redirectUri: youtubeRedirectUri(origin), scopes: YT_SCOPES, state, includeGranted: false, chooseAccount: true });
}

type Row = { id: number | string; platform: "youtube" | "meta"; label?: string | null; externalId?: string | null; igUserId?: string | null; igUsername?: string | null; accountEmail?: string | null; token?: string | null; status?: string | null; lastError?: string | null; updatedAt?: string };

async function upsert(payload: Payload, platform: Row["platform"], data: Omit<Row, "id" | "platform">) {
  const found = await payload.find({ collection: "ai-team-social-accounts", where: { platform: { equals: platform } }, limit: 1, depth: 0, overrideAccess: true });
  const doc = { platform, status: "actif", lastError: null, ...data };
  if (found.docs[0]) await payload.update({ collection: "ai-team-social-accounts", id: found.docs[0].id, data: doc as never, overrideAccess: true });
  else await payload.create({ collection: "ai-team-social-accounts", data: doc as never, overrideAccess: true });
}

/** Le retour de Google : le code contre un jeton durable, puis la chaîne qu'il ouvre. */
export async function connectYoutube(payload: Payload, code: string, origin: string): Promise<{ channel: string }> {
  const client = youtubeClient();
  if (!client) throw new Error("YOUTUBE_CLIENT_ID / _SECRET manquants");
  const tokens = await exchangeGoogleCode(client, code, youtubeRedirectUri(origin));
  // Sans jeton de rafraîchissement, la connexion mourrait dans l'heure sans rien dire.
  if (!tokens.refreshToken) throw new Error("sans_jeton_durable");
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${tokens.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as { items?: { id: string; snippet?: { title?: string } }[] };
  const ch = j.items?.[0];
  if (!res.ok || !ch) throw new Error("aucune_chaine");
  await upsert(payload, "youtube", { label: ch.snippet?.title ?? "YouTube", externalId: ch.id, accountEmail: tokens.accountEmail ?? null, token: encryptSecret(tokens.refreshToken) });
  return { channel: ch.snippet?.title ?? ch.id };
}

const graph = async <T>(path: string, params: Record<string, string>, token: string): Promise<T> => {
  const res = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || META_DEFAULT_VERSION}/${path}?${new URLSearchParams({ ...params, access_token: token })}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Meta : ${j.error?.message ?? res.statusText}`);
  return j;
};

type PageRow = { id: string; name?: string; access_token?: string; instagram_business_account?: { id: string; username?: string } };

/**
 * Le jeton collé → la page, son jeton, le compte Instagram relié. Un jeton
 * d'utilisateur (système) liste ses pages (`me/accounts`) ; un jeton de page
 * EST la page (`me`). Plusieurs pages : celle dont le nom ou l'identifiant est
 * demandé, sinon la première — dite à l'écran.
 */
export async function connectMeta(payload: Payload, rawToken: string, wanted?: string): Promise<{ page: string; instagram: string | null; pages: string[] }> {
  const token = rawToken.trim();
  if (token.length < 40) throw new Error("Ce jeton est trop court : copiez-le en entier depuis le Business Manager.");
  const fields = "id,name,access_token,instagram_business_account{id,username}";
  const list = await graph<{ data?: PageRow[] }>("me/accounts", { fields, limit: "50" }, token).catch(() => ({ data: [] as PageRow[] }));
  let pages = (list.data ?? []).filter((p) => p.access_token);
  if (!pages.length) {
    const me = await graph<PageRow>("me", { fields: "id,name,instagram_business_account{id,username}" }, token).catch(() => null);
    if (me?.id && me.name) pages = [{ ...me, access_token: token }];
  }
  if (!pages.length) throw new Error("Ce jeton n'ouvre aucune page Facebook : dans le Business Manager, assignez la page (et le compte Instagram) à l'utilisateur système, puis régénérez le jeton avec les droits de lecture des pages.");
  const w = wanted?.trim().toLowerCase();
  const page = (w && pages.find((p) => p.id === w || p.name?.toLowerCase() === w)) || pages[0];
  await upsert(payload, "meta", {
    label: page.name ?? page.id,
    externalId: page.id,
    igUserId: page.instagram_business_account?.id ?? null,
    igUsername: page.instagram_business_account?.username ?? null,
    accountEmail: null,
    token: encryptSecret(page.access_token!),
  });
  return { page: page.name ?? page.id, instagram: page.instagram_business_account?.username ?? null, pages: pages.map((p) => p.name ?? p.id) };
}

export type SocialAccountView = { platform: "youtube" | "meta"; label: string; igUsername: string | null; accountEmail: string | null; status: string; lastError: string | null; updatedAt: string | null };

async function rows(payload: Payload): Promise<Row[]> {
  const r = await payload.find({ collection: "ai-team-social-accounts", pagination: false, depth: 0, overrideAccess: true }).catch(() => null);
  return (r?.docs ?? []) as unknown as Row[];
}

/** Ce qui est branché, pour l'écran (sans les jetons). */
export async function socialAccounts(payload: Payload): Promise<SocialAccountView[]> {
  return (await rows(payload)).map((r) => ({ platform: r.platform, label: r.label ?? "", igUsername: r.igUsername ?? null, accountEmail: r.accountEmail ?? null, status: r.status ?? "actif", lastError: r.lastError ?? null, updatedAt: r.updatedAt ?? null }));
}

/** Les accès déchiffrés, pour la mesure (serveur seulement). */
export async function socialAccess(payload: Payload): Promise<SocialAccess> {
  const all = await rows(payload);
  const yt = all.find((r) => r.platform === "youtube");
  const meta = all.find((r) => r.platform === "meta");
  const ytToken = decryptSecret(yt?.token);
  const metaToken = decryptSecret(meta?.token);
  const metaAccount: MetaAccount | null = meta?.externalId && metaToken ? { pageId: meta.externalId, pageName: meta.label ?? "", pageToken: metaToken, igUserId: meta.igUserId ?? null, igUsername: meta.igUsername ?? null } : null;
  return { youtube: ytToken ? { refreshToken: ytToken } : null, meta: metaAccount };
}

/** Note l'état d'un réseau après une lecture (l'erreur s'affiche sur la fiche). */
export async function markSocial(payload: Payload, platform: Row["platform"], error: string | null) {
  const found = await payload.find({ collection: "ai-team-social-accounts", where: { platform: { equals: platform } }, limit: 1, depth: 0, overrideAccess: true }).catch(() => null);
  const doc = found?.docs[0];
  if (doc) await payload.update({ collection: "ai-team-social-accounts", id: doc.id, data: { status: error ? "erreur" : "actif", lastError: error?.slice(0, 1000) ?? null } as never, overrideAccess: true }).catch(() => null);
}

/**
 * Débrancher un réseau : la ligne et son jeton disparaissent — et, pour YouTube, l'autorisation est retirée chez
 * Google aussi, MAIS seulement si elle a été donnée au client YouTube. Un jeton de rafraîchissement ne se renouvelle
 * qu'avec le client qui l'a émis : s'il se renouvelle avec le nôtre, le retrait ne touche que YouTube ; sinon (jeton
 * d'une autre application, celle des agendas par exemple), on efface la ligne sans rien retirer chez Google.
 */
export async function disconnectSocial(payload: Payload, platform: Row["platform"]) {
  if (platform === "youtube") {
    const token = decryptSecret((await rows(payload)).find((r) => r.platform === "youtube")?.token);
    const client = youtubeClient();
    if (token && client && (await refreshGoogleTokens(client, token).then(() => true, () => false))) await revokeGoogleToken(token);
  }
  await payload.delete({ collection: "ai-team-social-accounts", where: { platform: { equals: platform } }, overrideAccess: true });
}
