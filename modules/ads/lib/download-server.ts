import type { Payload } from "payload";

import { buildZip, zipFileName, type DownloadCampaign, type DownloadCreative, type DownloadKit } from "@/modules/ads/lib/download";
import { fetchFile } from "@/modules/ads/lib/render/visuals";

/** Les créas VALIDÉES (ou déjà en ligne) : les seules qui se téléchargent. */
export const DOWNLOADABLE = ["validee", "en-ligne"];

export async function zipResponse(payload: Payload, campaignId: number | string, creatives: DownloadCreative[], suffix = ""): Promise<Response> {
  const [campaign, kit] = await Promise.all([
    payload.findByID({ collection: "ad-campaigns", id: campaignId, depth: 0, overrideAccess: true }) as Promise<DownloadCampaign>,
    payload.findGlobal({ slug: "ads-brand-kit", depth: 0, overrideAccess: true }) as Promise<DownloadKit>,
  ]);
  const zip = await buildZip(campaign, creatives, kit, fetchFile);
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName(campaign, suffix)}"`,
      "Cache-Control": "no-store",
    },
  });
}
