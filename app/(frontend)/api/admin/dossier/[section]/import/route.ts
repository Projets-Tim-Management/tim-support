import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { runImport, type ImportBody } from "@/modules/marketing/lib/dossier-import";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";

/**
 * POST /api/admin/dossier/<section>/import?clientId=… — côté TIM.
 *
 * Même traitement que l'espace client, et c'est le but : la console de
 * préparation sert à reprendre le fichier d'un client au téléphone, souvent
 * après transmission. Ne changent que les deux questions de la porte — un admin
 * plutôt qu'une session client, le client donné par l'URL plutôt que par un
 * cookie signé.
 *
 * Pas de verrou « dossier transmis » ici, comme pour la saisie manuelle : c'est
 * justement TIM qui corrige après.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!hasAdminRole(user) || !clientId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as ImportBody | null;
  const { status, body: out } = await runImport(payload, section, clientId, body);
  return NextResponse.json(out, { status });
}
