import type { Payload } from "payload";

/** Nom de fichier propre extrait d'une URL WordPress. */
function filenameFromUrl(url: string): string {
  return decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "");
}

/**
 * Télécharge une image depuis WordPress et l'importe dans la collection Media.
 * Rejouable : si un média du même nom de fichier existe déjà, on le réutilise
 * au lieu de le retélécharger. Retourne l'id du média (ou null si échec).
 */
export async function uploadMediaFromUrl(
  payload: Payload,
  url: string | null | undefined,
  alt = "",
): Promise<number | null> {
  if (!url) return null;
  const filename = filenameFromUrl(url);
  if (!filename) return null;

  const existing = await payload.find({
    collection: "media",
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  });
  if (existing.docs.length) return existing.docs[0].id as number;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[migration] média ${res.status} sur ${url}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const created = await payload.create({
      collection: "media",
      data: { alt: alt || filename },
      file: {
        data: buffer,
        mimetype: res.headers.get("content-type") ?? "application/octet-stream",
        name: filename,
        size: buffer.length,
      },
    });
    return created.id as number;
  } catch (err) {
    console.warn(`[migration] échec téléchargement média ${url}:`, err);
    return null;
  }
}
