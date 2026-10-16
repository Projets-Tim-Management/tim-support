import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { isRushPathname, RUSH_CONTENT_TYPES, RUSH_MAX_BYTES } from "@/modules/ads/lib/rushes";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * POST /api/admin/ads/rushes/jeton — le droit de déposer UN rush sur le
 * stockage, depuis le navigateur (plan Publicité, §9 sexies).
 *
 * Le fichier ne traverse pas la fonction (plafond de 4,5 Mo) : le navigateur
 * l'envoie au stockage, en plusieurs morceaux s'il est gros. Les limites sont
 * fixées ICI, côté serveur — dossier des rushes, types vidéo et image,
 * 500 Mo — et un client ne peut pas se les octroyer. Suffixe aléatoire : deux
 * rushes au même nom ne s'écrasent jamais.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
          if (!isRushPathname(pathname)) throw new Error("Chemin de dépôt refusé.");
          return {
            allowedContentTypes: [...RUSH_CONTENT_TYPES],
            maximumSizeInBytes: RUSH_MAX_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: 60 * 60 * 24 * 365,
          };
        },
        // Pas de `onUploadCompleted` : la fiche est créée par le formulaire, une fois le fichier déposé. Sans lui, le
        // stockage ne rappelle pas cette route (il l'aurait fait sans cookie, donc pour un 401 inutile).
      }),
    );
  } catch (err) {
    payload.logger.error(`[publicité] jeton de dépôt d'un rush refusé : ${err}`);
    return NextResponse.json({ error: (err as Error).message || "Dépôt refusé." }, { status: 400 });
  }
}
