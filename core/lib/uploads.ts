import type { Payload } from "payload";

/**
 * Upload de pièces jointes images vers la collection `media`. Mutualise la
 * validation (type/taille), le plafond de nombre et l'upload — utilisé par la
 * création de ticket, la réponse support et la soumission de mission.
 * Les fichiers valides sont uploadés en parallèle (I/O indépendantes).
 */
export const ACCEPTED_IMAGE_MIME = /^image\/(jpeg|png|gif|webp)$/;
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 Mo
export const MAX_IMAGE_FILES = 5;

/**
 * Filtre les images valides (type + taille), plafonne leur nombre, les uploade
 * en média et renvoie les ids créés + les buffers (pour d'éventuelles pièces
 * jointes e-mail). L'ordre des ids suit l'ordre des fichiers valides.
 */
export async function uploadImages(
  payload: Payload,
  files: File[],
): Promise<{ ids: number[]; attachments: Array<{ filename: string; content: Buffer }> }> {
  const valid = files
    .filter(
      (f) =>
        f instanceof File && f.size > 0 && f.size <= MAX_IMAGE_SIZE && ACCEPTED_IMAGE_MIME.test(f.type),
    )
    .slice(0, MAX_IMAGE_FILES);

  const uploaded = await Promise.all(
    valid.map(async (f) => {
      const content = Buffer.from(await f.arrayBuffer());
      const media = await payload.create({
        collection: "media",
        data: { alt: f.name },
        file: { data: content, mimetype: f.type, name: f.name, size: content.length },
      });
      return { id: media.id as number, filename: f.name, content };
    }),
  );

  return {
    ids: uploaded.map((u) => u.id),
    attachments: uploaded.map((u) => ({ filename: u.filename, content: u.content })),
  };
}

/** Extrait les fichiers d'un FormData (champs `attachment_*`). */
export function attachmentsFromForm(form: FormData): File[] {
  const files: File[] = [];
  for (const [key, value] of form.entries()) {
    if (key.startsWith("attachment_") && value instanceof File) files.push(value);
  }
  return files;
}
