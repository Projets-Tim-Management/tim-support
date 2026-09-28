import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { restoreFicheContract } from "@/modules/partner/lib/contract-lifecycle";
import { idOf, requireAdmin, type ContractDoc } from "@/modules/partner/lib/contracts-server";
import { moveContractStatus } from "@/modules/partner/lib/sign-guards";

/**
 * POST — remet en brouillon un contrat envoyé que le client n'a pas encore
 * signé (TIM seul) : « modifiable jusqu'à la signature ».
 *
 * Le document est retiré de l'espace client (il repasse « en préparation »,
 * ou retrouve le contrat en vigueur s'il s'agissait d'une mise à jour), pour
 * qu'il ne signe pas une version que TIM est en train de corriger. Le
 * prochain envoi le préviendra de nouveau.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await payloadClient();
  if (!(await requireAdmin(payload, req))) return NextResponse.json({ error: "denied" }, { status: 403 });
  const contract = (await payload
    .findByID({ collection: "client-contracts", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as ContractDoc | null;
  if (!contract) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Réservé d'abord : si le client signe au même moment, un seul des deux gagne.
  if (contract.status !== "envoye" || !(await moveContractStatus(payload, id, "envoye", "brouillon"))) {
    return NextResponse.json({ error: "not_sent", message: "Seul un contrat envoyé et non signé se reprend." }, { status: 409 });
  }
  try {
    // Mise à jour d'un contrat déjà signé (v2…) : la fiche retrouve le contrat
    // en vigueur. Premier contrat : elle repasse « en préparation ».
    await restoreFicheContract(payload, idOf(contract.client)!, { signed: false });
  } catch (err) {
    // La fiche n'a pas suivi : le contrat reste envoyé, rien n'est à moitié fait.
    payload.logger.error(`[contrat] reprise de ${contract.reference} : fiche non mise à jour : ${err}`);
    await moveContractStatus(payload, id, "brouillon", "envoye").catch(() => undefined);
    return NextResponse.json({ error: "reopen_failed", message: "La reprise a échoué. Réessayez." }, { status: 500 });
  }
  await payload.update({
    collection: "client-contracts",
    id,
    data: { pdf: null, pdfHash: null, sentAt: null, sentBy: null } as never,
    overrideAccess: true,
  });
  return NextResponse.json({ ok: true });
}
