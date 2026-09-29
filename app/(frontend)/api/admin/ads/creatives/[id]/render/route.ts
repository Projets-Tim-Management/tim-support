import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";
import { renderCreativeVisuals } from "@/modules/ads/lib/render/visuals";
import { TEMPLATES, type TemplateKey } from "@/modules/ads/lib/render/templates";

/**
 * POST /api/admin/ads/creatives/:id/render  { template? }
 *
 * Rend (ou rend de nouveau) les visuels d'une créa dans les trois formats —
 * « Changer de visuel » dans la file de validation. Gratuit : aucun appel à un
 * service payant, le rendu se fait dans la fonction.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;

  const body = (await req.json().catch(() => ({}))) as { template?: string };
  const template = TEMPLATES.find((t) => t.key === body.template)?.key as TemplateKey | undefined;
  try {
    return NextResponse.json(await renderCreativeVisuals(payload, id, { template }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
