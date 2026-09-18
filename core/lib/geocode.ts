/**
 * Géocodage d'une adresse — la Base Adresse Nationale d'abord
 * (api-adresse.data.gouv.fr : gratuite, sans clé, précise, mais la France
 * seulement), puis Nominatim (OpenStreetMap, mondial, gratuit sous réserve
 * d'un User-Agent et d'un usage modéré — une requête par enregistrement
 * d'adresse, c'est le cas) pour une adresse belge, suisse, etc.
 *
 * On ne s'en sert que pour POSER un point sur une carte : un score trop bas
 * (la BAN « devine » une commune quand la rue est inconnue) donne un point
 * faux, pire qu'aucun point — on ne garde que les réponses sûres.
 */

export type GeoPoint = {
  lat: number;
  lng: number;
  /** Commune, code postal, département — pour l'infobulle. */
  city: string | null;
  postcode: string | null;
  /** L'adresse telle que la BAN l'a comprise. */
  label: string | null;
  /** Ce qu'on a envoyé : si l'adresse de la fiche change, on refait le point. */
  source: string;
};

const BASE = process.env.BAN_API_BASE || "https://api-adresse.data.gouv.fr";
const NOMINATIM = process.env.NOMINATIM_API_BASE || "https://nominatim.openstreetmap.org";
/** Exigé par la politique d'usage de Nominatim : dire qui appelle. */
const USER_AGENT = "tim-support/1.0 (support@tim-management.co)";
const TIMEOUT_MS = 4000;
/** En dessous, la BAN n'a pas reconnu l'adresse — elle propose, elle ne sait pas. */
const MIN_SCORE = 0.5;

/** Une seule chaîne à géocoder, et la clé qui dit si elle a changé. */
export const geoSource = (address?: string | null, complement?: string | null): string =>
  [address, complement]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ");

const withTimeout = async <T,>(run: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    return await run(c.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
};

/** La BAN : France seulement, mais au numéro près. */
async function geocodeBan(source: string): Promise<GeoPoint | null> {
  return withTimeout(async (signal) => {
    const res = await fetch(`${BASE}/search/?q=${encodeURIComponent(source)}&limit=1`, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: { score?: number; city?: string; postcode?: string; label?: string } }[];
    };
    const f = data.features?.[0];
    const [lng, lat] = f?.geometry?.coordinates ?? [];
    if (typeof lat !== "number" || typeof lng !== "number" || (f?.properties?.score ?? 0) < MIN_SCORE) return null;
    return { lat, lng, city: f?.properties?.city ?? null, postcode: f?.properties?.postcode ?? null, label: f?.properties?.label ?? null, source };
  });
}

/** Nominatim : le monde, à la commune ou à la rue selon ce qu'OSM connaît. */
async function geocodeNominatim(source: string): Promise<GeoPoint | null> {
  return withTimeout(async (signal) => {
    const res = await fetch(`${NOMINATIM}/search?q=${encodeURIComponent(source)}&format=jsonv2&limit=1&addressdetails=1`, {
      signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, "Accept-Language": "fr" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: { city?: string; town?: string; village?: string; municipality?: string; postcode?: string };
    }[];
    const f = data[0];
    const lat = Number(f?.lat);
    const lng = Number(f?.lon);
    if (!f || Number.isNaN(lat) || Number.isNaN(lng)) return null;
    const a = f.address ?? {};
    return { lat, lng, city: a.city ?? a.town ?? a.village ?? a.municipality ?? null, postcode: a.postcode ?? null, label: f.display_name ?? null, source };
  });
}

export async function geocode(source: string): Promise<GeoPoint | null> {
  if (!source) return null;
  // La BAN d'abord : plus précise en France, et la quasi-totalité des fiches
  // y sont. Rien chez elle — une adresse à l'étranger — on demande au monde.
  return (await geocodeBan(source)) ?? (await geocodeNominatim(source));
}
