import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { runImport, type ImportBody } from "@/modules/marketing/lib/dossier-import";
import { isDossierLocked } from "@/modules/marketing/lib/onboarding";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

/**
 * POST /api/portal/dossier/<section>/import — côté client.
 *
 * La route ne répond qu'aux deux questions qui lui sont propres : qui appelle
 * (une session de l'espace client) et si son dossier est encore modifiable. Le
 * traitement est celui de `runImport`, partagé avec la console de préparation.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (isDossierLocked(ctx.client.onboardingStatus)) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as ImportBody | null;
  const payload = await payloadClient();
  const { status, body: out } = await runImport(payload, section, ctx.client.id, body);
  return NextResponse.json(out, { status });
}
