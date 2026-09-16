import { NextResponse } from "next/server";

import { buildAssistant } from "@/admin/assistant/data-assistant";
import { isAiConfigured } from "@/core/lib/ai-assistant";
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
  // `ai` : le champ de question n'apparaît que si Claude est branché.
  return NextResponse.json({ ...data, ai: isAiConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
