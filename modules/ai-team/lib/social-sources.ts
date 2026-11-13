import type { Payload } from "payload";

import { reportApiFailure, reportApiSuccess } from "@/core/lib/api-health";
import { refreshGoogleTokens } from "@/core/lib/google-oauth";
import { CLIENT_STATUSES } from "@/modules/partner/lib/clientStatus";
import { META_DEFAULT_VERSION } from "@/modules/ads/platforms/meta";
import { youtubeClient } from "@/modules/ai-team/lib/social-accounts";

/**
 * CE QUE DISENT LES RÉSEAUX de TIM (agent Réseaux & vidéo de l'équipe SEO/GEO,
 * 13/11/2026) — lu chez eux, compte par compte, sur 28 jours :
 *
 *  - YouTube (API Analytics + Data, jeton OAuth de la chaîne) : les vidéos,
 *    vues, durée regardée, rétention, likes, commentaires, partages, abonnés
 *    gagnés ; d'où viennent les vues ; les mots tapés dans YouTube ; les
 *    commentateurs ;
 *  - Facebook et Instagram (API Graph, jeton d'utilisateur système de la
 *    page) : chaque publication, ses vues, réactions, commentaires, partages,
 *    enregistrements ; les commentateurs.
 *
 * Personne ne sait QUI a regardé : aucun réseau ne le donne. Ceux qui
 * commentent, si — et on les rapproche du CRM (`matchPeople`) : un prospect qui
 * commente est un signal d'achat.
 *
 * Les lectures pures (`ytRows`, `readFbPost`, `readIgMedia`, `matchPeople`,
 * `normName`) sont testées ; le reste appelle les réseaux.
 */

export type Network = "youtube" | "facebook" | "instagram" | "linkedin";
export const NETWORK_LABEL: Record<Network, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn" };

export type SocialPost = {
  network: Network;
  id: string;
  title: string;
  url: string;
  at: string | null;
  format: string;
  views: number | null;
  reach: number | null;
  likes: number;
  comments: number;
  shares: number | null;
  saves: number | null;
  /** YouTube : minutes regardées, % moyen de la vidéo vu, abonnés gagnés. */
  watchMinutes?: number | null;
  avgViewPct?: number | null;
  subscribers?: number | null;
};
export type CrmMatch = { contact: string; company: string; status: string | null; clientId: string | number };
export type SocialPerson = { network: Network; name: string; text: string; url: string; at: string | null; match: CrmMatch | null };
export type NetworkSummary = { network: Network; account: string; followers: number | null; posts: number; views: number | null; previousViews: number | null; interactions: number };
export type SocialMeasure = {
  from: string;
  to: string;
  networks: NetworkSummary[];
  posts: SocialPost[];
  people: SocialPerson[];
  youtubeSources: { source: string; views: number; minutes: number }[];
  youtubeSearches: { term: string; views: number }[];
  /** Ce qui n'a pas pu être lu, en une phrase par réseau. */
  errors: string[];
};

const WINDOW_DAYS = 28;
const MAX_POSTS = 20;
const MAX_PEOPLE = 60;
const TIMEOUT = 20_000;
const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const int = (v: unknown) => num(v) ?? 0;
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/* ─── Petits outils ───────────────────────────────────────────────────── */

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

async function getJson<T>(url: string, source: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string };
  if (!res.ok) {
    const msg = typeof body.error === "string" ? body.error : (body.error?.message ?? res.statusText);
    throw new Error(`${source} (${res.status}) : ${msg}`);
  }
  return body as T;
}

/* ─── Le CRM : qui, parmi ceux qui réagissent, est déjà connu ─────────── */

/** Un nom comparable : sans accents, sans ponctuation, en minuscules. Pure. */
export const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type CrmEntry = { first: string; last: string; company: string; status: string | null; clientId: string | number };

