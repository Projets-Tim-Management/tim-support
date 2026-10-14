import type { Score, Shot } from "@/modules/ads/video/score";
import { MAX_CAPTION_CHARS, MAX_OPENING_CHARS } from "@/modules/ads/video/score";

/**
 * Une partition PAR DÉFAUT pour une créa (plan Publicité, §9 sexies, D3) :
 * de quoi essayer un style sur une créa existante, sans attendre l'agent. Elle
 * prend l'accroche de la créa, un rush prêt (de préférence de la fonctionnalité
 * que l'angle évoque, à description validée), une preuve sourcée et la fin.
 *
 * L'agent (D4) écrira ses propres partitions, plan par plan ; celle-ci n'est
 * qu'un montage simple et sûr, vérifié comme les autres avant tout rendu.
 */

export type DefaultRush = { id: number; durationSec: number; features: string[]; validated: boolean; source: string | null };
export type DefaultInput = {
  hook: string;
  /** Les textes passés aux garde-fous : un titre sert de sous-titre au plan du rush. */
  titles: string[];
  descriptions: string[];
  angle: string;
  rushes: DefaultRush[];
  factIds: number[];
};

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** Les mots d'un angle qui désignent une fonctionnalité, pour choisir le bon rush. */
const FEATURE_WORDS: Record<string, RegExp> = {
  pointage: /point|heure|arriv|présen/i,
  planning: /planning|plann|semaine|affect/i,
  "feuilles-heures": /feuille|ressais|vendredi|paie/i,
  conges: /cong|absen/i,
  "suivi-chantier": /chantier|suivi|avancement/i,
  documents: /document|photo|fichier/i,
  paie: /paie|export|salaire/i,
};

/** Le rush le plus pertinent : la fonctionnalité de l'angle, puis la description validée, puis le plus long. Pure. */
export function pickRush(angle: string, rushes: DefaultRush[]): DefaultRush | null {
  if (!rushes.length) return null;
  const wanted = Object.entries(FEATURE_WORDS).filter(([, re]) => re.test(angle)).map(([k]) => k);
  const score = (r: DefaultRush) => (r.features.some((f) => wanted.includes(f)) ? 4 : 0) + (r.validated ? 2 : 0) + Math.min(1, r.durationSec / 10);
  return [...rushes].sort((a, b) => score(b) - score(a))[0];
}

/** La partition par défaut, ou la raison pour laquelle on ne peut pas en faire. Pure. */
export function defaultScore(input: DefaultInput): { ok: true; score: Score } | { ok: false; error: string } {
  const rush = pickRush(input.angle || input.hook, input.rushes);
  if (!rush) return { ok: false, error: "Aucun rush prêt : importez et convertissez au moins un rush (Publicité › Rushes)." };
  const length = Math.max(1, Math.min(5, rush.durationSec - 0.3));
  const shots: Shot[] = [
    { kind: "ouverture", seconds: 2.2, text: clip(input.hook.trim() || input.angle.trim(), MAX_OPENING_CHARS), highlight: null, sub: null },
    { kind: "rush", seconds: Math.max(2, Math.min(5, length)), rush: rush.id, from: 0, to: Math.round(length * 100) / 100, zoom: null, caption: input.titles[0] ? clip(input.titles[0], MAX_CAPTION_CHARS) : null },
  ];
  if (input.factIds.length) shots.push({ kind: "preuve", seconds: 1.8, fact: input.factIds[0] });
  shots.push({ kind: "fin", seconds: 2.5, line: input.descriptions[0] ? clip(input.descriptions[0], MAX_OPENING_CHARS) : null });
  return { ok: true, score: { shots } };
}
