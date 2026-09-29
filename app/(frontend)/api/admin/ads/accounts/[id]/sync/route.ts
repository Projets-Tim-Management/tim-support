import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { runAdsSync } from "@/modules/ads/lib/sync-run";

/**
 * POST /api/admin/ads/accounts/:id/sync — « Synchroniser maintenant ».
 *
 * La même synchro que le cron, pour un seul compte : juste après une connexion,
 * on n'attend pas la nuit pour voir ses campagnes. Les mêmes règles s'appliquent
 * (un compte archivé, simulé hors mode simulé ou réel en mode simulé n'est pas lu).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

const REASONS: Record<string, string> = {
  archive: "Compte archivé : réactivez-le d'abord.",
  "simule-hors-mode-simule": "Compte simulé : il ne se synchronise qu'en données simulées (ADS_META_MOCK=1).",
  "reel-en-mode-simule": "Compte réel : jamais synchronisé en données simulées, pour ne pas y écrire de chiffres inventés.",
  "hors-liste": "Compte hors de META_ALLOWED_AD_ACCOUNTS : il n'est plus lu.",
};

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { results } = await runAdsSync(payload, { only: id });
  const r = results[0];
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (r.decision !== "ok") return NextResponse.json({ error: REASONS[r.decision] ?? r.decision }, { status: 409 });
  if (r.error) return NextResponse.json({ error: r.error, status: r.status }, { status: 502 });
  return NextResponse.json(r);
}
