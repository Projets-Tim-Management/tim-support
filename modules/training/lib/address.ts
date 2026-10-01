/**
 * Recherche d'adresse pour le lieu d'une journée de formation — règles pures.
 *
 * Les suggestions viennent de la Base Adresse Nationale
 * (api-adresse.data.gouv.fr, gratuite, sans clé, France seulement), déjà
 * utilisée pour la carte de l'accueil (core/lib/geocode). Une adresse hors de
 * France n'y figure pas : le texte libre reste accepté.
 */

export const BAN_SEARCH = "https://api-adresse.data.gouv.fr/search/";

/** En dessous, on ne cherche pas : trois lettres ne désignent rien. */
export const MIN_QUERY = 3;

export type AddressSuggestion = { label: string; context: string };

type BanResponse = {
  features?: { properties?: { label?: string; context?: string; type?: string } }[];
};

/** URL de recherche « au fil de la frappe ». */
export const banSearchUrl = (q: string, limit = 6): string =>
  `${BAN_SEARCH}?q=${encodeURIComponent(q.trim())}&limit=${limit}&autocomplete=1`;

/**
 * Suggestions lisibles : « 12 Rue des Lilas 69003 Lyon » et, dessous, le
 * contexte (« 69, Rhône, Auvergne-Rhône-Alpes »). Doublons écartés.
 */
export function parseBanSuggestions(data: unknown): AddressSuggestion[] {
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const f of (data as BanResponse | null)?.features ?? []) {
    const label = f.properties?.label?.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, context: f.properties?.context?.trim() ?? "" });
  }
  return out;
}

/** Une adresse de facturation (adresse + complément) en une ligne. */
export const joinAddress = (address?: string | null, complement?: string | null): string =>
  [address, complement]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");

/** Lien « Voir sur la carte » — une recherche, pas de clé à gérer. */
export const mapsUrl = (address: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
