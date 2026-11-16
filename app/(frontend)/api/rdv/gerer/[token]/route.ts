import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { availability, bookingByToken, cancel, canChange, reschedule } from "@/modules/booking/lib/engine";

/**
 * Le lien « déplacer ou annuler » des e-mails (/rdv/gerer/<jeton>) :
 *
 *  GET  → les créneaux pour le déplacer (si c'est encore permis) ;
 *  POST { action: "deplacer", at } | { action: "annuler", motif } → le fait.
 *
 * Le jeton (aléatoire, 24 caractères) vaut accès à CE rendez-vous seul. Les règles du type (déplacement et
 * annulation permis, jusqu'à N heures avant) sont revérifiées ici.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (message: string, status: number) => NextResponse.json({ error: message, message }, { status, headers: NO_STORE });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await payloadClient();
  const found = await bookingByToken(payload, token);
  if (!found) return fail("Rendez-vous introuvable.", 404);
  if (canChange(found.type, found.booking, "deplacer", new Date())) return NextResponse.json({ slots: [] }, { headers: NO_STORE });
  const av = await availability(payload, found.type, new Date(), String(found.booking.id));
  return NextResponse.json({ slots: av.slots.map((s) => s.at), durationMin: found.type.durationMin }, { headers: NO_STORE });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; at?: unknown; motif?: unknown };
  const payload = await payloadClient();
  if (body.action === "deplacer") {
    if (typeof body.at !== "string" || !Number.isFinite(Date.parse(body.at))) return fail("Choisissez un créneau.", 400);
    const r = await reschedule(payload, token, new Date(body.at).toISOString());
    return r.ok ? NextResponse.json({ ok: true, start: r.booking.start, end: r.booking.end, meetingUrl: r.booking.meetingUrl }, { headers: NO_STORE }) : fail(r.error, r.status);
  }
  if (body.action === "annuler") {
    const r = await cancel(payload, token, typeof body.motif === "string" ? body.motif : "");
    return r.ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : fail(r.error, r.status);
  }
  return fail("Action inconnue.", 400);
}
