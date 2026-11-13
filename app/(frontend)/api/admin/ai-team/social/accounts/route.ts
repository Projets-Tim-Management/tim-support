import { NextResponse } from "next/server";

import { isDirection } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { connectMeta, disconnectSocial } from "@/modules/ai-team/lib/social-accounts";

/**
 * Les comptes de réseaux de Cléo — réservé à la direction.
 *  POST   { token, page? } : brancher la page Facebook (et son Instagram) avec un jeton d'utilisateur système ;
 *  DELETE { platform }     : débrancher YouTube ou Facebook / Instagram.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; page?: unknown };
  if (typeof body.token !== "string" || !body.token.trim()) return NextResponse.json({ error: "Collez le jeton." }, { status: 400 });
  try {
    return NextResponse.json(await connectMeta(auth.payload, body.token, typeof body.page === "string" ? body.page : undefined));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const auth = await adminRequest(req, isDirection, "reserve-direction");
  if ("response" in auth) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { platform?: unknown };
  if (body.platform !== "youtube" && body.platform !== "meta") return NextResponse.json({ error: "Réseau inconnu." }, { status: 400 });
  await disconnectSocial(auth.payload, body.platform);
  return NextResponse.json({ ok: true });
}
