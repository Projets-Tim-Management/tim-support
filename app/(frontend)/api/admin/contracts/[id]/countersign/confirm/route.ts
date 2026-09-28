import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { afterResponse } from "@/core/lib/after-response";
import { payloadClient } from "@/core/payload-client";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { codeMatches } from "@/modules/marketing/lib/portal-auth";
import { relId } from "@/core/lib/relations";
import { countersignPlanFor, loadForCountersign } from "@/modules/partner/lib/countersign-server";
import { SIGN_MAX_ATTEMPTS, buildCountersignedPdf, fileSlug, isSignatureStyle, sha256 } from "@/modules/partner/lib/e-signature";
import { clientIp, fetchMediaBytes, loadSignatureFont } from "@/modules/partner/lib/e-signature-server";
import { consumeCode, moveContractStatus, spendAttempt } from "@/modules/partner/lib/sign-guards";
import { templateTexts } from "@/modules/partner/lib/signing-access";

/**
 * POST { code, style } — TIM saisit son code : c'est la contresignature.
 *
 * Le PDF signé par le client n'a pas changé depuis la demande du code ? Alors :
 * PDF final (bloc « Le Prestataire » rempli, paraphes TIM, certificat de
 * contresignature), contrat « Signé », fiche mise à jour — et SEULEMENT
 * maintenant, le client reçoit son exemplaire signé par les deux parties.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await payloadClient();
  const r = await loadForCountersign(payload, req, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const c = r.contract;
  const body = (await req.json().catch(() => null)) as { code?: unknown; style?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  const style = isSignatureStyle(body?.style) ? body.style : "elegante";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "bad_code", message: "Saisissez les 6 chiffres du code." }, { status: 400 });
  }

  // Le code a été envoyé à UN admin : c'est lui, et lui seul, qui contresigne.
  if (String(relId(c.countersignedBy)) !== String(r.user.id)) {
    return NextResponse.json(
      { error: "not_requester", message: "Ce code a été demandé par un autre membre de l'équipe. Demandez-en un nouveau." },
      { status: 403 },
    );
  }
  if (!c.countersignCodeHash || !c.countersignCodeExpiresAt || Date.parse(c.countersignCodeExpiresAt) < Date.now()) {
    return NextResponse.json({ error: "expired", message: "Ce code a expiré. Demandez-en un nouveau." }, { status: 410 });
  }
  // L'essai est compté AVANT la comparaison : des essais simultanés ne
  // dépassent pas la limite.
  const spent = await spendAttempt(payload, "countersign", id, SIGN_MAX_ATTEMPTS);
  if (spent == null) {
    return NextResponse.json({ error: "locked", message: "Trop d'essais. Demandez un nouveau code." }, { status: 429 });
  }
  if (!codeMatches(code, c.countersignCodeHash)) {
    const left = SIGN_MAX_ATTEMPTS - spent;
    return NextResponse.json(
      { error: "bad_code", message: left > 0 ? `Code incorrect. Il vous reste ${left} essai${left > 1 ? "s" : ""}.` : "Code incorrect. Demandez un nouveau code." },
      { status: 400 },
    );
  }
  // Le code ne sert qu'une fois : un double clic ne produit pas deux contrats.
  if (!(await consumeCode(payload, "countersign", id))) {
    return NextResponse.json({ error: "expired", message: "Ce code a déjà été utilisé." }, { status: 409 });
  }

  // Réservé : une annulation simultanée ne peut plus aboutir. Tout échec d'ici
  // la fin rend la main (« à contresigner ») ; le code, lui, est consommé.
  if (!(await moveContractStatus(payload, id, "signe-client", "signe"))) {
    return NextResponse.json({ error: "expired", message: "Ce contrat n'est plus à contresigner (annulé entre-temps ?). Rechargez la page." }, { status: 409 });
  }
  const release = () => moveContractStatus(payload, id, "signe", "signe-client").catch(() => undefined);

  const bytes = await fetchMediaBytes(r.signedUrl);
  if (!bytes) {
    await release();
    return NextResponse.json({ error: "expired", message: "Le contrat signé est momentanément indisponible. Demandez un nouveau code." }, { status: 502 });
  }
  if (sha256(bytes) !== c.clientSignedHash) {
    await release();
    return NextResponse.json({ error: "document_changed", message: "Le contrat signé a changé entre-temps. Demandez un nouveau code." }, { status: 409 });
  }

  const client = (await payload.findByID({ collection: "partner-clients", id: r.clientId, depth: 0, overrideAccess: true })) as {
    id: number | string;
    companyName?: string | null;
  };
  const signedAt = new Date().toISOString();
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  // Le plan des zones de signature, relu dans le PDF envoyé si le PDF signé
  // (antérieur à ce report) ne le porte pas.
  const fallbackLayout = (await countersignPlanFor(c, bytes))?.layout ?? null;

  try {
    const pdf = await buildCountersignedPdf({
      fallbackLayout,
      signedPdf: bytes,
      reference: c.reference ?? "",
      company: client.companyName ?? null,
      signer: {
        firstName: c.countersignerFirstName ?? "",
        lastName: c.countersignerLastName ?? "",
        role: c.countersignerRole,
        email: c.countersignerEmail ?? "",
      },
      consent: c.countersignConsent ?? "",
      signedHash: c.clientSignedHash ?? "",
      codeSentAt: c.countersignCodeSentAt ?? signedAt,
      signedAt,
      ip,
      userAgent,
      signatureFont: await loadSignatureFont(style),
    });

    const slug = fileSlug(client.companyName ?? "client");
    const media = await payload.create({
      collection: "media",
      overrideAccess: true,
      data: { alt: `Contrat ${c.reference} signé par les deux parties — ${client.companyName ?? "client"}` },
      file: {
        data: Buffer.from(pdf),
        mimetype: "application/pdf",
        name: `${randomBytes(8).toString("hex")}-contrat-signe-${slug}.pdf`,
        size: pdf.byteLength,
      },
    });

    await payload.update({
      collection: "client-contracts",
      id,
      data: {
        countersignedAt: signedAt,
        countersignIp: ip,
        countersignUserAgent: userAgent,
        countersignedDocument: media.id,
        countersignedHash: sha256(pdf),
      } as never,
      overrideAccess: true,
    });
    // La fiche garde désormais l'exemplaire final : c'est lui que le client
    // retrouve dans son espace.
    await payload.update({
      collection: "partner-clients",
      id: client.id,
      data: { contractDocument: media.id } as never,
      overrideAccess: true,
    });

    // Enfin, l'exemplaire du client — au signataire de son côté.
    const proof = (
      await payload.find({
        collection: "electronic-signatures",
        // La preuve de CETTE signature (son PDF signé est celui de la version).
        where: {
          and: [
            { client: { equals: client.id } },
            { kind: { equals: "contrat" } },
            { status: { equals: "signe" } },
            { signedDocument: { equals: relId(c.signedDocument) } },
          ],
        },
        sort: "-signedAt",
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
    ).docs[0] as { signerEmail?: string; signerFirstName?: string } | undefined;
    if (proof?.signerEmail) {
      const texts = await templateTexts(payload, "document-signe");
      afterResponse(async () => {
        const built = JOURNEY_EMAILS["document-signe"]({
          clientName: client.companyName ?? null,
          contactFirstName: proof.signerFirstName ?? null,
          documentNoun: "contrat",
          documentUrl: media.url ?? null,
          texts,
        });
        await payload.sendEmail({ to: proof.signerEmail, subject: built.subject, html: built.html, text: built.text });
      }, (e) => payload.logger.error(`[contresignature] exemplaire client non envoyé : ${e}`));
    }

    return NextResponse.json({ ok: true, url: media.url ?? null, clientNotified: Boolean(proof?.signerEmail) });
  } catch (err) {
    payload.logger.error(`[contresignature] contrat ${id} non finalisé : ${err}`);
    await release();
    return NextResponse.json(
      { error: "sign_failed", message: "La contresignature n'a pas pu être finalisée. Demandez un nouveau code et recommencez." },
      { status: 500 },
    );
  }
}