/**
 * Rapproche chaque personne d'un contact du CRM — « Prénom Nom » ou « Nom
 * Prénom » à l'identique, ou le nom exact de l'entreprise (un compte de société
 * qui commente). Prudent : un homonyme vaut mieux que rien, mais un prénom seul
 * ne suffit jamais. Pure (testée).
 */
export function matchPeople(people: Omit<SocialPerson, "match">[], crm: CrmEntry[]): SocialPerson[] {
  const byName = new Map<string, CrmEntry>();
  const byCompany = new Map<string, CrmEntry>();
  for (const c of crm) {
    const f = normName(c.first);
    const l = normName(c.last);
    if (f && l) {
      byName.set(`${f} ${l}`, c);
      byName.set(`${l} ${f}`, c);
    }
    const co = normName(c.company);
    if (co.length >= 4 && !byCompany.has(co)) byCompany.set(co, c);
  }
  return people.map((p) => {
    const n = normName(p.name.replace(/^@/, ""));
    const hit = byName.get(n) ?? byCompany.get(n);
    return { ...p, match: hit ? { contact: [hit.first, hit.last].filter(Boolean).join(" ") || hit.company, company: hit.company, status: hit.status, clientId: hit.clientId } : null };
  });
}

const STATUS_LABEL: Record<string, string> = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.value, s.label]));

/** Les contacts du CRM (prénom, nom, entreprise, statut) — et les entreprises sans contact. */
export async function loadCrm(payload: Payload): Promise<CrmEntry[]> {
  const [contacts, clients] = await Promise.all([
    payload.find({ collection: "client-contacts", pagination: false, depth: 0, overrideAccess: true, select: { firstName: true, lastName: true, client: true } as never }).catch(() => null),
    payload.find({ collection: "partner-clients", pagination: false, depth: 0, draft: true, overrideAccess: true, select: { companyName: true, clientStatus: true } as never }).catch(() => null),
  ]);
  const company = new Map<string, { name: string; status: string | null }>();
  for (const c of (clients?.docs ?? []) as unknown as { id: string | number; companyName?: string; clientStatus?: string }[]) {
    company.set(String(c.id), { name: c.companyName ?? "", status: c.clientStatus ? (STATUS_LABEL[c.clientStatus] ?? c.clientStatus) : null });
  }
  const out: CrmEntry[] = [];
  for (const c of (contacts?.docs ?? []) as unknown as { firstName?: string; lastName?: string; client?: string | number | { id: string | number } }[]) {
    const id = typeof c.client === "object" && c.client ? c.client.id : c.client;
    const co = id != null ? company.get(String(id)) : undefined;
    if (id == null || !co) continue;
    out.push({ first: c.firstName ?? "", last: c.lastName ?? "", company: co.name, status: co.status, clientId: id });
  }
  for (const [id, co] of company) out.push({ first: "", last: "", company: co.name, status: co.status, clientId: id });
  return out;
}

/* ─── YouTube ─────────────────────────────────────────────────────────── */

type YtReport = { columnHeaders?: { name: string }[]; rows?: unknown[][] };

/** Les lignes d'un rapport YouTube Analytics, en objets nommés par colonne. Pure. */
export const ytRows = (r: YtReport | null | undefined): Record<string, string | number>[] =>
  (r?.rows ?? []).map((row) => Object.fromEntries((r?.columnHeaders ?? []).map((h, i) => [h.name, row[i] as string | number])));

/** La durée ISO 8601 d'une vidéo (PT1H2M3S) en secondes ; null si illisible. Pure. Un Short dure 3 minutes au plus. */
export function durationSec(iso?: string | null): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m || !iso || iso === "P" || iso === "PT") return null;
  return Number(m[1] ?? 0) * 86_400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

