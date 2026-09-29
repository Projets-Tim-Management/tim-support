import { NextResponse } from "next/server";

import { isSuperAdmin } from "@/core/access";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { PURGE_CONTEXT, purgeImpact, sameImpact, type PurgeImpact } from "@/modules/ads/lib/accounts";

/**
 * Suppression DÉFINITIVE d'un compte publicitaire — super-admin seul.
 *
 * GET  → { campaigns, metrics } : ce que la suppression effacerait, annoncé
 *        dans la confirmation.
 * POST { campaigns, metrics } → supprime, à condition que la confirmation
 *        porte sur les chiffres ACTUELS. Si la synchro a écrit entre-temps, on
 *        refuse (409) avec les nouveaux chiffres : on ne confirme pas un nombre
 *        pour en effacer un autre.
 *
 * Le chemin normal est l'archivage ; celui-ci efface l'historique dont la
 * reconnexion et les agents ont besoin.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };


export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req, isSuperAdmin, "Réservé au super-admin.");
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  return NextResponse.json(await purgeImpact(payload, id));
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req, isSuperAdmin, "Réservé au super-admin.");
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;

  const confirmed = (await req.json().catch(() => null)) as Partial<PurgeImpact> | null;
  const impact = await purgeImpact(payload, id);
  if (!sameImpact(impact, confirmed)) {
    return NextResponse.json({ error: "Les chiffres ont changé depuis la confirmation.", impact }, { status: 409 });
  }

  const account = await payload
    .findByID({ collection: "ad-accounts", id, depth: 0, overrideAccess: true })
    .catch(() => null);
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await payload.delete({ collection: "ad-accounts", id, overrideAccess: true, context: { [PURGE_CONTEXT]: true } });
  payload.logger.warn(
    `[publicité] compte « ${account.name} » SUPPRIMÉ par ${user.email} : ${impact.campaigns} campagne(s), ${impact.metrics} ligne(s) de chiffres effacées.`,
  );
  return NextResponse.json({ deleted: true, ...impact });
}
