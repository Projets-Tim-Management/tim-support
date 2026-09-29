import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
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
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { template?: string };
  const template = TEMPLATES.find((t) => t.key === body.template)?.key as TemplateKey | undefined;
  try {
    return NextResponse.json(await renderCreativeVisuals(payload, id, { template }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
