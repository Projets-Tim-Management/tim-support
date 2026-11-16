import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { recordHeardFrom } from "@/modules/booking/lib/engine";
import { isHeardFrom } from "@/modules/booking/lib/heard-from";
import { verifySubmissionRef } from "@/modules/booking/lib/prefill";

/**
 * « Comment nous avez-vous connus ? » — un clic. POST { reponse, jeton? | demande? } : le jeton d'un rendez-vous
 * (écran « C'est confirmé ») ou la référence signée d'une demande (e-mail d'accusé de réception). Une référence
 * inconnue ou trafiquée ne touche à rien. Voir modules/booking/lib/heard-from.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { reponse?: unknown; jeton?: unknown; demande?: unknown };
  if (!isHeardFrom(body.reponse)) return NextResponse.json({ error: "Réponse inconnue." }, { status: 400 });
  const token = typeof body.jeton === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(body.jeton) ? body.jeton : null;
  const submission = token ? null : verifySubmissionRef(body.demande);
  if (!token && !submission) return NextResponse.json({ error: "Référence inconnue." }, { status: 400 });
  const payload = await payloadClient();
  const ok = await recordHeardFrom(payload, { token, submission }, body.reponse);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Référence inconnue." }, { status: 404 });
}
