import { NextResponse } from "next/server";

import { importCreativeFile, ImportError, removeCreativeFile, type ImportRequest } from "@/modules/ads/lib/creative-import";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * POST   /api/admin/ads/creatives/:id/files { url, pathname, filename, mime, bytes, width, height, durationSec }
 *        → enregistre un fichier fini déposé sur le stockage (voir lib/creative-import).
 * DELETE /api/admin/ads/creatives/:id/files { url } → le retire, avant validation.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r: ImportRequest = {
    url: String(b.url ?? ""),
    pathname: typeof b.pathname === "string" ? b.pathname : null,
    filename: String(b.filename ?? ""),
    mime: String(b.mime ?? ""),
    bytes: num(b.bytes),
    width: num(b.width),
    height: num(b.height),
    durationSec: typeof b.durationSec === "number" && Number.isFinite(b.durationSec) ? b.durationSec : null,
  };
  try {
    const out = await importCreativeFile(payload, id, r);
    payload.logger.info(`[publicité] créa ${id} : ${out.file.format} ${out.file.kind} importé${out.replaced ? " (remplace l'ancien)" : ""}.`);
    return NextResponse.json(out);
  } catch (e) {
    const known = e instanceof ImportError;
    if (!known) payload.logger.error(`[publicité] import d'un fichier de la créa ${id} échoué : ${(e as Error).message}`);
    return NextResponse.json({ error: known ? (e as Error).message : "Import impossible. Réessayez." }, { status: known ? 409 : 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const b = (await req.json().catch(() => ({}))) as { url?: unknown };
  try {
    await removeCreativeFile(payload, id, String(b.url ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const known = e instanceof ImportError;
    return NextResponse.json({ error: known ? (e as Error).message : "Retrait impossible." }, { status: known ? 409 : 500 });
  }
}
