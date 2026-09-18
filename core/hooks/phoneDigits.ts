import type { CollectionBeforeChangeHook } from "payload";

import { phoneDigits } from "@/core/lib/phone";

/**
 * Tient `phoneDigits` à jour à partir de `phone` : la forme « 0650461234 »
 * que la recherche interroge (voir core/lib/phone.ts). Repli sur le document
 * d'origine quand la mise à jour ne porte pas le téléphone — sinon éditer
 * un autre champ effacerait la clé de recherche.
 */
export const setPhoneDigits: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const phone = data?.phone !== undefined ? data.phone : originalDoc?.phone;
  return { ...data, phoneDigits: phoneDigits(phone) || null };
};
