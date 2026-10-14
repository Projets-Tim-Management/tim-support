import { NextResponse } from "next/server";

import { describeRush } from "@/modules/ads/lib/rush-describe";
import { AdsBudgetError } from "@/modules/ads/lib/spend";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * POST /api/admin/ads/rushes/:id/description  { action: "valider" | "ecarter" | "reproposer" }
 *
 * La description détaillée proposée par l'IA (plan Publicité, §9 sexies, D1c) :
 * le clic EST l'action. « Valider » la rend lisible par les agents ;
 * « Écarter » la met de côté ; « Reproposer » relance l'IA — après avoir
 * corrigé ce qu'on voit, par exemple (quelques centimes, plafond des textes).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const body = (await req.json().catch(() => ({}))) as { action?: string };

  const rush = (await payload.findByID({ collection: "ad-rushes", id, depth: 0, overrideAccess: true }).catch(() => null)) as {
    processing?: { status?: string } | null;
    ai?: { proposal?: string | null } | null;
  } | null;
  if (!rush) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (rush.processing?.status !== "pret") return NextResponse.json({ error: "Le rush n'est pas encore converti." }, { status: 409 });

  if (body.action === "reproposer") {
    try {
      await describeRush(payload, id);
      return NextResponse.json({ status: "proposee" });
    } catch (e) {
      const known = e instanceof AdsBudgetError;
      if (!known) payload.logger.error(`[publicité] description du rush ${id} : ${(e as Error).message}`);
      return NextResponse.json({ error: known ? (e as Error).message : `Description impossible : ${(e as Error).message}` }, { status: known ? 409 : 502 });
    }
  }
  if (body.action !== "valider" && body.action !== "ecarter") return NextResponse.json({ error: "Geste attendu : valider, écarter ou reproposer." }, { status: 400 });
  if (!rush.ai?.proposal) return NextResponse.json({ error: "Aucune description proposée." }, { status: 409 });
  await payload.update({ collection: "ad-rushes", id, data: { ai: { ...rush.ai, status: body.action === "valider" ? "validee" : "ecartee" } } as never, depth: 0, overrideAccess: true });
  return NextResponse.json({ status: body.action === "valider" ? "validee" : "ecartee" });
}
