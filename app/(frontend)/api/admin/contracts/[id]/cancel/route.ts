import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { restoreFicheContract } from "@/modules/partner/lib/contract-lifecycle";
import { idOf, requireAdmin, type ContractDoc } from "@/modules/partner/lib/contracts-server";
import { moveContractStatus } from "@/modules/partner/lib/sign-guards";

/**
 * POST — annule un contrat envoyé, ou signé par le client mais que TIM ne
 * contresignera pas (TIM seul).
 *
 * Sans cette sortie, un contrat « signé par le client » bloquerait pour
 * toujours toute nouvelle version (règle « un seul contrat ouvert »). Le
 * contrat reste dans l'historique, marqué « Annulé » ; la fiche retrouve le
 * contrat en vigueur, ou repasse « en préparation » s'il n'y en a pas.
 */
export const dynamic = "force-dynamic";

const CANCELLABLE = ["envoye", "signe-client"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await payloadClient();
  if (!(await requireAdmin(payload, req))) return NextResponse.json({ error: "denied" }, { status: 403 });
  const contract = (await payload
    .findByID({ collection: "client-contracts", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as ContractDoc | null;
  if (!contract) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const from = CANCELLABLE.find((s) => s === contract.status);
  if (!from || !(await moveContractStatus(payload, id, from, "annule"))) {
    return NextResponse.json(
      { error: "not_cancellable", message: "Seul un contrat envoyé, ou signé par le client et pas encore contresigné, s'annule." },
      { status: 409 },
    );
  }
  // Un code de contresignature en cours ne sert plus à rien.
  if (from === "signe-client") {
    await payload.update({
      collection: "client-contracts",
      id,
      data: { countersignCodeHash: null, countersignCodeExpiresAt: null } as never,
      overrideAccess: true,
    });
  }
  try {
    await restoreFicheContract(payload, idOf(contract.client)!, { signed: from === "signe-client" });
  } catch (err) {
    // La fiche n'a pas suivi : le contrat reprend son statut, rien n'est à moitié fait.
    payload.logger.error(`[contrat] annulation de ${contract.reference} : fiche non mise à jour : ${err}`);
    await moveContractStatus(payload, id, "annule", from).catch(() => undefined);
    return NextResponse.json({ error: "cancel_failed", message: "L'annulation a échoué. Réessayez." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
