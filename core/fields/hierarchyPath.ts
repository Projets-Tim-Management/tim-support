import type { FieldHook } from "payload";

/**
 * Chemin hiérarchique d'une collection auto-référencée (« Web › Planning ›
 * Congés »), partagé par les catégories de features et les chantiers de
 * développement.
 *
 * Le sélecteur d'une relation n'affiche que le titre du document : sans chemin,
 * on ne voit ni la racine ni le parent, et deux sous-catégories homonymes
 * deviennent impossibles à distinguer. On calcule donc un libellé complet, qui
 * sert de `useAsTitle`.
 *
 * ⚠️ La remontée des parents se fait via la couche BDD brute (`payload.db.findOne`)
 * qui NE déclenche PAS les hooks : indispensable ici, car Payload calcule les
 * `afterRead` de plusieurs documents EN PARALLÈLE — tout garde de récursion posé
 * sur `req` (partagé entre documents) provoquerait une race (des libellés vides
 * « Sans titre »). La couche `db` supprime la récursion.
 *
 * - afterRead    : recalcule toujours → fiable après renommage d'un parent, et
 *                  gère le sélecteur de relation (qui ne récupère que le champ
 *                  chemin via `select`) en relisant le document par son id ;
 * - beforeChange : stocke le chemin en base → recherche et tri du sélecteur.
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

export type HierarchyPathHooks = {
  /** À poser sur le champ « chemin » (afterRead). */
  pathAfterRead: FieldHook;
  /** À poser sur le champ « chemin » (beforeChange). */
  pathBeforeChange: FieldHook;
  /** À poser sur le champ caché « clé de tri » (beforeChange). */
  sortKeyBeforeChange: FieldHook;
};

/**
 * Fabrique les trois hooks pour une collection donnée.
 *
 * @param collection slug de la collection auto-référencée
 * @param rank       préfixe de tri optionnel, calculé depuis le chemin (ex. les
 *                   catégories de features rangent Web avant Mobile). Sans lui,
 *                   le tri est purement alphabétique sur le chemin.
 */
export function makeHierarchyPathHooks(
  collection: string,
  rank?: (path: string) => string,
): HierarchyPathHooks {
  const fetchDoc = (db: Db, id: number | string, req: AnyReq) =>
    db.findOne({ collection, where: { id: { equals: id } }, req });

  /** Remonte la chaîne des parents → « Racine › … › Parent » (sans le nom courant). */
  async function ancestorsPath(
    db: Db,
    parentId: number | string | null,
    req: AnyReq,
    guard = 0,
  ): Promise<string> {
    if (!parentId || guard >= MAX_DEPTH) return "";
    const parent = await fetchDoc(db, parentId, req);
    if (!parent) return "";
    const above = await ancestorsPath(db, refId(parent.parent as MaybeRef), req, guard + 1);
    const name = (parent.name as string) ?? "";
    return above ? `${above}${SEP}${name}` : name;
  }

  /**
   * Chemin complet. Si `name` est absent (lecture limitée par `select`), relit
   * le document par son `id` pour récupérer name + parent.
   */
  async function computePath(args: {
    id?: number | string | null;
    name?: string;
    parent?: MaybeRef;
    req: AnyReq;
  }): Promise<string> {
    const { id, req } = args;
    let { name, parent } = args;
    const db = req?.payload?.db;
    if (!db) return name ?? "";

    if (name === undefined && id != null) {
      const self = await fetchDoc(db, id, req);
      if (self) {
        name = self.name as string;
        parent = self.parent as MaybeRef;
      }
    }
    const prefix = await ancestorsPath(db, refId(parent), req);
    const safe = name ?? "";
    return prefix ? `${prefix}${SEP}${safe}` : safe;
  }

  const fromDoc = (data: Record<string, unknown> | undefined, originalDoc: Record<string, unknown> | undefined, req: unknown) => ({
    id: (data?.id ?? originalDoc?.id) as number | string | undefined,
    name: (data?.name ?? originalDoc?.name) as string | undefined,
    parent: (data?.parent ?? originalDoc?.parent) as MaybeRef,
    req: req as AnyReq,
  });

  return {
    pathAfterRead: async ({ data, value, req }) => {
      const computed = await computePath({
        id: data?.id as number | string | undefined,
        name: data?.name as string | undefined,
        parent: data?.parent as MaybeRef,
        req: req as unknown as AnyReq,
      });
      return computed || (value as string) || "";
    },

    pathBeforeChange: async ({ data, originalDoc, req }) => computePath(fromDoc(data, originalDoc, req)),

    sortKeyBeforeChange: async ({ data, originalDoc, req }) => {
      const path = await computePath(fromDoc(data, originalDoc, req));
      const prefix = rank ? `${rank(path)} ` : "";
      return `${prefix}${path.toLowerCase()}`;
    },
  };
}
