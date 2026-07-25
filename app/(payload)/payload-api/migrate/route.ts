import config from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { migrateAllEditorial, migrateOneFeature } from "@/lib/migrate/editorial";

// Route de migration — DEV UNIQUEMENT, temporaire (à retirer après la Phase 3).
// Protégée par la clé PAYLOAD_SECRET. Usage :
//   POST /api/migrate?key=<PAYLOAD_SECRET>&feature=<slug>   → test 1 feature
//   POST /api/migrate?key=<PAYLOAD_SECRET>                  → toutes les features
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Indisponible en production." }, { status: 404 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key || key !== process.env.PAYLOAD_SECRET) {
    return NextResponse.json({ error: "Clé invalide." }, { status: 401 });
  }

  const payload = await getPayload({ config });
  const feature = url.searchParams.get("feature");

  try {
    const report = feature
      ? await migrateOneFeature(payload, feature)
      : await migrateAllEditorial(payload);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
