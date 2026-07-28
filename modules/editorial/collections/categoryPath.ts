import type { FieldHook } from "payload";

/**
 * Chemin hiérarchique d'une catégorie de feature.
 *
 * Les catégories racines font office de plateforme (Web / Mobile) et portent
 * des sous-catégories. Le sélecteur de catégories d'une feature n'affichant que
 * le `name`, on ne voyait ni la plateforme ni le parent. On calcule donc un
 * libellé « chemin » complet ("Web › Planning › Congés") utilisé comme titre
 * (admin.useAsTitle), qui rend la plateforme et l'arborescence lisibles.
 *
 * ⚠️ La remontée des parents se fait via la couche BDD brute
 * (`payload.db.findOne`) qui NE déclenche PAS les hooks : indispensable ici,
 * car Payload calcule les `afterRead` de plusieurs docs EN PARALLÈLE — tout
 * garde de récursion posé sur `req` (partagé entre docs) provoquerait une race
 * (des libellés vides « Sans titre »). La couche `db` supprime la récursion.
 *
 * - afterRead    : recalcule toujours le chemin → fiable pour les catégories
 *                  existantes et après renommage d'un parent. Gère le sélecteur
 *                  de relation (qui ne récupère que `pathTitle` via `select`) en
 *                  relisant le doc par son id.
 * - beforeChange : stocke le chemin en base → recherche/tri du sélecteur.
 */

const SEP = " › ";
const MAX_DEPTH = 8; // garde anti-boucle (arborescence saine = 2-3 niveaux)

type MaybeRef = { id?: unknown } | number | string | null | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { findOne: (args: any) => Promise<Record<string, unknown> | null> };
type AnyReq = { payload?: { db?: Db } } | undefined;

const refId = (ref: MaybeRef): number | string | null => {
  if (ref && typeof ref === "object") return (ref.id as number | string) ?? null;
  return (ref as number | string) ?? null;
};

/** Lit une catégorie via la BDD brute (sans hooks) → pas de récursion. */
async function fetchCat(db: Db, id: number | string, req: AnyReq): Promise<Record<string, unknown> | null> {
  return db.findOne({
    collection: "feature-categories",
    where: { id: { equals: id } },
    req,
  });
}

/** Remonte la chaîne des parents → "Racine › … › Parent" (sans le nom courant). */
async function ancestorsPath(db: Db, parentId: number | string | null, req: AnyReq, guard = 0): Promise<string> {
  if (!parentId || guard >= MAX_DEPTH) return "";
  const parent = await fetchCat(db, parentId, req);
  if (!parent) return "";
  const above = await ancestorsPath(db, refId(parent.parent as MaybeRef), req, guard + 1);
  const name = (parent.name as string) ?? "";
  return above ? `${above}${SEP}${name}` : name;
}

/** Calcule le chemin complet. Si `name` est absent (lecture limitée par
 *  `select`), relit le doc par son `id` pour récupérer name + parent. */
async function computePath(args: { id?: number | string | null; name?: string; parent?: MaybeRef; req: AnyReq }): Promise<string> {
  const { id, req } = args;
  let { name, parent } = args;
  const db = req?.payload?.db;
  if (!db) return name ?? "";

  if (name === undefined && id != null) {
    const self = await fetchCat(db, id, req);
    if (self) {
      name = self.name as string;
      parent = self.parent as MaybeRef;
    }
  }
  const prefix = await ancestorsPath(db, refId(parent), req);
  const safe = name ?? "";
  return prefix ? `${prefix}${SEP}${safe}` : safe;
}

export const computePathAfterRead: FieldHook = async ({ data, value, req }) => {
  const computed = await computePath({
    id: data?.id as number | string | undefined,
    name: data?.name as string | undefined,
    parent: data?.parent as MaybeRef,
    req: req as unknown as AnyReq,
  });
  return computed || (value as string) || "";
};

export const computePathBeforeChange: FieldHook = async ({ data, originalDoc, req }) => {
  return computePath({
    id: (data?.id ?? originalDoc?.id) as number | string | undefined,
    name: (data?.name ?? originalDoc?.name) as string | undefined,
    parent: (data?.parent ?? originalDoc?.parent) as MaybeRef,
    req: req as unknown as AnyReq,
  });
};

/** Rang de plateforme (racine du chemin) → Web d'abord, puis Mobile, puis reste. */
const platformRank = (path: string): string => {
  const root = (path.split(SEP)[0] || "").trim().toLowerCase();
  if (root === "web") return "1";
  if (root === "mobile") return "2";
  return "3";
};

/**
 * Clé de tri stockée : « <rang> <chemin en minuscules> ».
 * Trié en ascendant → toutes les catégories Web, puis toutes les Mobile, et à
 * l'intérieur de chaque plateforme par ordre alphabétique du chemin.
 * Utilisée via admin.defaultSort (sélecteur de features + liste des catégories).
 */
export const computeSortKeyBeforeChange: FieldHook = async ({ data, originalDoc, req }) => {
  const path = await computePath({
    id: (data?.id ?? originalDoc?.id) as number | string | undefined,
    name: (data?.name ?? originalDoc?.name) as string | undefined,
    parent: (data?.parent ?? originalDoc?.parent) as MaybeRef,
    req: req as unknown as AnyReq,
  });
  return `${platformRank(path)} ${path.toLowerCase()}`;
};
