import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";
import { importCollectionOf } from "@/modules/ads/lib/rushes";

/**
 * POST /api/admin/ads/rushes/:id/reconvertir — remet un rush en échec dans la
 * file de conversion, compteur d'essais à zéro (plan Publicité, §9 sexies).
 * Le geste après une correction : pas besoin de réimporter le fichier.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  // Les inspirations passent par la même route (« ?collection=ad-inspirations ») ; toute autre valeur désigne les rushes.
  const collection = importCollectionOf(req.url);
  const rush = (await payload.findByID({ collection, id, depth: 0, overrideAccess: true }).catch(() => null)) as { processing?: { status?: string } | null } | null;
  if (!rush) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (rush.processing?.status !== "echec") return NextResponse.json({ error: "Seul un rush en échec se relance." }, { status: 409 });
  await payload.update({
    collection,
    id,
    data: { processing: { status: "en-attente", error: null, attempts: 0, leaseUntil: null, processedAt: null } } as never,
    depth: 0,
    overrideAccess: true,
  });
  return NextResponse.json({ status: "en-attente" });
}
