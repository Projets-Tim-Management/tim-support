/**
 * Géocodage d'une adresse française — la Base Adresse Nationale
 * (api-adresse.data.gouv.fr) : gratuite, sans clé, une requête par adresse.
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

export async function geocode(source: string): Promise<GeoPoint | null> {
  if (!source) return null;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/search/?q=${encodeURIComponent(source)}&limit=1`, { signal: c.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: { score?: number; city?: string; postcode?: string; label?: string } }[];
    };
    const f = data.features?.[0];
    const [lng, lat] = f?.geometry?.coordinates ?? [];
    if (typeof lat !== "number" || typeof lng !== "number" || (f?.properties?.score ?? 0) < MIN_SCORE) return null;
    return { lat, lng, city: f?.properties?.city ?? null, postcode: f?.properties?.postcode ?? null, label: f?.properties?.label ?? null, source };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
