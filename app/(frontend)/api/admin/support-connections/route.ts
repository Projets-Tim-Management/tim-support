import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { SUPPORT_CONNECTIONS, type SupportConnection } from "@/core/lib/support-connections";
import { testConnection } from "@/core/lib/support-connections-test";

/**
 * POST /api/admin/support-connections
 *   { key, action: "test" }            → lance le test, mémorise le résultat
 *   { key, action: "notes", notes }    → enregistre les notes
 * → { entry }
 *
 * Admins seulement. Aucune clé ne transite ici, dans un sens ni dans l'autre.
 */
type Entry = { key: string; notes?: string | null; lastTestAt?: string | null; lastTestOk?: boolean | null; lastTestMessage?: string | null };

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { key?: string; action?: string; notes?: string };
  const key = body.key as SupportConnection["key"];
  if (!SUPPORT_CONNECTIONS.some((c) => c.key === key)) return NextResponse.json({ error: "unknown_connection" }, { status: 400 });

  const global = (await payload.findGlobal({ slug: "support-connections", depth: 0, overrideAccess: true })) as { entries?: Entry[] | null };
  const entries = [...(global.entries ?? [])];
  const idx = entries.findIndex((e) => e.key === key);
  const current: Entry = idx >= 0 ? entries[idx] : { key };

  let next: Entry;
  if (body.action === "test") {
    const r = await testConnection(key, payload);
    next = { ...current, lastTestAt: r.at, lastTestOk: r.ok, lastTestMessage: r.message };
    payload.logger.info(`[connexions] test ${key} par ${user.email} : ${r.ok ? "OK" : "ÉCHEC"} — ${r.message}`);
  } else if (body.action === "notes") {
    next = { ...current, notes: typeof body.notes === "string" ? body.notes : current.notes };
  } else {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  if (idx >= 0) entries[idx] = next;
  else entries.push(next);
  await payload.updateGlobal({ slug: "support-connections", data: { entries } as never, overrideAccess: true });

  return NextResponse.json({ entry: next });
}
