import type { Payload } from "payload";

import { validateRow, type PortalSection } from "@/modules/marketing/lib/portal-sections";

/**
 * Lecture et écriture d'une ligne du dossier de démarrage.
 *
 * Deux portes y mènent — l'espace client et le back-office — et elles doivent
 * appliquer EXACTEMENT les mêmes règles. Les écrire deux fois, c'est garantir
 * qu'un jour l'une acceptera ce que l'autre refuse.
 *
 * Ce qui reste propre à chaque porte, et n'a rien à faire ici : QUI est
 * autorisé, et de quel client il s'agit. Le client est toujours imposé par
 * l'appelant, jamais lu dans le corps de la requête.
 */

/** Ne garde que les champs du registre : rien d'autre n'atteint la base. */
export const pickFields = (
  section: PortalSection,
  body: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const field of section.fields) {
    if (!(field.name in body)) continue;
    const value = body[field.name];
    out[field.name] = value === "" ? null : value;
  }
  return out;
};

export const listRows = async (
  payload: Payload,
  section: PortalSection,
  clientId: number | string,
) => {
  const res = await payload.find({
    collection: section.collection as "client-employees",
    where: { client: { equals: clientId } },
    limit: 1000,
    depth: 0,
    sort: "createdAt",
    overrideAccess: true,
  });
  return res.docs;
};

export type SaveResult =
  | { ok: true; doc: unknown }
  | { ok: false; status: number; errors?: Record<string, string> };

export const saveRow = async (
  payload: Payload,
  section: PortalSection,
  clientId: number | string,
  body: Record<string, unknown>,
): Promise<SaveResult> => {
  const data = pickFields(section, body);
  const errors = validateRow(section, data);
  if (Object.keys(errors).length) return { ok: false, status: 422, errors };

  const id = body.id;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const collection = section.collection as any;

  if (!id) {
    const doc = await payload.create({
      collection,
      data: { ...data, client: Number(clientId) } as any,
      overrideAccess: true,
    });
    return { ok: true, doc };
  }

  // Mise à jour PAR LOT (`where` et non l'id seul) : c'est ce qui garantit qu'on
  // ne modifie qu'une ligne appartenant à CE client, même si l'id vient
  // d'ailleurs. Elle renvoie `{ docs, errors }` et non un document — le
  // confondre avec une ligne vidait l'écran de ses valeurs.
  const result = await payload.update({
    collection,
    where: { id: { equals: id }, client: { equals: Number(clientId) } },
    data: data as any,
    overrideAccess: true,
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const doc = result.docs?.[0];
  // Aucune ligne touchée : l'id n'appartient pas à ce client, ou n'existe plus.
  // Répondre « ok » laisserait croire à un enregistrement.
  if (!doc) return { ok: false, status: 404 };

  return { ok: true, doc };
};

export const deleteRow = async (
  payload: Payload,
  section: PortalSection,
  clientId: number | string,
  id: string,
): Promise<void> => {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const collection = section.collection as any;
  await payload.delete({
    collection,
    where: { id: { equals: id }, client: { equals: Number(clientId) } },
    overrideAccess: true,
  });
};
