import { NextResponse } from "next/server";

import { askAgent, QuestionError } from "@/modules/ads/agent/question";
import { followUpView } from "@/modules/ads/agent/followup-view";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * Le suivi d'une campagne EN LIGNE, dans l'onglet « Agent » (plan Publicité,
 * §9 nonies, étape 7).
 *
 * GET → ce que l'écran montre : rythme des passages, chiffres de la semaine,
 *       alertes, test en cours, derniers bilans de l'analyste, questions.
 * POST { question } → la réponse de l'analyste (Sonnet, sous les plafonds des
 *       agents), gardée dans l'historique des questions.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json(await followUpView(auth.payload, id));
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  try {
    return NextResponse.json(await askAgent(payload, { campaign: Number(id), question: String(body.question ?? ""), userId: user.id }));
  } catch (e) {
    const known = e instanceof QuestionError;
    if (!known) payload.logger.error(`[publicité] question à l'agent sur ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: known ? (e as Error).message : "La question n'a pas pu partir. Voir les journaux." }, { status: known ? 409 : 502 });
  }
}
