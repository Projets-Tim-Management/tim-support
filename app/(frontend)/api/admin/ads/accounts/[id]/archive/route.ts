import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { statusFromTokens, type AccountTokens } from "@/modules/ads/lib/accounts";

/**
 * POST /api/admin/ads/accounts/:id/archive  { archived: boolean }
 *
 * Archiver : le compte n'est plus synchronisé, ses campagnes et ses chiffres
 * restent. Réactiver : l'état se recalcule d'après les jetons STOCKÉS — lus en
 * brut, car le jeton OAuth n'est pas lisible par l'API et le jeton système y est
 * masqué. Le clic EST l'action : pas de case « Archivé » à cocher puis
 * enregistrer.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { archived?: unknown };
  if (typeof body.archived !== "boolean") return NextResponse.json({ error: "archived attendu (booléen)" }, { status: 400 });

  const raw = (await payload.db
    .findOne({ collection: "ad-accounts", where: { id: { equals: id } } } as never)
    .catch(() => null)) as (AccountTokens & { name?: string }) | null;
  if (!raw) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const status = body.archived ? "archive" : statusFromTokens(raw, new Date());
  await payload.update({ collection: "ad-accounts", id, data: { status }, overrideAccess: true });
  payload.logger.info(`[publicité] compte « ${raw.name ?? id} » ${body.archived ? "archivé" : `réactivé (${status})`} par ${user.email}.`);
  return NextResponse.json({ status });
}
