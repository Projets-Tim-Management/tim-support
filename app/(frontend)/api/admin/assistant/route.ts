import { NextResponse } from "next/server";

import { buildAssistant } from "@/admin/assistant/data-assistant";
import { payloadClient } from "@/core/payload-client";

/**
 * GET /api/admin/assistant → ce que l'assistant a à dire à l'utilisateur
 * connecté (voir admin/assistant/data-assistant.ts). Scopé par son rôle.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await buildAssistant(payload, user as never);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
