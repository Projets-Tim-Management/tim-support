import type { CollectionSlug, Where } from "payload";

/**
 * Cœur de la recherche globale (barre du haut) — la partie sans I/O, pour
 * être testée : quelles collections on cherche, sur quels champs, comment on
 * libelle une fiche, comment on filtre les pages. La route
 * app/(frontend)/api/admin/search s'en sert avec Payload.
 */

export interface PageHit {
  label: string;
  href: string;
  /** Groupe du menu (« Support », « Partenaires »…), affiché en sous-titre. */
  group?: string;
}

export interface RecordHit {
  collection: string;
  collectionLabel: string;
  id: number | string;
  label: string;
  sub?: string;
  href: string;
}

export interface Searchable {
  /** Typé sur les slugs réels : une collection renommée casse à la compilation. */
  slug: CollectionSlug;
  fields: string[];
  /** Le champ numérique « N° » quand la collection en a un (#123). */
  numberField?: string;
  label: (doc: Record<string, unknown>) => string;
  sub?: (doc: Record<string, unknown>) => string | undefined;
}

/** Collections cherchées, champs interrogés, et comment libeller une fiche. */
export const SEARCHABLE: Searchable[] = [
  {
    slug: "partner-clients",
    fields: ["companyName", "raisonSociale", "email", "siren"],
    label: (d) => str(d.companyName) || str(d.raisonSociale) || str(d.email) || "Opportunité",
    sub: (d) => str(d.email),
  },
  {
    slug: "partners",
    fields: ["displayName", "societe", "email", "siret"],
    label: (d) => str(d.displayName) || str(d.email) || "Partenaire",
    sub: (d) => str(d.societe) || str(d.email),
  },
  {
    slug: "tickets",
    fields: ["subject", "email", "name", "company"],
    numberField: "number",
    label: (d) => `${d.number ? `#${d.number} · ` : ""}${str(d.subject) || "(sans sujet)"}`,
    sub: (d) => str(d.company) || str(d.name) || str(d.email),
  },
  {
    slug: "developments",
    fields: ["title"],
    numberField: "number",
    label: (d) => `${d.number ? `#${d.number} · ` : ""}${str(d.title) || "Développement"}`,
  },
  {
    slug: "users",
    fields: ["email", "name", "firstName"],
    label: (d) => [str(d.firstName), str(d.name)].filter(Boolean).join(" ") || str(d.email) || "Compte",
    sub: (d) => str(d.email),
  },
  { slug: "features", fields: ["title"], label: (d) => str(d.title) || "Fonctionnalité" },
  { slug: "parcours", fields: ["title"], label: (d) => str(d.title) || "Parcours" },
  { slug: "marketing-journeys", fields: ["title"], label: (d) => str(d.title) || "Parcours marketing" },
  { slug: "missions", fields: ["title"], label: (d) => str(d.title) || "Mission" },
  { slug: "rewards", fields: ["title"], label: (d) => str(d.title) || "Récompense" },
];

export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Libellé Payload : chaîne, ou objet i18n ({ fr, en }). */
export const labelOf = (label: unknown, fallback: string): string => {
  if (typeof label === "string") return label;
  if (label && typeof label === "object") {
    const l = label as Record<string, string>;
    return l.fr || l.en || Object.values(l)[0] || fallback;
  }
  return fallback;
};

/** Même test que la nav : `admin.hidden` est un booléen ou une fonction du user. */
export const hiddenFor = (hidden: unknown, user: unknown): boolean =>
  typeof hidden === "function" ? Boolean(hidden({ user })) : Boolean(hidden);

/** Recherche insensible aux accents/casse pour filtrer les pages. */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Bornes du terme cherché. En dessous de 2 caractères on ne lance pas de
 * requête en base (une lettre matcherait tout, pour dix collections) ; au-delà
 * de 80 on tronque, un `like` n'a rien à faire d'un roman.
 */
export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
export const normalizeQuery = (raw: string | null | undefined): string =>
  (raw ?? "").trim().slice(0, MAX_QUERY);

/**
 * Colonnes à lire pour une collection : celles qu'on cherche et celles qu'on
 * affiche (même liste), plus le N°. Lire une fiche entière serait dix fois plus
 * lourd — une opportunité porte son historique, un ticket tout son fil — et
 * réveillerait des hooks de lecture qui n'ont rien à faire ici.
 */
export const selectFor = (s: Searchable): Record<string, true> =>
  Object.fromEntries([...s.fields, ...(s.numberField ? [s.numberField] : [])].map((f) => [f, true]));

/**
 * `Promise.all` avec un plafond : la base partagée n'a que quinze connexions,
 * dix requêtes d'un coup par frappe et par personne les épuiseraient.
 */
export const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

/** « 12 » ou « #12 » → 12 ; sinon null. Pour retrouver un ticket par son numéro. */
export const asNumber = (q: string): number | null =>
  /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;

/**
 * Clause `where` d'une collection : chaque champ texte en `like`, plus le
 * numéro en égalité stricte quand le terme en est un.
 */
export const whereFor = (s: Searchable, q: string): Where => {
  const or: Where[] = s.fields.map((f) => ({ [f]: { like: q } }));
  const n = asNumber(q);
  if (s.numberField && n !== null) or.push({ [s.numberField]: { equals: n } });
  return { or };
};

/** Pages dont le libellé contient le terme, accents et casse ignorés. */
export const filterPages = (pages: PageHit[], q: string): PageHit[] => {
  const fq = fold(q);
  return pages.filter((p) => fold(p.label).includes(fq));
};
