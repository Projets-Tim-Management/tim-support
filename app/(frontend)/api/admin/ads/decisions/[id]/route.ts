import { NextResponse } from "next/server";

import { AccountUnavailable } from "@/modules/ads/lib/account-access";
import { ActionError, reviewAction } from "@/modules/ads/lib/actions-run";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * POST /api/admin/ads/decisions/:id { choix: "valider" | "refuser" } — Charlie
 * tranche une action proposée par l'agent (budget, pause, réactivation). Valider
 * la rejuge aux garde-fous puis l'applique chez Meta (voir lib/actions-run).
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const { choix } = (await req.json().catch(() => ({}))) as { choix?: string };
  if (choix !== "valider" && choix !== "refuser") return NextResponse.json({ error: "Choix attendu : valider ou refuser." }, { status: 400 });
  try {
    return NextResponse.json(await reviewAction(payload, id, choix, user.id));
  } catch (e) {
    const known = e instanceof ActionError || e instanceof AccountUnavailable;
    if (!known) payload.logger.error(`[publicité] décision ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: (e as Error).message }, { status: known ? 409 : 502 });
  }
}
