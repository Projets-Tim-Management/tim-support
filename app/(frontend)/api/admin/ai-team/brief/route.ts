import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { decideProposal, runBriefAssistant } from "@/modules/ai-team/lib/brief";

/**
 * La fiche produit & positionnement, côté direction (14/11/2026) :
 *  - POST { run: true } — l'assistant rédige ou relit la fiche, et dépose ses propositions ;
 *  - POST { section, mode } ou { quote, mode } — accepter (« remplacer », « ajouter ») ou « ignorer » une proposition.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const body = (await req.json().catch(() => ({}))) as { run?: unknown; section?: unknown; quote?: unknown; mode?: unknown };
  if (body.run === true) {
    try {
      return NextResponse.json({ ok: true, ...(await runBriefAssistant(payload)) });
    } catch (e) {
      payload.logger.error(`[équipe IA] fiche produit : ${e instanceof Error ? e.message : String(e)}`);
      return NextResponse.json({ error: "La relecture n'a pas abouti. Réessayez dans un instant." }, { status: 502 });
    }
  }
  const mode = String(body.mode ?? "");
  if (!["remplacer", "ajouter", "ignorer"].includes(mode)) return NextResponse.json({ error: "Demande incomplète." }, { status: 400 });
  await decideProposal(payload, { section: typeof body.section === "string" ? body.section : undefined, quote: typeof body.quote === "string" ? body.quote : undefined, mode: mode as "remplacer" | "ajouter" | "ignorer" });
  return NextResponse.json({ ok: true });
}
