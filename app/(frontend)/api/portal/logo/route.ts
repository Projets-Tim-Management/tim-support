import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

/**
 * POST /api/portal/logo — le client dépose le logo de son entreprise.
 *
 * Pourquoi une route dédiée plutôt que l'API media : un compte d'espace client
 * n'est PAS un compte back-office. Il n'a aucun droit sur `media` (création
 * réservée à `isBackoffice`), et c'est très bien ainsi — lui ouvrir cette
 * collection reviendrait à laisser un client déposer n'importe quoi dans la
 * bibliothèque du site. On passe donc par ici, avec `overrideAccess`, après
 * avoir vérifié la session ET le fichier.
 *
 * Le logo est rattaché à SON entreprise, celle du cookie signé — jamais à un
 * identifiant reçu dans la requête.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  // Contrôles refaits ICI et pas seulement dans le champ de l'écran : l'attribut
  // `accept` d'un input oriente le sélecteur de fichiers, il n'empêche rien.
  if (!TYPES.includes(file.type)) {
    return NextResponse.json({ error: "bad_type" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const payload = await payloadClient();

  try {
    const media = await payload.create({
      collection: "media",
      overrideAccess: true,
      data: { alt: `Logo ${ctx.client.companyName ?? "client"}` },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        name: file.name,
        size: file.size,
      },
    });

    await payload.update({
      collection: "partner-clients",
      id: ctx.client.id,
      data: { logo: media.id },
      overrideAccess: true,
    });

    return NextResponse.json({ ok: true, url: media.url ?? null });
  } catch (err) {
    payload.logger.error(`[espace-client] dépôt du logo (client ${ctx.client.id}) échoué : ${err}`);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
