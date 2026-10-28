/**
 * Les filtres de la liste des features : la PLATEFORME (Web / Mobile), puis la
 * SECTION (Chantier, Chiffres…).
 *
 * Tout se lit dans l'arborescence des catégories : la racine est la plateforme,
 * ses enfants directs sont les sections, et une feature rangée plus bas
 * (« Web › Chantier › Photos ») appartient à la section du dessus. La relation
 * « Plateformes » de la feature compte AUSSI pour le Web / Mobile : une feature
 * étiquetée « Mobile » sans catégorie reste trouvable sous « Mobile ».
 *
 * Module pur : l'écran le lit, les tests aussi.
 */

import { descendants } from "@/modules/editorial/lib/category-tree";
import { idOf } from "@/modules/editorial/lib/feature-media";

export type PlatformKey = "web" | "mobile";
export type Cat = { id: number | string; name: string; parent?: unknown };
export type Plat = { id: number | string; name?: string | null; slug?: string | null };
export type Section = { key: string; label: string; ids: string[] };

export type FeatureFilters = {
  platforms: Record<PlatformKey, { catIds: string[]; platformIds: string[]; sections: Section[] }>;
  /** Sections des deux plateformes réunies par nom : « Chantier » couvre Web et Mobile. */
  allSections: Section[];
};


const keyOf = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/**
 * Clé d'une SECTION : sans accents, sans casse, et sans le « s » final — la
 * même section porte « Chantier » sur une plateforme et « Chantiers » sur
 * l'autre ; réunies sous « Toutes », elles ne font qu'une.
 */
const sectionKey = (name: string) =>
  keyOf(name)
    .split(/\s+/)
    .map((w) => (w.length > 3 ? w.replace(/s$/, "") : w))
    .join(" ");

/** « Web », « Site web » → web ; « Mobile », « App mobile » → mobile. */
export function platformOf(name?: string | null): PlatformKey | null {
  const k = keyOf(name ?? "");
  if (/\bweb\b/.test(k)) return "web";
  if (/\b(mobile|app|application)\b/.test(k)) return "mobile";
  return null;
}

export function buildFeatureFilters(cats: Cat[], plats: Plat[]): FeatureFilters {
  const byId = new Map(cats.map((c) => [String(c.id), c]));
  const children = new Map<string, string[]>();
  for (const c of cats) {
    const p = idOf(c.parent);
    if (p != null) children.set(p, [...(children.get(p) ?? []), String(c.id)]);
  }
  const subtree = (id: string): string[] => descendants(children, id);

  const platforms = {
    web: { catIds: [] as string[], platformIds: [] as string[], sections: [] as Section[] },
    mobile: { catIds: [] as string[], platformIds: [] as string[], sections: [] as Section[] },
  };
  for (const root of cats.filter((c) => idOf(c.parent) == null)) {
    const p = platformOf(root.name);
    if (!p) continue;
    platforms[p].catIds.push(...subtree(String(root.id)));
    for (const childId of children.get(String(root.id)) ?? []) {
      const child = byId.get(childId)!;
      platforms[p].sections.push({ key: sectionKey(child.name), label: child.name, ids: subtree(childId) });
    }
  }
  for (const p of plats) {
    const k = platformOf(p.name) ?? platformOf(p.slug);
    if (k) platforms[k].platformIds.push(String(p.id));
  }

  const merged = new Map<string, Section>();
  for (const k of ["web", "mobile"] as const) {
    platforms[k].sections.sort((a, b) => a.label.localeCompare(b.label, "fr"));
    for (const s of platforms[k].sections) {
      const cur = merged.get(s.key);
      // Libellé commun : le plus long (« Chantiers » plutôt que « Chantier »).
      merged.set(
        s.key,
        cur
          ? { ...cur, label: s.label.length > cur.label.length ? s.label : cur.label, ids: [...cur.ids, ...s.ids] }
          : { ...s, ids: [...s.ids] },
      );
    }
  }
  const allSections = [...merged.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return { platforms, allSections };
}

/** Les sections proposées pour une plateforme (toutes réunies sans plateforme). */
export const sectionsFor = (f: FeatureFilters, platform: PlatformKey | null): Section[] =>
  platform ? f.platforms[platform].sections : f.allSections;

/** La condition de la liste pour un choix (plateforme, section). Vide = aucun filtre. */
export function whereFor(
  f: FeatureFilters,
  platform: PlatformKey | null,
  section: string | null,
): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (platform) {
    const p = f.platforms[platform];
    const or: Record<string, unknown>[] = [];
    if (p.catIds.length) or.push({ categories: { in: p.catIds } });
    if (p.platformIds.length) or.push({ platforms: { in: p.platformIds } });
    // Plateforme introuvable dans les données : un filtre qui ne rend rien plutôt
    // que la liste entière, qui laisserait croire au filtre appliqué.
    and.push(or.length ? { or } : { id: { equals: -1 } });
  }
  if (section) {
    const s = sectionsFor(f, platform).find((x) => x.key === section);
    and.push(s ? { categories: { in: s.ids } } : { id: { equals: -1 } });
  }
  return and.length ? { and } : {};
}

/** Combien de features tombent sous un choix — pour afficher « Chantier 12 ». */
export function countFor(
  f: FeatureFilters,
  features: { categories?: unknown; platforms?: unknown }[],
  platform: PlatformKey | null,
  section: string | null,
): number {
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(idOf).filter((x): x is string => x != null) : []);
  const p = platform ? f.platforms[platform] : null;
  const s = section ? sectionsFor(f, platform).find((x) => x.key === section) : null;
  if (section && !s) return 0;
  return features.filter((feat) => {
    const cats = ids(feat.categories);
    if (p && !cats.some((c) => p.catIds.includes(c)) && !ids(feat.platforms).some((x) => p.platformIds.includes(x))) {
      return false;
    }
    return !s || cats.some((c) => s.ids.includes(c));
  }).length;
}

/**
 * Forme canonique d'une condition, pour reconnaître le filtre actif.
 *
 * La liste relit sa condition dans l'URL, où les tableaux deviennent des objets
 * à clés « 0 », « 1 »… et les nombres des chaînes : comparer tel quel ne
 * reconnaîtrait jamais le filtre après un rechargement.
 */
export function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical).map((x) => JSON.stringify(x)).sort();
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length && entries.every(([k]) => /^\d+$/.test(k))) return canonical(entries.map(([, x]) => x));
    return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
  }
  return v == null ? v : String(v);
}
