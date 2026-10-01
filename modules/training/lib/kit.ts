/**
 * Kit de séance — règles pures : le programme horodaté d'une séance, et le
 * contenu du mémo « Bien démarrer » d'un profil.
 *
 * Le programme d'une séance assemble ceux de ses profils (Système →
 * Formation), dans l'ordre hiérarchique, et les cale sur l'horaire du créneau.
 * Testé seul : tests/training-kit.test.ts.
 */

import { PROFILS } from "@/modules/partner/lib/pricing";

export type ProgrammeModule = {
  title: string;
  minutes?: number | null;
  parcours?: number | string | null;
  feature?: number | string | null;
};

export type Programme = { profile: string; modules: ProgrammeModule[] };

export type TimedModule = { title: string; start: string; end: string; minutes: number; profile: string };

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number): string => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Les modules d'une séance, horodatés depuis son début.
 *
 * Un module partagé par deux profils (même parcours, ou même intitulé) ne
 * passe qu'une fois. `overflow` > 0 : le programme dépasse le créneau de ce
 * nombre de minutes — au formateur de resserrer, on ne coupe rien d'office.
 */
export function timedProgramme(
  programmes: Programme[],
  profiles: string[],
  startTime?: string | null,
  endTime?: string | null,
): { modules: TimedModule[]; totalMinutes: number; overflow: number } {
  const ordered = PROFILS.map((p) => p.key as string).filter((k) => profiles.includes(k));
  const seen = new Set<string>();
  const picked: { m: ProgrammeModule; profile: string }[] = [];
  for (const profile of ordered) {
    for (const m of programmes.find((p) => p.profile === profile)?.modules ?? []) {
      const key = m.parcours != null ? `p${m.parcours}` : `t${m.title.trim().toLowerCase()}`;
      if (!m.title?.trim() || seen.has(key)) continue;
      seen.add(key);
      picked.push({ m, profile });
    }
  }
  // Sans heure de début, pas d'heures inventées (« 00:00 ») : start et end
  // restent vides, la durée de chaque module suffit.
  let cursor = startTime ? toMin(startTime) : null;
  const modules = picked.map(({ m, profile }) => {
    const minutes = Math.max(5, Math.round(m.minutes ?? 10));
    if (cursor == null) return { title: m.title.trim(), start: "", end: "", minutes, profile };
    const start = toHHMM(cursor);
    cursor += minutes;
    return { title: m.title.trim(), start, end: toHHMM(cursor), minutes, profile };
  });
  const totalMinutes = modules.reduce((n, m) => n + m.minutes, 0);
  const available = startTime && endTime ? toMin(endTime) - toMin(startTime) : null;
  return { modules, totalMinutes, overflow: available != null && available > 0 ? Math.max(0, totalMinutes - available) : 0 };
}

export type MemoGesture = { title: string; url: string };

/**
 * Les gestes essentiels du mémo d'un profil : les fonctionnalités de son
 * PREMIER module (celui par lequel on commence), six au plus — un mémo qui
 * en liste vingt ne se lit pas.
 */
export function memoGestures(
  features: { title?: string | null; slug?: string | null }[],
  siteUrl: string,
  max = 6,
): MemoGesture[] {
  const base = siteUrl.replace(/\/$/, "");
  return features
    .filter((f) => f.title?.trim() && f.slug)
    .slice(0, max)
    .map((f) => ({ title: f.title!.trim(), url: `${base}/features/${f.slug}` }));
}

/** Adresse lisible sur papier : sans « https:// ». */
export const printableUrl = (url: string): string => url.replace(/^https?:\/\//, "");
