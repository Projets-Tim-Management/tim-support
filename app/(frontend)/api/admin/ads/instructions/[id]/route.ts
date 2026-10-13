import { NextResponse } from "next/server";

import { instructionGesture, parseInstructionGesture } from "@/modules/ads/lib/notebook-actions";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * POST /api/admin/ads/instructions/:id
 *   { action: "activer", text, scope: "campagne" | "global" } | { action: "ecarter" }
 *
 * Confirme ou écarte une consigne proposée (née d'un refus de créa). Les règles
 * du geste sont dans lib/notebook-actions ; qui a confirmé et quand, dans le
 * hook de la collection.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;

  const g = parseInstructionGesture((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!g) return NextResponse.json({ error: "Geste attendu : activer ou écarter." }, { status: 400 });
  const row = await payload.findByID({ collection: "ad-instructions", id, depth: 0, overrideAccess: true }).catch(() => null);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const out = instructionGesture(row as never, g);
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 409 });

  // `user` passé : le hook signe la confirmation à son nom.
  await payload.update({ collection: "ad-instructions", id, data: out.data as never, user, overrideAccess: true });
  return NextResponse.json({ status: out.data.status });
}
