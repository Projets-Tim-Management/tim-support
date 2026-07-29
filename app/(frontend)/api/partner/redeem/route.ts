import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";

import { isPartnerUtilisateur, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { redeemRewardForPartner } from "@/modules/partner/lib/partner";

/**
 * Commande de récompense par un PARTENAIRE-UTILISATEUR connecté au back-office.
 *
 * SÉCURITÉ : c'est la SEULE porte d'entrée de commande côté partenaire (la
 * création brute de reward-orders est réservée aux admins). On authentifie le
 * compte Payload, on vérifie le rôle + la fiche rattachée, puis on délègue à
 * `redeemRewardForPartner` qui débite les points en sécurité (check solde +
 * transaction de débit + rollback en cas d'échec).
 */
export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: await nextHeaders() });

  if (!user || !isPartnerUtilisateur(user)) {
    return NextResponse.json({ code: "forbidden", message: "Accès refusé." }, { status: 403 });
  }
  const partnerId = partnerIdOf(user);
  if (partnerId == null) {
    return NextResponse.json(
      { code: "no_partner", message: "Compte non rattaché à un partenaire." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { reward?: unknown };
  const rewardId = Number(body?.reward);
  if (!rewardId) {
    return NextResponse.json({ code: "bad_request", message: "Récompense manquante." }, { status: 400 });
  }

  const result = await redeemRewardForPartner(payload, { id: Number(partnerId) }, rewardId);
  return NextResponse.json(result.data, { status: result.status });
}
