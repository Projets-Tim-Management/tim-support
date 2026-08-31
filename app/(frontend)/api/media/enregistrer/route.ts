import { NextResponse } from "next/server";
import { sanitizeFilename } from "payload/shared";

import { isBackoffice } from "@/core/access";
import { urlDuFichier } from "@/core/lib/media-store";
import { payloadClient } from "@/core/payload-client";

/**
 * POST /api/media/enregistrer — crée (ou remplace) le média d'un fichier
 * DÉJÀ déposé sur le CDN par le navigateur.
 *
 * ── Pourquoi cette route existe ──────────────────────────────────────────────
 *
 * Payload sait recevoir un fichier déposé côté client, mais son API REST ne
 * permet pas de lui passer `overwriteExistingFiles`. Sans ce drapeau, il
 * RENOMME : un second « demo.gif » devient « demo-1.gif » en base — alors que
 * le fichier, lui, a été déposé sous « demo.gif ». Le document désigne alors un
 * objet qui n'existe pas : l'image est en ligne ET introuvable. C'est le piège
 * exact qu'ouvre le dépôt direct, et il ne se voit qu'à l'affichage.
 *
 * L'API locale, elle, accepte ce drapeau. D'où cette route.
 *
 * ── Ce qu'elle garantit ──────────────────────────────────────────────────────
 *
 *  - le nom enregistré est EXACTEMENT la clé déposée sur le CDN ;
 *  - un fichier réenvoyé sous le même nom REMPLACE le précédent, sans créer de
 *    doublon et surtout SANS CHANGER D'IDENTIFIANT : les fiches qui l'utilisent
 *    continuent de pointer dessus, et voient la nouvelle version ;
 *  - le serveur ne redépose rien (`clientUploadContext`) — il ne relit le
 *    fichier que pour en tirer ses dimensions et son type réel.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Corps = { filename?: unknown; mimeType?: unknown; size?: unknown };

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!isBackoffice({ req: { user } } as never)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const corps = (await req.json().catch(() => null)) as Corps | null;
  const brut = typeof corps?.filename === "string" ? corps.filename : "";
  if (!brut) return NextResponse.json({ error: "missing_filename" }, { status: 400 });

  // Même assainissement que le navigateur et que Payload : les trois doivent
  // aboutir au même nom, sinon on cherche un fichier là où il n'est pas.
  let filename: string;
  try {
    filename = sanitizeFilename(brut);
  } catch {
    return NextResponse.json({ error: "invalid_filename" }, { status: 400 });
  }

  const url = urlDuFichier(process.env.BLOB_READ_WRITE_TOKEN, filename);
  if (!url) return NextResponse.json({ error: "storage_not_configured" }, { status: 501 });

  // Relecture du fichier déposé. L'adresse est CONSTRUITE à partir du nom, pas
  // reçue du client : voir core/lib/media-store.
  let donnees: Buffer;
  let typeReel: string;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      payload.logger.warn(`[media] fichier déposé introuvable sur le stockage : ${filename}`);
      return NextResponse.json({ error: "file_not_found" }, { status: 404 });
    }
    donnees = Buffer.from(await res.arrayBuffer());
    typeReel =
      res.headers.get("content-type") ||
      (typeof corps?.mimeType === "string" ? corps.mimeType : "application/octet-stream");
  } catch (err) {
    payload.logger.error(`[media] relecture de « ${filename} » échouée : ${err}`);
    return NextResponse.json({ error: "read_failed" }, { status: 502 });
  }

  const file = {
    data: donnees,
    mimetype: typeReel,
    name: filename,
    size: donnees.byteLength,
    // Dit au stockage que le fichier est DÉJÀ en place : sans cela il le
    // redéposerait, et le CDN refuserait d'écrire deux fois la même clé.
    clientUploadContext: { prefix: "" },
  } as never;

  // Un média porte-t-il déjà ce nom ? On le REMPLACE plutôt que d'en créer un
  // second : l'identifiant est conservé, donc les fiches qui l'utilisent
  // reçoivent la nouvelle version au lieu de garder l'ancienne.
  const existant = (
    await payload.find({
      collection: "media",
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as { id: number | string } | undefined;

  try {
    const doc = existant
      ? await payload.update({
          collection: "media",
          id: existant.id,
          data: {},
          file,
          overwriteExistingFiles: true,
          user,
          req: { user } as never,
        })
      : await payload.create({
          collection: "media",
          data: {},
          file,
          overwriteExistingFiles: true,
          user,
          req: { user } as never,
        });

    payload.logger.info(
      `[media] « ${filename} » ${existant ? "remplacé" : "ajouté"} (${donnees.byteLength} octets).`,
    );
    return NextResponse.json({ doc, remplace: Boolean(existant) });
  } catch (err) {
    payload.logger.error(`[media] enregistrement de « ${filename} » échoué : ${err}`);
    return NextResponse.json(
      { errors: [{ message: "Le serveur n'a pas pu enregistrer ce fichier." }] },
      { status: 400 },
    );
  }
}
