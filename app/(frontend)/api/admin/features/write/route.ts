import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { WriterError, writeFeature } from "@/modules/editorial/lib/feature-writer-server";
import type { WriteRequest } from "@/modules/editorial/lib/feature-writer";

/**
 * POST — « Rédiger avec Claude », étape 3 : les indications et les images des
 * vidéos partent à Claude, la fiche rédigée revient (sans rien enregistrer).
 *
 * Réservé aux admins, comme l'import d'une feature. Le coût de l'appel est
 * renvoyé pour être affiché : chaque rédaction se paie à l'usage.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as WriteRequest | null;
  if (!body || (body.mode !== "new" && body.mode !== "update")) {
    return NextResponse.json({ error: "Demande illisible." }, { status: 400 });
  }
  if (!String(body.notes ?? "").trim() && !(body.steps ?? []).some((s) => s.frames?.length)) {
    return NextResponse.json({ error: "Donnez au moins quelques indications ou une vidéo." }, { status: 400 });
  }

  try {
    const out = await writeFeature(payload, body);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof WriterError) return NextResponse.json({ error: err.message }, { status: 422 });
    payload.logger.error(`[features] rédaction Claude échouée : ${err}`);
    return NextResponse.json({ error: "Claude n'a pas pu rédiger la fiche. Réessayez dans un instant." }, { status: 502 });
  }
}
