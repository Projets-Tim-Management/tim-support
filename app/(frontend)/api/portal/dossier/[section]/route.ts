import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { isDossierLocked } from "@/modules/marketing/lib/onboarding";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { deleteRow, listRows, saveRow } from "@/modules/marketing/lib/dossier-rows";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";

/**
 * Lecture et écriture d'une section du dossier de démarrage, depuis l'espace
 * client.
 *
 * Trois règles non négociables, toutes appliquées ici :
 *  1. le CLIENT vient de la session (cookie signé), jamais du corps de la
 *     requête — sinon n'importe qui écrirait dans le dossier d'une autre
 *     entreprise en changeant un identifiant ;
 *  2. seuls les champs déclarés dans le registre sont acceptés (liste blanche) ;
 *  3. un dossier transmis ou validé est en lecture seule.
 */

// La règle vit dans onboarding.ts, partagée avec les écrans.

export async function GET(_req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const payload = await payloadClient();
  return NextResponse.json({
    docs: await listRows(payload, section, ctx.client.id),
    locked: isDossierLocked(ctx.client.onboardingStatus),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (isDossierLocked(ctx.client.onboardingStatus)) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  const payload = await payloadClient();
  // Le client est FORCÉ depuis la session, quoi qu'annonce le corps.
  const result = await saveRow(payload, section, ctx.client.id, body);
  if (!result.ok) {
    return NextResponse.json(result.errors ? { errors: result.errors } : { error: "not_found" }, {
      status: result.status,
    });
  }
  return NextResponse.json({ ok: true, doc: result.doc });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (isDossierLocked(ctx.client.onboardingStatus)) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const payload = await payloadClient();
  // Même précaution qu'à la mise à jour : la suppression est bornée au client.
  await deleteRow(payload, section, ctx.client.id, id);

  return NextResponse.json({ ok: true });
}
