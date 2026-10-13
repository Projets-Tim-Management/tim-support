import type { CollectionBeforeChangeHook } from "payload";

import { nafLabel, normalizeNaf } from "@/modules/partner/lib/naf";

/**
 * Tient le métier de la fiche cohérent : code à la forme INSEE (« 43.22A »),
 * libellé recalculé depuis la nomenclature (jamais saisi), source effacée avec
 * le code.
 *
 * La source suit le geste : la recherche INSEE pose « insee », le champ du
 * formulaire pose « manuel » dès qu'on tape (NafField). Un changement de code
 * qui arrive SANS source — API, import, script — est une saisie : « manuel ».
 * C'est ce qui protège une correction faite à la main du recalcul INSEE
 * (scripts/naf-recalcul.ts n'écrase jamais une saisie manuelle).
 */
export const setNaf: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (!data) return data;
  const raw = data.naf !== undefined ? data.naf : originalDoc?.naf;
  const naf = typeof raw === "string" && raw.trim() ? (normalizeNaf(raw) ?? raw.trim()) : null;
  if (!naf) return { ...data, naf: null, nafLabel: null, nafSource: null };

  const changed = naf !== (originalDoc?.naf ?? null);
  const source = changed
    ? (data.nafSource ?? "manuel")
    : (data.nafSource ?? originalDoc?.nafSource ?? "manuel");
  return { ...data, naf, nafLabel: nafLabel(naf), nafSource: source };
};
