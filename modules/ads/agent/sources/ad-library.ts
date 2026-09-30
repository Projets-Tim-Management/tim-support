import { META_DEFAULT_VERSION } from "@/modules/ads/platforms/meta";

/**
 * La bibliothèque publicitaire Meta (API `ads_archive`), pour les pubs des
 * concurrents (plan Publicité, §9 quater, vérifié le 29/09/2026).
 *
 * Pour la France (UE, DSA), l'API renvoie aussi les pubs commerciales : textes,
 * titres, dates de diffusion, plateformes, couverture dans l'UE. PAS les
 * dépenses ni les impressions, ni l'image (seulement un lien d'aperçu) : on
 * voit ce que les concurrents disent, et la DURÉE de diffusion sert d'indice —
 * une pub qui tourne depuis des mois rapporte probablement.
 *
 * Jeton : `META_AD_LIBRARY_TOKEN` (vérification d'identité de Charlie, valable
 * 60 jours, renouvelé à la main — décision 1 du 29/09/2026). Tant que l'accès
 * n'est pas ouvert : `ADS_AD_LIBRARY_MOCK=1` renvoie des pubs simulées, marquées.
 */

export const AD_LIBRARY_FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "publisher_platforms",
  "eu_total_reach",
];

/** Pubs lues au plus par requête : de quoi voir les angles d'un concurrent, sans noyer le stratège. */
export const MAX_ADS = 25;

export type LibraryAd = {
  id: string;
  pageId: string;
  pageName: string;
  texts: string[];
  titles: string[];
  descriptions: string[];
  start: string | null;
  stop: string | null;
  /** Jours de diffusion (jusqu'à aujourd'hui si elle tourne encore) : l'indice de ce qui marche. */
  runningDays: number | null;
  platforms: string[];
  euReach: number | null;
  simulated?: true;
};

export type LibraryQuery = { pageIds?: string[]; searchTerms?: string };

export class AdLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdLibraryError";
  }
}

export function libraryUrl(token: string, q: LibraryQuery, version = META_DEFAULT_VERSION): string {
  const p = new URLSearchParams({
    access_token: token,
    ad_reached_countries: JSON.stringify(["FR"]),
    ad_type: "ALL",
    ad_active_status: "ALL",
    fields: AD_LIBRARY_FIELDS.join(","),
    limit: String(MAX_ADS),
  });
  if (q.pageIds?.length) p.set("search_page_ids", JSON.stringify(q.pageIds));
  if (q.searchTerms) p.set("search_terms", q.searchTerms);
  return `https://graph.facebook.com/${version}/ads_archive?${p}`;
}

type Raw = {
  id?: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  publisher_platforms?: string[];
  eu_total_reach?: number;
};

export function parseAds(raw: Raw[], now: Date): LibraryAd[] {
  return raw.map((a) => {
    const start = a.ad_delivery_start_time ?? null;
    const stop = a.ad_delivery_stop_time ?? null;
    const end = stop ? Date.parse(stop) : now.getTime();
    return {
      id: String(a.id ?? ""),
      pageId: String(a.page_id ?? ""),
      pageName: a.page_name ?? "",
      texts: a.ad_creative_bodies ?? [],
      titles: a.ad_creative_link_titles ?? [],
      descriptions: a.ad_creative_link_descriptions ?? [],
      start,
      stop,
      runningDays: start ? Math.max(0, Math.round((end - Date.parse(start)) / 86_400_000)) : null,
      platforms: a.publisher_platforms ?? [],
      euReach: typeof a.eu_total_reach === "number" ? a.eu_total_reach : null,
    };
  });
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Des pubs simulées, marquées — pour avancer tant que l'accès à l'API n'est pas ouvert. */
function simulated(q: LibraryQuery, now: Date): LibraryAd[] {
  const page = q.pageIds?.[0] ?? "100000000000";
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  return parseAds(
    [
      { id: "sim-1", page_id: page, page_name: "[SIMULÉ] Concurrent", ad_creative_bodies: ["[SIMULÉ] Le pointage de chantier depuis le téléphone."], ad_creative_link_titles: ["[SIMULÉ] Essai gratuit"], ad_delivery_start_time: day(120), publisher_platforms: ["facebook", "instagram"] },
      { id: "sim-2", page_id: page, page_name: "[SIMULÉ] Concurrent", ad_creative_bodies: ["[SIMULÉ] Vos devis en 5 minutes."], ad_creative_link_titles: ["[SIMULÉ] Démo"], ad_delivery_start_time: day(20), ad_delivery_stop_time: day(5), publisher_platforms: ["facebook"] },
    ],
    now,
  ).map((a) => ({ ...a, simulated: true as const }));
}

export async function searchAdLibrary(q: LibraryQuery, deps: { fetch: Fetch; env: Record<string, string | undefined>; now: Date }): Promise<LibraryAd[]> {
  if (!q.pageIds?.length && !q.searchTerms?.trim()) throw new AdLibraryError("Il faut des pages ou des mots-clés.");
  if (deps.env.ADS_AD_LIBRARY_MOCK === "1") return simulated(q, deps.now);
  const token = deps.env.META_AD_LIBRARY_TOKEN;
  if (!token) throw new AdLibraryError("Bibliothèque publicitaire non connectée : META_AD_LIBRARY_TOKEN absent (ou ADS_AD_LIBRARY_MOCK=1 pour des données simulées).");
  const res = await deps.fetch(libraryUrl(token, q));
  const body = (await res.json().catch(() => null)) as { data?: Raw[]; error?: { message?: string; code?: number } } | null;
  if (!res.ok || body?.error) {
    const expired = body?.error?.code === 190;
    throw new AdLibraryError(expired ? "Jeton de la bibliothèque publicitaire expiré : à renouveler (Garde-fous)." : `Bibliothèque publicitaire : ${body?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return parseAds(body?.data ?? [], deps.now);
}

/** Le rappel J-7 du jeton : dû le jour où il reste entre 6 et 7 jours — la synchro quotidienne l'envoie donc une fois. */
export function libraryTokenReminderDue(expiresAt: string | null | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const left = Date.parse(expiresAt) - now.getTime();
  return left > 6 * 86_400_000 && left <= 7 * 86_400_000;
}
