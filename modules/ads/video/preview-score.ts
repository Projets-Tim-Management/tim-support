import { ELEMENT_SAMPLES, type ElementType } from "@/modules/ads/video/elements";
import { parseScore } from "@/modules/ads/video/score";

/**
 * La partition de l'aperçu d'un élément (atelier des éléments) : l'exemple de
 * l'élément sur le fond du style, puis sur un rush flouté et voilé (s'il y en a
 * un). La même pour l'aperçu en direct (navigateur) et l'aperçu rendu (cron).
 * Pure.
 */
export const PREVIEW_SECONDS = 3;

export function previewScore(base: ElementType, variantId: number, rushId: number | null, factId: number | null) {
  const sample = ELEMENT_SAMPLES[base];
  const data = base === "compteur" ? { ...sample.data, fact: factId ?? 0 } : sample.data;
  const el = { type: base, variante: variantId, ...sample, data, debut: 0.2 };
  const shots: Record<string, unknown>[] = [{ kind: "compo", seconds: PREVIEW_SECONDS, fond: { type: "style" }, elements: [el] }];
  if (rushId != null) shots.push({ kind: "compo", seconds: PREVIEW_SECONDS, fond: { type: "rush", rush: rushId, from: 0, to: PREVIEW_SECONDS, flou: true, voile: 0.45 }, elements: [el] });
  return parseScore({ shots });
}
