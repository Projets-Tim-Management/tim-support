import type { CollectionBeforeChangeHook } from "payload";

import { geoSource, geocode } from "@/core/lib/geocode";

/**
 * Pose (ou repose) le point géographique d'une fiche quand son adresse de
 * facturation change. Une requête BAN au plus par enregistrement, 4 s au
 * plus ; si elle échoue, la fiche s'enregistre quand même, sans point —
 * c'est une carte, pas une facture.
 */
export const geocodeClient: CollectionBeforeChangeHook = async ({ data, originalDoc }) => {
  const address = data?.billingAddress !== undefined ? data.billingAddress : originalDoc?.billingAddress;
  const complement = data?.billingAddressComplement !== undefined ? data.billingAddressComplement : originalDoc?.billingAddressComplement;
  const source = geoSource(address, complement);
  const current = (data?.geo ?? originalDoc?.geo) as { source?: string | null } | null | undefined;
  if (!source) return current?.source ? { ...data, geo: null } : data;
  if (current?.source === source) return data;
  const point = await geocode(source);
  // Adresse inconnue de la BAN : on note quand même la source, pour ne pas
  // réinterroger à chaque enregistrement d'un autre champ.
  return { ...data, geo: point ?? { lat: null, lng: null, city: null, postcode: null, label: null, source } };
};
