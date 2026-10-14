import type { Payload } from "payload";

import { buildZip, zipFileName, type DownloadCampaign, type DownloadCreative, type DownloadKit } from "@/modules/ads/lib/download";
import { fetchFile } from "@/modules/ads/lib/render/visuals";

/**
 * Au-delà, le ZIP ne passe plus par la réponse de la fonction (Vercel plafonne
 * une réponse à 4,5 Mo) : il est déposé sur le stockage, sous une adresse
 * aléatoire, et le navigateur y est redirigé. Les vidéos le font vite dépasser.
 */
export const INLINE_ZIP_MAX = 4 * 1024 * 1024;

/** Les créas VALIDÉES (ou déjà en ligne) : les seules qui se téléchargent. */
export const DOWNLOADABLE = ["validee", "en-ligne"];

export async function zipResponse(payload: Payload, campaignId: number | string, creatives: DownloadCreative[], suffix = ""): Promise<Response> {
  const [campaign, kit] = await Promise.all([
    payload.findByID({ collection: "ad-campaigns", id: campaignId, depth: 0, overrideAccess: true }) as Promise<DownloadCampaign>,
    payload.findGlobal({ slug: "ads-brand-kit", depth: 0, overrideAccess: true }) as Promise<DownloadKit>,
  ]);
  const zip = await buildZip(campaign, creatives, kit, fetchFile);
  const name = zipFileName(campaign, suffix);
  if (zip.byteLength > INLINE_ZIP_MAX && process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`ads/zips/${name}`, Buffer.from(zip), { access: "public", contentType: "application/zip", addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN });
    return Response.redirect(blob.downloadUrl, 303);
  }
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
