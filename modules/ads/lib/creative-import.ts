import type { Payload } from "payload";

import { deleteBlobs } from "@/modules/ads/lib/blob";
import { isCreaBlobUrl, OPEN_STATUSES, withImported, type CreativeFile } from "@/modules/ads/lib/creative-files";
import { checkFile, parseFileName, type FileFacts, type SpecCheck } from "@/modules/ads/lib/meta-specs";

/**
 * Enregistrer un fichier fini importé depuis Claude Design sur sa créa.
 *
 * Le navigateur a déposé le fichier sur le stockage et mesuré ce qu'il en lit
 * (dimensions, durée) ; le serveur REVÉRIFIE ce qu'il peut : l'adresse vient du
 * dossier de la créa, le nom ne désigne pas une autre créa, les exigences de
 * Meta sont tenues, et les dimensions d'une image sont relues sur le fichier
 * (celles d'une vidéo, faute de lecteur côté serveur, sont celles du navigateur).
 * Le fichier remplace celui du même format et de la même nature ; l'ancien est
 * supprimé du stockage.
 */

export class ImportError extends Error {}

export type ImportRequest = FileFacts & { url: string; pathname?: string | null; filename: string };

/** Ce que dit l'import, avant toute écriture ; lève `ImportError` avec la raison. Pure. */
export function checkImport(creativeId: number | string, status: string | null | undefined, r: ImportRequest): SpecCheck & { format: NonNullable<SpecCheck["format"]>; kind: "image" | "video" } {
  if (!OPEN_STATUSES.includes(status ?? "")) throw new ImportError(`Créa « ${status} » : ses fichiers ne changent plus.`);
  if (!isCreaBlobUrl(creativeId, r.url)) throw new ImportError("Fichier introuvable sur le stockage de cette créa : réimportez-le.");
  const named = parseFileName(r.filename);
  if (named.creative != null && String(named.creative) !== String(creativeId)) throw new ImportError(`Ce fichier est nommé pour la créa C${named.creative}, pas pour celle-ci (C${creativeId}).`);
  const check = checkFile(r, named.format);
  if (!check.ok || !check.format || !check.kind) throw new ImportError(check.problems.join(" "));
  return check as SpecCheck & { format: NonNullable<SpecCheck["format"]>; kind: "image" | "video" };
}

async function imageSize(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const { default: sharp } = await import("sharp");
    const m = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    return m.width && m.height ? { width: m.width, height: m.height } : null;
  } catch {
    return null;
  }
}

const dropBlob = (payload: Payload, url: string | null | undefined) => deleteBlobs(payload, [url], `ancien fichier (${url})`);

type Raw = { id: number; status?: string | null; files?: CreativeFile[] | null };

export async function importCreativeFile(payload: Payload, creativeId: number | string, r: ImportRequest, now = new Date()): Promise<{ file: CreativeFile; replaced: boolean }> {
  const c = (await payload.findByID({ collection: "ad-creatives", id: creativeId, depth: 0, overrideAccess: true }).catch(() => null)) as Raw | null;
  if (!c) throw new ImportError("Créa introuvable.");
  let facts: ImportRequest = r;
  if (r.mime.startsWith("image/")) {
    const real = await imageSize(r.url);
    if (real) facts = { ...r, ...real };
  }
  const check = checkImport(c.id, c.status, facts);
  const file: CreativeFile = {
    format: check.format,
    kind: check.kind,
    url: facts.url,
    pathname: facts.pathname ?? null,
    filename: facts.filename,
    mime: facts.mime,
    bytes: facts.bytes,
    width: facts.width,
    height: facts.height,
    durationSec: check.kind === "video" ? (facts.durationSec ?? null) : null,
    warnings: check.warnings,
    importedAt: now.toISOString(),
  };
  const { files, replaced } = withImported(c.files, file);
  await payload.update({ collection: "ad-creatives", id: c.id, data: { files } as never, overrideAccess: true });
  if (replaced && replaced.url !== file.url) await dropBlob(payload, replaced.url);
  return { file, replaced: Boolean(replaced) };
}

/** Retire un fichier importé (avant validation) et le supprime du stockage. */
export async function removeCreativeFile(payload: Payload, creativeId: number | string, url: string): Promise<void> {
  const c = (await payload.findByID({ collection: "ad-creatives", id: creativeId, depth: 0, overrideAccess: true }).catch(() => null)) as Raw | null;
  if (!c) throw new ImportError("Créa introuvable.");
  if (!OPEN_STATUSES.includes(c.status ?? "")) throw new ImportError(`Créa « ${c.status} » : ses fichiers ne changent plus.`);
  const files = c.files ?? [];
  if (!files.some((f) => f.url === url)) throw new ImportError("Fichier introuvable sur cette créa.");
  await payload.update({ collection: "ad-creatives", id: c.id, data: { files: files.filter((f) => f.url !== url) } as never, overrideAccess: true });
  await dropBlob(payload, url);
}
