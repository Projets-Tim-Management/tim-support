import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { isCreaPathname } from "@/modules/ads/lib/creative-files";
import { IMAGE_TYPES, MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/modules/ads/lib/meta-specs";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * POST /api/admin/ads/creatives/:id/files/jeton — le droit de déposer UN
 * fichier fini de cette créa sur le stockage, depuis le navigateur.
 *
 * Comme pour les rushes : le fichier ne traverse pas la fonction (plafond de
 * 4,5 Mo), et les limites sont fixées ICI — dossier de la créa, types image et
 * vidéo acceptés par Meta, 500 Mo. Suffixe aléatoire : un réimport n'écrase
 * jamais le fichier encore affiché.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Stockage non configuré (BLOB_READ_WRITE_TOKEN)." }, { status: 501 });

  try {
    return NextResponse.json(
      await handleUpload({
        body: await req.json(),
        request: req,
        token,
        onBeforeGenerateToken: async (pathname) => {
          if (!isCreaPathname(id, pathname)) throw new Error("Chemin de dépôt refusé.");
          return {
            allowedContentTypes: [...IMAGE_TYPES, ...VIDEO_TYPES],
            maximumSizeInBytes: MAX_VIDEO_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: 60 * 60 * 24 * 365,
          };
        },
      }),
    );
  } catch (err) {
    payload.logger.error(`[publicité] jeton de dépôt d'un fichier de la créa ${id} refusé : ${err}`);
    return NextResponse.json({ error: (err as Error).message || "Dépôt refusé." }, { status: 400 });
  }
}