const YT_SOURCE: Record<string, string> = {
  YT_SEARCH: "Recherche YouTube",
  RELATED_VIDEO: "Vidéos suggérées",
  SUBSCRIBER: "Abonnés",
  EXT_URL: "Sites et applis externes",
  NO_LINK_OTHER: "Accès direct ou inconnu",
  PLAYLIST: "Playlists",
  YT_CHANNEL: "Page de la chaîne",
  YT_OTHER_PAGE: "Autres pages YouTube",
  NOTIFICATION: "Notifications",
  SHORTS: "Fil des Shorts",
  END_SCREEN: "Écrans de fin",
  ANNOTATION: "Fiches et annotations",
  ADVERTISING: "Publicité",
  HASHTAGS: "Hashtags",
  SOUND_PAGE: "Pages de son",
  LIVE_REDIRECT: "Redirections de direct",
  CAMPAIGN_CARD: "Cartes de campagne",
};

async function youtubeAccess(refreshToken: string) {
  const client = youtubeClient();
  if (!client) throw new Error("YouTube : l'application OAuth Google n'est pas configurée.");
  return (await refreshGoogleTokens(client, refreshToken)).accessToken;
}

async function readYoutube(refreshToken: string, now: Date): Promise<{ summary: NetworkSummary; posts: SocialPost[]; people: Omit<SocialPerson, "match">[]; sources: SocialMeasure["youtubeSources"]; searches: SocialMeasure["youtubeSearches"] }> {
  const token = await youtubeAccess(refreshToken);
  const auth = { authorization: `Bearer ${token}` };
  const end = new Date(now.getTime() - 2 * 86_400_000); // les deux derniers jours ne sont pas complets
  const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * 86_400_000);
  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (WINDOW_DAYS - 1) * 86_400_000);
  const report = (params: Record<string, string>) =>
    getJson<YtReport>(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ids: "channel==MINE", startDate: ymd(start), endDate: ymd(end), ...params })}`, "YouTube Analytics", auth);
  const metrics = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained";

  const channel = await getJson<{ items?: { id: string; snippet?: { title?: string }; statistics?: { subscriberCount?: string } }[] }>("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", "YouTube", auth);
  const ch = channel.items?.[0];
  if (!ch) throw new Error("YouTube : aucune chaîne pour ce compte.");

  const [videos, totals, previous, sources, searches, threads] = await Promise.all([
    report({ metrics, dimensions: "video", sort: "-views", maxResults: String(MAX_POSTS) }),
    report({ metrics }),
    getJson<YtReport>(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ids: "channel==MINE", startDate: ymd(prevStart), endDate: ymd(prevEnd), metrics: "views" })}`, "YouTube Analytics", auth).catch(() => null),
    report({ metrics: "views,estimatedMinutesWatched", dimensions: "insightTrafficSourceType", sort: "-views" }).catch(() => null),
    report({ metrics: "views", dimensions: "insightTrafficSourceDetail", filters: "insightTrafficSourceType==YT_SEARCH", sort: "-views", maxResults: "25" }).catch(() => null),
    getJson<{ items?: { snippet?: { videoId?: string; topLevelComment?: { id?: string; snippet?: { authorDisplayName?: string; textOriginal?: string; textDisplay?: string; publishedAt?: string } } } }[] }>(
      `https://www.googleapis.com/youtube/v3/commentThreads?${new URLSearchParams({ part: "snippet", allThreadsRelatedToChannelId: ch.id, maxResults: "50", order: "time" })}`,
      "YouTube (commentaires)",
      auth,
    ).catch(() => null),
  ]);

  const rows = ytRows(videos);
  const ids = rows.map((r) => String(r.video)).filter(Boolean);
  const meta = ids.length
    ? await getJson<{ items?: { id: string; snippet?: { title?: string; publishedAt?: string }; contentDetails?: { duration?: string } }[] }>(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.join(",")}`, "YouTube", auth).catch(() => null)
    : null;
  const byId = new Map((meta?.items ?? []).map((v) => [v.id, v]));
  const posts: SocialPost[] = rows.map((r) => {
    const v = byId.get(String(r.video));
    const secs = durationSec(v?.contentDetails?.duration);
    const short = secs != null && secs <= 180;
    return {
      network: "youtube",
      id: String(r.video),
      title: clip(v?.snippet?.title ?? r.video, 160),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(String(r.video))}`,
      at: v?.snippet?.publishedAt ?? null,
      format: short ? "Short" : "Vidéo",
      views: int(r.views),
      reach: null,
      likes: int(r.likes),
      comments: int(r.comments),
      shares: int(r.shares),
      saves: null,
      watchMinutes: int(r.estimatedMinutesWatched),
      avgViewPct: num(r.averageViewPercentage) == null ? null : Math.round(Number(r.averageViewPercentage)),
      subscribers: int(r.subscribersGained),
    };
  });
  const t = ytRows(totals)[0] ?? {};
  const since = start.getTime();
  const people = (threads?.items ?? [])
    .map((x) => x.snippet)
    .filter((s) => s?.topLevelComment?.snippet?.publishedAt && Date.parse(s.topLevelComment.snippet.publishedAt) >= since)
    .map((s) => ({
      network: "youtube" as const,
      name: clip(s!.topLevelComment!.snippet!.authorDisplayName, 80),
      text: clip(s!.topLevelComment!.snippet!.textOriginal ?? s!.topLevelComment!.snippet!.textDisplay, 280),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(s!.videoId ?? "")}&lc=${encodeURIComponent(s!.topLevelComment!.id ?? "")}`,
      at: s!.topLevelComment!.snippet!.publishedAt ?? null,
    }))
    .filter((p) => p.name);
  return {
    summary: {
      network: "youtube",
      account: ch.snippet?.title ?? "YouTube",
      followers: num(ch.statistics?.subscriberCount),
      posts: posts.length,
      views: num(t.views),
      previousViews: num(ytRows(previous)[0]?.views),
      interactions: int(t.likes) + int(t.comments) + int(t.shares),
    },
    posts,
    people,
    sources: ytRows(sources).map((r) => ({ source: YT_SOURCE[String(r.insightTrafficSourceType)] ?? String(r.insightTrafficSourceType), views: int(r.views), minutes: int(r.estimatedMinutesWatched) })),
    searches: ytRows(searches).map((r) => ({ term: clip(r.insightTrafficSourceDetail, 120), views: int(r.views) })),
  };
}

/* ─── Facebook et Instagram ───────────────────────────────────────────── */

const graphBase = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || META_DEFAULT_VERSION}`;
const graph = <T>(path: string, params: Record<string, string>, token: string, source: string) =>
  getJson<T>(`${graphBase()}/${path}?${new URLSearchParams({ ...params, access_token: token })}`, source);

type Insight = { name: string; values?: { value?: unknown }[] };
const insight = (data: Insight[] | undefined, name: string): number | null => num(data?.find((d) => d.name === name)?.values?.[0]?.value);

type FbPost = { id: string; message?: string; created_time?: string; permalink_url?: string; status_type?: string; shares?: { count?: number }; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } };

/** Une publication Facebook et ses statistiques (quand Meta les donne). Pure. */
export const readFbPost = (p: FbPost, insights: Insight[] | null): SocialPost => ({
  network: "facebook",
  id: p.id,
  title: clip(p.message || "(publication sans texte)", 160),
  url: p.permalink_url ?? `https://www.facebook.com/${p.id}`,
  at: p.created_time ?? null,
  format: p.status_type === "added_video" ? "Vidéo" : p.status_type === "added_photos" ? "Photo" : p.status_type === "shared_story" ? "Lien" : "Publication",
  views: insight(insights ?? undefined, "post_media_view"),
  reach: insight(insights ?? undefined, "post_total_media_view_unique"),
  likes: int(p.reactions?.summary?.total_count),
  comments: int(p.comments?.summary?.total_count),
  shares: int(p.shares?.count),
  saves: null,
});

type IgMedia = { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number };

/** Une publication Instagram et ses statistiques. Pure. */
export const readIgMedia = (m: IgMedia, insights: Insight[] | null): SocialPost => ({
  network: "instagram",
  id: m.id,
  title: clip(m.caption || "(sans légende)", 160),
  url: m.permalink ?? "",
  at: m.timestamp ?? null,
  format: m.media_product_type === "REELS" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carrousel" : m.media_type === "VIDEO" ? "Vidéo" : "Photo",
  views: insight(insights ?? undefined, "views"),
  reach: insight(insights ?? undefined, "reach"),
  likes: int(m.like_count),
  comments: int(m.comments_count),
  shares: insight(insights ?? undefined, "shares"),
  saves: insight(insights ?? undefined, "saved"),
});

export type MetaAccount = { pageId: string; pageName: string; pageToken: string; igUserId: string | null; igUsername: string | null };

async function readFacebook(acc: MetaAccount, now: Date) {
  const since = Math.floor((now.getTime() - WINDOW_DAYS * 86_400_000) / 1000);
  const [page, feed] = await Promise.all([
    graph<{ followers_count?: number; fan_count?: number }>(acc.pageId, { fields: "followers_count,fan_count" }, acc.pageToken, "Facebook").catch(() => null),
    graph<{ data?: FbPost[] }>(
      `${acc.pageId}/posts`,
      { fields: "id,message,created_time,permalink_url,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(true).limit(0)", since: String(since), limit: String(MAX_POSTS) },
      acc.pageToken,
      "Facebook (publications)",
    ),
  ]);
  const rows = feed.data ?? [];
  const detail = await mapLimit(rows, 4, async (p) => {
    const [ins, comments] = await Promise.all([
      graph<{ data?: Insight[] }>(`${p.id}/insights`, { metric: "post_media_view,post_total_media_view_unique" }, acc.pageToken, "Facebook (statistiques)").catch(() => null),
      int(p.comments?.summary?.total_count) > 0
        ? graph<{ data?: { from?: { name?: string }; message?: string; created_time?: string; permalink_url?: string }[] }>(`${p.id}/comments`, { fields: "from{name},message,created_time,permalink_url", filter: "toplevel", limit: "25" }, acc.pageToken, "Facebook (commentaires)").catch(() => null)
        : null,
    ]);
    return { post: readFbPost(p, ins?.data ?? null), comments: comments?.data ?? [] };
  });
  const posts = detail.map((d) => d.post);
  const people = detail.flatMap((d) =>
    d.comments
      .filter((c) => c.from?.name && c.from.name !== acc.pageName)
      .map((c) => ({ network: "facebook" as const, name: clip(c.from!.name, 80), text: clip(c.message, 280), url: c.permalink_url ?? d.post.url, at: c.created_time ?? null })),
  );
  const views = posts.some((p) => p.views != null) ? posts.reduce((s, p) => s + (p.views ?? 0), 0) : null;
  return {
    summary: { network: "facebook" as const, account: acc.pageName, followers: num(page?.followers_count ?? page?.fan_count), posts: posts.length, views, previousViews: null, interactions: posts.reduce((s, p) => s + p.likes + p.comments + (p.shares ?? 0), 0) },
    posts,
    people,
  };
}

async function readInstagram(acc: MetaAccount, now: Date) {
  if (!acc.igUserId) throw new Error("Instagram : aucun compte professionnel relié à la page Facebook.");
  const since = now.getTime() - WINDOW_DAYS * 86_400_000;
  const [user, media] = await Promise.all([
    graph<{ followers_count?: number; username?: string }>(acc.igUserId, { fields: "followers_count,username" }, acc.pageToken, "Instagram").catch(() => null),
    graph<{ data?: IgMedia[] }>(`${acc.igUserId}/media`, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: String(MAX_POSTS) }, acc.pageToken, "Instagram (publications)"),
  ]);
  const rows = (media.data ?? []).filter((m) => !m.timestamp || Date.parse(m.timestamp) >= since);
  const detail = await mapLimit(rows, 4, async (m) => {
    const [ins, comments] = await Promise.all([
      graph<{ data?: Insight[] }>(`${m.id}/insights`, { metric: "views,reach,saved,shares,total_interactions" }, acc.pageToken, "Instagram (statistiques)").catch(() =>
        graph<{ data?: Insight[] }>(`${m.id}/insights`, { metric: "reach,saved" }, acc.pageToken, "Instagram (statistiques)").catch(() => null),
      ),
      int(m.comments_count) > 0
        ? graph<{ data?: { username?: string; text?: string; timestamp?: string }[] }>(`${m.id}/comments`, { fields: "username,text,timestamp", limit: "25" }, acc.pageToken, "Instagram (commentaires)").catch(() => null)
        : null,
    ]);
    return { post: readIgMedia(m, ins?.data ?? null), comments: comments?.data ?? [] };
  });
  const posts = detail.map((d) => d.post);
  const people = detail.flatMap((d) =>
    d.comments
      .filter((c) => c.username && c.username !== (user?.username ?? acc.igUsername))
      .map((c) => ({ network: "instagram" as const, name: `@${clip(c.username, 60)}`, text: clip(c.text, 280), url: d.post.url, at: c.timestamp ?? null })),
  );
  const views = posts.some((p) => p.views != null) ? posts.reduce((s, p) => s + (p.views ?? 0), 0) : null;
  return {
    summary: { network: "instagram" as const, account: `@${user?.username ?? acc.igUsername ?? "instagram"}`, followers: num(user?.followers_count), posts: posts.length, views, previousViews: null, interactions: posts.reduce((s, p) => s + p.likes + p.comments + (p.shares ?? 0) + (p.saves ?? 0), 0) },
    posts,
    people,
  };
}

