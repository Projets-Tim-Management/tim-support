import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import {
  contractPdf,
  contractVars,
  idOf,
  inputsOf,
  loadContractContext,
  missingList,
  overridesMap,
  renderFromContext,
  requireAdmin,
  type ContractDoc,
} from "@/modules/partner/lib/contracts-server";
import { fileSlug, sha256 } from "@/modules/partner/lib/e-signature";
import { moveContractStatus } from "@/modules/partner/lib/sign-guards";

/**
 * POST — envoie un brouillon au client (TIM seul).
 *
 * Refusé tant qu'une information manque : un contrat à trous ne part pas. Le
 * PDF est alors généré UNE FOIS, son empreinte conservée, et il devient le
 * « contrat à signer » de la fiche — ce qui prévient le client (e-mail « Un
 * document vous attend »), coche « Contrat envoyé » et lui ouvre la signature
 * en ligne dans son espace. À partir de là, le contrat est figé ; pour le
 * modifier avant signature, on le remet en brouillon (route reopen).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const payload = await payloadClient();
  const user = await requireAdmin(payload, req);
  if (!user) return NextResponse.json({ error: "denied" }, { status: 403 });

  const contract = (await payload
    .findByID({ collection: "client-contracts", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as ContractDoc | null;
  if (!contract) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (contract.status !== "brouillon") {
    return NextResponse.json({ error: "frozen", message: "Ce contrat a déjà été envoyé." }, { status: 409 });
  }

  const clientId = idOf(contract.client)!;
  const ctx = await loadContractContext(payload, clientId);
  const vars = contractVars(ctx, inputsOf(contract));
  const rendered = renderFromContext(ctx, overridesMap(contract), vars);
  const missing = missingList(rendered);
  if (missing.length) {
    return NextResponse.json(
      { error: "missing", message: "Des informations manquent encore dans le contrat.", missing },
      { status: 422 },
    );
  }

  // Réservé d'abord : un double clic n'envoie pas deux contrats.
  if (!(await moveContractStatus(payload, id, "brouillon", "envoye"))) {
    return NextResponse.json({ error: "frozen", message: "Ce contrat a déjà été envoyé." }, { status: 409 });
  }

  try {
    const pdf = await contractPdf(ctx, rendered, contract.reference ?? "contrat", vars);
    const slug = fileSlug(String(vars["client.denomination"] ?? "client"));
    const media = await payload.create({
      collection: "media",
      overrideAccess: true,
      data: { alt: `Contrat ${contract.reference} — ${vars["client.denomination"] ?? "client"}` },
      file: {
        data: pdf,
        mimetype: "application/pdf",
        name: `${randomBytes(8).toString("hex")}-contrat-${slug}-v${contract.version ?? 1}.pdf`,
        size: pdf.byteLength,
      },
    });

    await payload.update({
      collection: "client-contracts",
      id,
      data: {
        pdf: media.id,
        pdfHash: sha256(pdf),
        templateVersion: ctx.template.version,
        sentAt: new Date().toISOString(),
        sentBy: (user as { id?: number | string }).id,
      } as never,
      overrideAccess: true,
    });

    // Repris ou annulé pendant la génération ? Alors rien ne part au client.
    const now = (await payload.findByID({ collection: "client-contracts", id, depth: 0, overrideAccess: true })) as ContractDoc;
    if (now.status !== "envoye") {
      if (now.status === "brouillon") {
        await payload.update({ collection: "client-contracts", id, data: { pdf: null, pdfHash: null, sentAt: null, sentBy: null } as never, overrideAccess: true });
      }
      return NextResponse.json({ error: "frozen", message: "Le contrat a changé pendant l'envoi. Rechargez la page." }, { status: 409 });
    }

    // Le contrat à signer de la fiche : c'est ce dépôt qui prévient le client
    // et lui ouvre la signature (voir PartnerClients, notifyDocumentAvailable).
    await payload.update({
      collection: "partner-clients",
      id: clientId,
      data: { contractToSignDocument: media.id } as never,
      overrideAccess: true,
    });

    return NextResponse.json({ ok: true, url: media.url ?? null });
  } catch (err) {
    payload.logger.error(`[contrat] envoi de ${contract.reference} échoué : ${err}`);
    // Tout défaire : un brouillon ne garde ni PDF ni date d'envoi.
    if (await moveContractStatus(payload, id, "envoye", "brouillon").catch(() => false)) {
      await payload
        .update({ collection: "client-contracts", id, data: { pdf: null, pdfHash: null, sentAt: null, sentBy: null } as never, overrideAccess: true })
        .catch(() => undefined);
    }
    return NextResponse.json({ error: "send_failed", message: "L'envoi a échoué. Réessayez." }, { status: 500 });
  }
}
