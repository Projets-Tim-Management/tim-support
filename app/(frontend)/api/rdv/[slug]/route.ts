import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { availability, book, checkInput, loadType } from "@/modules/booking/lib/engine";
import { prefillFromSubmission, verifySubmissionRef } from "@/modules/booking/lib/prefill";
import { createRateLimiter, maskIp } from "@/modules/analytics/lib/video-views";
import { clientIp } from "@/modules/forms/lib/ingest";

/**
 * La page publique d'un type de rendez-vous (/rdv/<adresse>) :
 *
 *  GET  → les créneaux libres (sans dire qui reçoit : ça se décide à la réservation) ;
 *  POST { at, firstName, lastName, email, phone, company, answers, demande?, tracking? } → réserve.
 *
 * Page publique, sans session : le créneau demandé est revérifié contre l'offre du moment (date arbitraire, conflit
 * d'agenda, double réservation), l'index unique couvre les deux clics à la même seconde, un champ leurre écarte les
 * robots et un débit borné les scripts. Voir modules/booking/lib/engine : une réservation n'est jamais perdue.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });
const limiter = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });
const TRACK_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "referrer", "landingPath", "sourcePagePath", "gclid", "msclkid", "fbclid", "oaiclid"];

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await payloadClient();
  const t = await loadType(payload, slug);
  if (!t) return fail("unknown_type", 404);
  const av = await availability(payload, t);
  return NextResponse.json({ slots: av.slots.map((s) => s.at), durationMin: t.durationMin }, { headers: NO_STORE });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("bad_body", 400);
  // Robot : on fait comme si tout allait bien, sans rien réserver.
  if (body.website) return NextResponse.json({ ok: true }, { headers: NO_STORE });
  const payload = await payloadClient();
  const { ip } = clientIp(req);
  if (ip && !limiter.hit(ip)) {
    payload.logger.warn(`[rendez-vous] débit de réservation dépassé pour ${maskIp(ip)}.`);
    return fail("rate_limited", 429, { message: "Trop d'essais : réessayez dans une heure, ou appelez-nous." });
  }
  const t = await loadType(payload, slug);
  if (!t) return fail("unknown_type", 404);
  // Venu du formulaire de contact : ce que sa demande dit déjà n'a pas été redemandé.
  const demande = verifySubmissionRef(body.demande);
  const known = demande ? await prefillFromSubmission(payload, demande) : null;
  const checked = checkInput(t, body, known ? { person: known, answers: known.answers } : {});
  if (!checked.ok) return fail("invalid", 400, { field: checked.field, message: checked.message });
  if (typeof body.at !== "string" || !Number.isFinite(Date.parse(body.at))) return fail("missing_slot", 400, { message: "Choisissez un créneau." });
  const raw = (body.tracking && typeof body.tracking === "object" ? body.tracking : {}) as Record<string, unknown>;
  const tracking = Object.fromEntries(TRACK_KEYS.flatMap((k) => (typeof raw[k] === "string" && (raw[k] as string).trim() ? [[k, (raw[k] as string).trim().slice(0, 500)]] : [])));
  const r = await book(payload, t, { at: new Date(body.at).toISOString(), person: checked.person, answers: checked.answers, location: checked.location, tracking, submission: demande });
  if (!r.ok) return fail("refused", r.status, { message: r.error });
  // Sans le nom de qui reçoit : c'est TIM Management, côté prospect.
  return NextResponse.json({ ok: true, start: r.booking.start, end: r.booking.end, meetingUrl: r.booking.meetingUrl, token: r.booking.manage, message: t.confirmationMessage, redirectUrl: t.redirectUrl }, { headers: NO_STORE });
}
