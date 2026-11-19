import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { ActionError, setImage } from "@/modules/editorial/lib/articles/actions";

/**
 * POST — l'image principale d'un article, créée dans Claude Design par la direction, avec son
 * texte alternatif et sa légende (champs « alt » et « caption ») : envoyée dans la médiathèque
 * WordPress, posée en image principale. Un article « Image à faire » prend ensuite le premier
 * créneau libre ; un article publié garde sa place. Réservé aux administrateurs.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Le fichier n'est pas une image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image trop lourde (15 Mo au plus)." }, { status: 400 });
  try {
    const out = await setImage(payload, id, { data: new Uint8Array(await file.arrayBuffer()), name: file.name }, { alt: String(form?.get("alt") ?? ""), caption: String(form?.get("caption") ?? "") });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    payload.logger.error(`[articles] image de ${id} : ${e}`);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof ActionError ? 409 : 502 });
  }
}
