import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { loadCelebrations } from "@/modules/ai-team/lib/celebrations";

/**
 * Les objectifs atteints que la direction n'a pas encore fêtés (16/11/2026 : « quand un objectif est atteint, je veux
 * un feu d'artifice sur l'écran avec un popup pour féliciter et motiver ») :
 *
 *  - GET — clôt d'abord les objectifs atteints (valeur du jour relue à la source, au plus tous les quarts d'heure),
 *    puis rend ceux à fêter ;
 *  - POST { id } — la direction l'a vu : il ne revient plus.
 *
 * Réservé à la direction (les autres reçoivent une liste vide, sans erreur : le composant est sur toutes les pages).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return NextResponse.json({ goals: [] });
  return NextResponse.json({ goals: await loadCelebrations(auth.payload).catch(() => []) });
}

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = String(body.id ?? "");
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Objectif inconnu." }, { status: 400 });
  await auth.payload.update({ collection: "ai-team-goals", id, data: { celebratedAt: new Date().toISOString() } as never, overrideAccess: true }).catch(() => null);
  return NextResponse.json({ ok: true });
}
