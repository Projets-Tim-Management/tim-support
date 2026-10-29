import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { WriterError, applyFeature, type ApplyRequest } from "@/modules/editorial/lib/feature-writer-server";

/**
 * POST — « Rédiger avec Claude », étape 4 : la fiche relue et validée est
 * enregistrée EN BROUILLON (nouvelle fiche, ou mise à jour qui garde les
 * visuels existants), avec les vidéos déjà déposées par la fenêtre.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as ApplyRequest | null;
  if (!body?.feature?.title?.trim()) return NextResponse.json({ error: "La fiche doit avoir un titre." }, { status: 400 });

  try {
    const id = await applyFeature(payload, user, body);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof WriterError) return NextResponse.json({ error: err.message }, { status: 404 });
    payload.logger.error(`[features] enregistrement de la fiche rédigée échoué : ${err}`);
    const cause = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Enregistrement impossible : ${cause.slice(0, 300)}` }, { status: 400 });
  }
}
