import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from "payload";

import { DEFAULT_STATUS_KEY, positionOf, statusHasRole, type DevStatusDoc } from "@/modules/dev/lib/devStatus";

/**
 * Ce que le système inscrit tout seul sur un développement : son statut de
 * départ, son rang de tri, ses dates de jalons et le nombre de clients qui
 * l'attendent.
 *
 * Depuis que les statuts sont du contenu, ces automatismes ne peuvent plus lire
 * une table en dur : ils demandent au STATUT ce qu'il déclenche (ses `roles`) et
 * où il se range (sa `position`). Un statut créé en back-office se comporte donc
 * exactement comme un statut livré, pourvu qu'on lui ait donné ses rôles.
 */

type MaybeRef = { id?: unknown } | number | string | null | undefined;

const idOf = (ref: MaybeRef): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { findOne?: (args: any) => Promise<Record<string, unknown> | null>; find?: (args: any) => Promise<any> };
const dbOf = (req: unknown): Db | undefined =>
  (req as { payload?: { db?: Db } } | undefined)?.payload?.db;

/**
 * Statut d'entrée d'un développement qui vient de naître (saisie, ouverture
 * depuis un ticket). Cherché par sa CLÉ, qui ne change pas quand on renomme le
 * statut ; à défaut — clé supprimée en back-office — on prend la première
 * colonne du tableau, qui est par construction celle où arrivent les demandes.
 */
const findEntryStatus = async (req: unknown): Promise<Record<string, unknown> | null> => {
  const db = dbOf(req);
  if (!db?.findOne) return null;
  const byKey = await db.findOne({
    collection: "dev-statuses",
    where: { key: { equals: DEFAULT_STATUS_KEY } },
    req,
  });
  if (byKey) return byKey;
  if (!db.find) return null;
  const first = await db.find({
    collection: "dev-statuses",
    sort: "position",
    limit: 1,
    req,
  });
  return first?.docs?.[0] ?? null;
};

/**
 * Un développement sans statut ne s'affiche dans aucune colonne : il faut donc
 * lui en poser un, même quand la création vient d'un endpoint ou d'un import
 * qui n'en fournit pas. Payload ne sait pas donner de valeur par défaut à une
 * relation — d'où ce hook plutôt qu'un `defaultValue`.
 */
export const setDefaultStatus: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) return data;
  /**
   * À la création ET sur toute mise à jour qui laisserait le statut vide : un
   * développement sans colonne disparaîtrait du tableau sans disparaître de la
   * base — exactement ce que ce module existe pour éviter.
   *
   * `"status" in data` plutôt que `data.status ?? originalDoc.status` : vider le
   * champ envoie `null`, que le repli sur la fiche lisait comme « inchangé ».
   * La fiche était alors enregistrée SANS statut — invisible de toutes les vues.
   */
  const submitted = "status" in data ? data.status : originalDoc?.status;
  if (idOf(submitted as MaybeRef) != null) return data;
  const entry = await findEntryStatus(req);
  if (entry?.id != null) data.status = entry.id;
  return data;
};

/**
 * Rang de tri + dates de jalons, lus sur le statut lui-même.
 *
 * Un seul hook pour les deux : ils demandent la même fiche de statut, et deux
 * hooks auraient fait deux requêtes à chaque enregistrement.
 *
 * Les dates sont posées au PREMIER passage et jamais réécrites : un aller-retour
 * (retour en développement après une recette ratée) ne doit pas effacer la date
 * de démarrage — ce qu'on veut savoir, c'est quand le travail a commencé, pas
 * quand on y est revenu. Contrairement au `resolvedAt` d'un ticket, qui s'efface
 * à la ré-ouverture parce qu'il déclenche une purge.
 */
export const applyStatusEffects: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  // Même précaution que dans `setDefaultStatus` : un statut vidé ne doit pas se
  // lire comme « inchangé », sans quoi le rang de tri resterait celui de
  // l'ancienne colonne.
  const submitted = data && "status" in data ? data.status : originalDoc?.status;
  const statusId = idOf(submitted as MaybeRef);
  if (statusId == null) return data;

  const db = dbOf(req);
  if (!db?.findOne) return data;
  const status = (await db.findOne({
    collection: "dev-statuses",
    where: { id: { equals: statusId } },
    req,
  })) as DevStatusDoc | null;
  if (!status) return data;

  const position = positionOf(status);
  if (position !== null) data.statusRank = position;

  const now = new Date().toISOString();
  if (statusHasRole(status, "demarre") && !(data?.startedAt ?? originalDoc?.startedAt)) {
    data.startedAt = now;
  }
  if (statusHasRole(status, "livre") && !(data?.deliveredAt ?? originalDoc?.deliveredAt)) {
    data.deliveredAt = now;
    // Un dev livré sans date de démarrage (saisi après coup, ou passé
    // directement en production) garderait une chronologie trouée.
    if (!(data?.startedAt ?? originalDoc?.startedAt)) data.startedAt = now;
  }
  return data;
};

/**
 * Nombre d'opportunités demandeuses, dénormalisé dans une colonne indexée.
 *
 * C'est le chiffre qui arbitre : « quatre clients l'attendent » pèse plus lourd
 * qu'une intuition. Stocké plutôt que compté à l'affichage, parce qu'on veut
 * pouvoir TRIER la liste dessus — un compte calculé en JS ne se trie pas côté
 * base.
 */
export const setDemandCount: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const raw = data?.opportunities ?? originalDoc?.opportunities;
  data.demandCount = Array.isArray(raw) ? raw.length : 0;
  return data;
};
