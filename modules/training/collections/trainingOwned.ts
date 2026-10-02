import type { CollectionBeforeChangeHook, Field, PayloadRequest } from "payload";

/**
 * Socle commun aux journées et séances de formation : rattachement au parcours
 * et clés de scoping (`client`, `partner`) DÉDUITES, jamais saisies.
 *
 * Même raison que pour les parcours clients : saisir le client à part ouvrirait
 * la porte à une journée rattachée au client A dans la formation du client B, et
 * `partner` est la clé du RBAC — une valeur fausse rend la ligne invisible à son
 * partenaire, ou visible à un autre.
 */

const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

export { idOf as trainingRefId };

async function ownerOf(
  req: PayloadRequest,
  collection: "trainings" | "training-days",
  id: number | string,
): Promise<{ training: number | string | null; client: number | string | null; partner: number | string | null } | null> {
  try {
    const doc = (await req.payload.findByID({ collection, id, depth: 0, overrideAccess: true, req })) as {
      id: number | string;
      training?: unknown;
      client?: unknown;
      partner?: unknown;
    };
    return {
      training: collection === "trainings" ? doc.id : idOf(doc.training),
      client: idOf(doc.client),
      partner: idOf(doc.partner),
    };
  } catch {
    return null;
  }
}

/**
 * Recopie `client` et `partner` (et `training` pour une séance) depuis le parent.
 * Parent introuvable : on laisse tel quel, le `required` remontera l'erreur.
 */
export const deriveOwnerFrom =
  (parentField: "training" | "day"): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req }) => {
    const parentId = idOf(data?.[parentField] ?? originalDoc?.[parentField]);
    if (parentId == null) return data;
    const owner = await ownerOf(req, parentField === "training" ? "trainings" : "training-days", parentId);
    if (!owner) return data;
    return {
      ...data,
      client: owner.client,
      partner: owner.partner,
      ...(parentField === "day" ? { training: owner.training } : {}),
    };
  };

/** Client déduit du parent : lecture seule, présent pour le scoping et les requêtes. */
export const derivedClientField: Field = {
  name: "client",
  type: "relationship",
  relationTo: "partner-clients",
  label: "Client",
  index: true,
  admin: { readOnly: true },
};
