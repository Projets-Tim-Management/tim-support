import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { isBackoffice } from "@/core/access";
import { payloadClient } from "@/core/payload-client";

/**
 * POST /api/media/jeton — délivre au navigateur un droit de dépôt sur le CDN.
 *
 * POURQUOI NOTRE PROPRE ROUTE plutôt que celle du plugin. Le dépôt direct est
 * ce qui affranchit les envois du plafond de 4,5 Mo d'une fonction Vercel. Mais
 * la route du plugin n'accorde jamais `allowOverwrite`, et le CDN refuse alors
 * d'écrire deux fois sous le même nom. Or c'est le geste ordinaire : on
 * remplace le GIF d'une fonctionnalité par sa nouvelle version, sous le même
 * nom. Le droit d'écraser s'accorde ICI, côté serveur — un client ne peut pas
 * se l'octroyer lui-même.
 *
 * L'accès est celui de la collection : quiconque peut créer un média peut
 * déposer. Sans ce contrôle, l'adresse suffirait à déposer n'importe quoi sur
 * le CDN de TIM.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!isBackoffice({ req: { user } } as never)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "storage_not_configured" }, { status: 501 });

  try {
    return NextResponse.json(
      await handleUpload({
        body: await req.json(),
        request: req,
        token,
        onBeforeGenerateToken: async () => ({
          // Le nom reste celui du fichier : c'est lui qui sera enregistré en
          // base, et les deux doivent désigner le même objet.
          addRandomSuffix: false,
          // Le point de toute cette route.
          allowOverwrite: true,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        }),
        // Rien à faire à la fin : c'est le navigateur qui enchaîne sur
        // /api/media/enregistrer, une fois le fichier réellement déposé.
        onUploadCompleted: async () => {},
      }),
    );
  } catch (err) {
    payload.logger.error(`[media] délivrance du jeton de dépôt échouée : ${err}`);
    return NextResponse.json({ error: "token_failed" }, { status: 502 });
  }
}
