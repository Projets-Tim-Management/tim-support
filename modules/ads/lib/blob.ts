import type { Payload } from "payload";

/**
 * Retirer des fichiers du stockage des pubs (Vercel Blob) sans faire échouer le
 * geste qui les retire : une suppression ratée se journalise, le ménage nocturne
 * rattrapera le fichier orphelin. Sans jeton de stockage (tests, local), rien.
 */
export async function deleteBlobs(payload: Payload, urls: (string | null | undefined)[], what: string): Promise<void> {
  const list = urls.filter((u): u is string => Boolean(u));
  if (!list.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(list, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (e) {
    payload.logger.warn(`[publicité] ${what} non supprimé(s) : ${(e as Error).message}`);
  }
}
