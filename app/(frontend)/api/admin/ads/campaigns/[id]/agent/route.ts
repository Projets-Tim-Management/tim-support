import { after, NextResponse } from "next/server";

import { tickRun } from "@/modules/ads/agent/engine";
import { agentDeps, launchRun, LaunchError, previewRun, runStatus } from "@/modules/ads/agent/run";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * L'agent de campagne, depuis l'onglet « Agent » d'une campagne (plan, §9 quater).
 *
 * GET  ?cap=2 → avant le clic : ce que l'agent va lire, ce que le passage peut
 *      coûter au plus, ce qui bloquerait le lancement ; et le dernier passage.
 * POST { objective, capEur } → lance le passage, répond tout de suite, et le fait
 *      avancer après la réponse ; le cron (chaque minute) prend le relais.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/** Marge avant la fin de la fonction : la dernière étape doit s'y terminer (voir STEP_MAX_MS). */
const deadline = (start: number) => new Date(start + (maxDuration - 20) * 1000);
const cap = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const [preview, last] = await Promise.all([previewRun(payload, id, cap(new URL(req.url).searchParams.get("cap"))), runStatus(payload, id)]);
  return NextResponse.json({ preview, last });
}

export async function POST(req: Request, { params }: Params) {
  const start = Date.now();
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const body = (await req.json().catch(() => ({}))) as { objective?: unknown; capEur?: unknown };
  try {
    const run = await launchRun(payload, { campaign: id, objective: String(body.objective ?? ""), capEur: cap(body.capEur), userId: user.id });
    payload.logger.info(`[publicité] agent lancé sur la campagne ${id} : passage ${run.id}, budget ${run.budgetEur} €.`);
    after(async () => {
      try {
        await tickRun(agentDeps(payload), run.id, deadline(start));
      } catch (e) {
        payload.logger.error(`[publicité] passage ${run.id} : ${(e as Error).message}`);
      }
    });
    return NextResponse.json(run);
  } catch (e) {
    const known = e instanceof LaunchError;
    if (!known) payload.logger.error(`[publicité] lancement de l'agent sur ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: known ? (e as Error).message : "Lancement impossible. Voir les journaux." }, { status: known ? 409 : 502 });
  }
}
