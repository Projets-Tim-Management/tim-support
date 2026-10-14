import { NextResponse } from "next/server";

import { addIdea, decide, duplicate, proposeImprovement, restoreVersion, toDevelopment } from "@/modules/ads/lib/element-atelier";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { FinalError } from "@/modules/ads/lib/rush-process";
import { AdsBudgetError } from "@/modules/ads/lib/spend";

/**
 * POST /api/admin/ads/elements/:id  { action, … } — les gestes de l'atelier
 * des éléments, sur l'élément :id (plan Publicité). Le clic EST le geste :
 *   idee { texte }                    une idée dans le fil
 *   proposer                          l'IA propose une amélioration (réglages vérifiés)
 *   decider { note, decision }        appliquer | variante | ecarter une proposition
 *   dupliquer                         une copie en variante brouillon
 *   restaurer { version }             revenir à une version passée
 *   developpement { note }            transmettre une idée hors réglages au Suivi des développements
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const body = (await req.json().catch(() => ({}))) as { action?: string; texte?: string; note?: number; decision?: string; version?: number };
  try {
    switch (body.action) {
      case "idee":
        return NextResponse.json(await addIdea(payload, id, String(body.texte ?? ""), user.id));
      case "proposer":
        return NextResponse.json(await proposeImprovement(payload, id));
      case "decider": {
        const d = body.decision;
        if (d !== "appliquer" && d !== "variante" && d !== "ecarter") return NextResponse.json({ error: "Décision attendue : appliquer, variante ou ecarter." }, { status: 400 });
        return NextResponse.json(await decide(payload, Number(body.note), d, user.id));
      }
      case "dupliquer":
        return NextResponse.json(await duplicate(payload, id));
      case "restaurer":
        return NextResponse.json(await restoreVersion(payload, id, Number(body.version)));
      case "developpement":
        return NextResponse.json(await toDevelopment(payload, Number(body.note), user.id, new URL(req.url).origin));
      default:
        return NextResponse.json({ error: "Geste inconnu." }, { status: 400 });
    }
  } catch (e) {
    const known = e instanceof FinalError || e instanceof AdsBudgetError;
    if (!known) payload.logger.error(`[publicité] atelier des éléments, élément ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: known ? (e as Error).message : `Impossible : ${(e as Error).message}` }, { status: known ? 409 : 502 });
  }
}
