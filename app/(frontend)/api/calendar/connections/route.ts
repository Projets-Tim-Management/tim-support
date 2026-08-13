import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { providerConfigured, type Connection } from "@/modules/marketing/lib/calendar";

/**
 * Agendas connectés d'un partenaire, pour l'écran de réglage.
 *
 * GET    ?partnerId=…            → connexions + fournisseurs configurés
 * PATCH  { id, calendars }       → quels agendas comptent / lequel reçoit
 * DELETE ?id=…                   → déconnecte
 *
 * Aucun jeton ne sort d'ici : la réponse ne contient que ce qui s'affiche.
 */

async function guard(req: Request, partnerId?: string | null) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return { payload, ok: false as const, status: 401 };
  if (hasAdminRole(user)) return { payload, ok: true as const, user };
  const own = partnerIdOf(user);
  const ok = isPartnerMetier(user) && partnerId != null && String(own) === String(partnerId);
  return { payload, ok, status: 403, user };
}

export async function GET(req: Request) {
  const partnerId = new URL(req.url).searchParams.get("partnerId");
  const { payload, ok, status } = await guard(req, partnerId);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: status ?? 403 });
  if (!partnerId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const res = await payload.find({
    collection: "calendar-connections",
    where: { partner: { equals: Number(partnerId) } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });

  return NextResponse.json({
    providers: {
      google: providerConfigured("google"),
      microsoft: providerConfigured("microsoft"),
    },
    connections: (res.docs as Connection[]).map((c) => ({
      id: c.id,
      provider: c.provider,
      accountEmail: c.accountEmail,
      status: c.status,
      calendars: c.calendars ?? [],
    })),
  });
}

export async function PATCH(req: Request) {
  let body: { id?: number | string; calendars?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const payload = (await guard(req)).payload;
  const current = (await payload
    .findByID({ collection: "calendar-connections", id: body.id, depth: 0, overrideAccess: true })
    .catch(() => null)) as (Connection & { partner?: number | string }) | null;
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { ok } = await guard(req, String(current.partner ?? ""));
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Liste blanche : seuls les deux drapeaux de réglage sont modifiables ici.
  // Un `calendarId` venu du client ne doit pas pouvoir remplacer l'existant.
  const incoming = Array.isArray(body.calendars) ? (body.calendars as Record<string, unknown>[]) : [];
  const flags = new Map(incoming.map((c) => [String(c.calendarId), c]));
  const calendars = (current.calendars ?? []).map((c) => {
    const patch = flags.get(String(c.calendarId));
    return patch ? { ...c, busy: Boolean(patch.busy), target: Boolean(patch.target) } : c;
  });

  await payload.update({
    collection: "calendar-connections",
    id: body.id,
    data: { calendars },
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const payload = (await guard(req)).payload;
  const current = (await payload
    .findByID({ collection: "calendar-connections", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as { partner?: number | string } | null;
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { ok } = await guard(req, String(current.partner ?? ""));
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await payload.delete({ collection: "calendar-connections", id, overrideAccess: true });
  return NextResponse.json({ ok: true });
}