/* ─── La mesure complète ──────────────────────────────────────────────── */

export type SocialAccess = { youtube: { refreshToken: string } | null; meta: MetaAccount | null };

/** Lit chaque réseau branché ; un réseau en panne n'empêche pas les autres (son erreur est notée). */
export async function measureSocial(payload: Payload, access: SocialAccess, now = new Date()): Promise<SocialMeasure> {
  const errors: string[] = [];
  const guard = async <T>(label: string, run: () => Promise<T>): Promise<T | null> => {
    const provider = label === "YouTube" ? "youtube" : "meta-pages";
    try {
      const out = await run();
      void reportApiSuccess(provider, payload);
      return out;
    } catch (e) {
      errors.push(`${label} : ${(e as Error).message}`.slice(0, 300));
      void reportApiFailure(provider, e, payload);
      return null;
    }
  };
  const [yt, fb, ig, crm] = await Promise.all([
    access.youtube ? guard("YouTube", () => readYoutube(access.youtube!.refreshToken, now)) : null,
    access.meta ? guard("Facebook", () => readFacebook(access.meta!, now)) : null,
    access.meta?.igUserId ? guard("Instagram", () => readInstagram(access.meta!, now)) : null,
    loadCrm(payload).catch(() => [] as CrmEntry[]),
  ]);
  const parts = [yt, fb, ig].filter((x): x is NonNullable<typeof x> => !!x);
  const people = matchPeople(
    parts.flatMap((p) => p.people),
    crm,
  )
    .sort((a, b) => Number(!!b.match) - Number(!!a.match) || Date.parse(b.at ?? "0") - Date.parse(a.at ?? "0"))
    .slice(0, MAX_PEOPLE);
  return {
    from: new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString(),
    to: now.toISOString(),
    networks: parts.map((p) => p.summary),
    posts: parts.flatMap((p) => p.posts),
    people,
    youtubeSources: yt?.sources ?? [],
    youtubeSearches: yt?.searches ?? [],
    errors,
  };
}
