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

/**
 * Traduit un refus de Payload en erreurs par champ.
 *
 * La collection valide DES CHOSES QUE LE REGISTRE NE CONNAÎT PAS : l'âge
 * minimum d'un salarié, le format d'un téléphone, l'e-mail obligatoire d'un
 * utilisateur. Payload signale ces refus en levant, et une exception qui
 * traverse la route devient un 500 : l'écran affichait « erreur serveur » là où
 * il fallait lire « ce salarié aurait 0 an ». Pire, à l'import, une seule ligne
 * fautive faisait échouer les cinquante autres.
 *
 * Ce qu'on ne sait pas traduire n'est pas avalé pour autant : on renvoie 500,
 * mais avec une phrase, et l'erreur reste dans les journaux du serveur.
 */
const errorsFrom = (err: unknown): { status: number; errors: Record<string, string> } => {
  const data = (err as { data?: { errors?: unknown[] } })?.data;
  const liste = Array.isArray(data?.errors) ? data.errors : [];

  const errors: Record<string, string> = {};
  for (const e of liste) {
    const { path, field, message } = e as { path?: string; field?: string; message?: string };
    const nom = path || field;
    if (nom && message) errors[nom] = message;
  }

  if (Object.keys(errors).length) return { status: 422, errors };

  const message = (err as { message?: string })?.message;
  return { status: 500, errors: { _: message || "Enregistrement refusé." } };
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
    try {
      const doc = await payload.create({
        collection,
        data: { ...data, client: Number(clientId) } as any,
        overrideAccess: true,
      });
      return { ok: true, doc };
    } catch (err) {
      return { ok: false, ...errorsFrom(err) };
    }
  }

  // Mise à jour PAR LOT (`where` et non l'id seul) : c'est ce qui garantit qu'on
  // ne modifie qu'une ligne appartenant à CE client, même si l'id vient
  // d'ailleurs. Elle renvoie `{ docs, errors }` et non un document — le
  // confondre avec une ligne vidait l'écran de ses valeurs.
  let result;
  try {
    result = await payload.update({
      collection,
      where: { id: { equals: id }, client: { equals: Number(clientId) } },
      data: data as any,
      overrideAccess: true,
    });
  } catch (err) {
    return { ok: false, ...errorsFrom(err) };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // La mise à jour par lot ne lève pas : elle rapporte ses refus.
  const echec = (result.errors ?? [])[0] as { message?: string } | undefined;
  if (echec) return { ok: false, status: 422, errors: { _: echec.message || "Ligne refusée." } };

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
