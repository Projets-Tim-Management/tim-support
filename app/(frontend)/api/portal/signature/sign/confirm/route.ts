import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { afterResponse } from "@/core/lib/after-response";
import { adminUrl, internalNotice } from "@/core/lib/email-template";
import { payloadClient } from "@/core/payload-client";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { adminEmails } from "@/modules/marketing/lib/notify";
import { relId } from "@/core/lib/relations";
import { codeMatches } from "@/modules/marketing/lib/portal-auth";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import {
  SIGNABLE,
  SIGN_MAX_ATTEMPTS,
  buildSignedPdf,
  fileSlug,
  isSignableKind,
  isSignatureStyle,
  sha256,
} from "@/modules/partner/lib/e-signature";
import {
  clientIp,
  fetchMediaBytes,
  loadSignatureFont,
  sentGeneratedContract,
  signableDocOf,
} from "@/modules/partner/lib/e-signature-server";
import { recordClientSignature } from "@/modules/partner/lib/contract-lifecycle";
import { consumeCode, moveContractStatus, spendAttempt } from "@/modules/partner/lib/sign-guards";
import { templateTexts } from "@/modules/partner/lib/signing-access";

/**
 * POST /api/portal/signature/sign/confirm — le client saisit son code : c'est
 * l'acte de signature.
 *
 * { id, code }
 *
 * Dans l'ordre : la signature appartient à l'entreprise de la session, elle est
 * en attente, le code n'a pas expiré, il reste des essais, le code est bon, le
 * document n'a pas changé depuis la demande. Alors seulement : PDF signé
 * (document + certificat), rangé sur la fiche à la place du dépôt manuel —
 * l'étape se coche, le partenaire est prévenu, comme pour un dépôt.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Sig = {
  id: number | string;
  client?: number | string | { id: number | string };
  kind?: string;
  status?: string;
  signerFirstName?: string;
  signerLastName?: string;
  signerRole?: string | null;
  signerEmail?: string;
  consentText?: string;
  documentHash?: string;
  codeSentAt?: string;
  codeHash?: string | null;
  codeExpiresAt?: string | null;
  attempts?: number | null;
  pageConfirmations?: unknown;
};

export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { client } = ctx;

  const body = (await req.json().catch(() => null)) as { id?: unknown; code?: unknown; style?: unknown } | null;
  // Le rendu visible de la signature : un choix d'apparence, sans effet sur la preuve.
  const style = isSignatureStyle(body?.style) ? body.style : "elegante";
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (body?.id == null || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "bad_code", message: "Saisissez les 6 chiffres du code." }, { status: 400 });
  }

  const payload = await payloadClient();
  const sig = (await payload
    .findByID({ collection: "electronic-signatures", id: body.id as number, depth: 0, overrideAccess: true })
    .catch(() => null)) as Sig | null;

  // Une signature d'une autre entreprise est traitée comme inexistante.
  if (!sig || String(relId(sig.client)) !== String(client.id) || !isSignableKind(sig.kind)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const kind = sig.kind;
  if (sig.status !== "en-attente" || !sig.codeExpiresAt || Date.parse(sig.codeExpiresAt) < Date.now()) {
    return NextResponse.json(
      { error: "expired", message: "Ce code a expiré. Demandez-en un nouveau." },
      { status: 410 },
    );
  }
  // L'essai est compté AVANT la comparaison : des essais simultanés ne
  // dépassent pas la limite.
  const spent = await spendAttempt(payload, "signature", sig.id, SIGN_MAX_ATTEMPTS);
  if (spent == null) {
    return NextResponse.json({ error: "locked", message: "Trop d'essais. Demandez un nouveau code." }, { status: 429 });
  }
  if (!codeMatches(code, sig.codeHash)) {
    const left = SIGN_MAX_ATTEMPTS - spent;
    if (left <= 0) {
      await payload.update({ collection: "electronic-signatures", id: sig.id, data: { status: "expire" } as never, overrideAccess: true });
    }
    return NextResponse.json(
      {
        error: "wrong_code",
        message: left > 0 ? `Code incorrect. Il vous reste ${left} essai${left > 1 ? "s" : ""}.` : "Code incorrect. Demandez un nouveau code.",
      },
      { status: 400 },
    );
  }
  // Le code ne sert qu'une fois : un double clic ne signe pas deux fois.
  if (!(await consumeCode(payload, "signature", sig.id))) {
    return NextResponse.json({ error: "expired", message: "Ce code a déjà été utilisé." }, { status: 409 });
  }

  // Le code est consommé : tout échec d'ici la fin clôt cette signature — le
  // client redemande un code (le tiroir le ramène au début).
  const expire = () =>
    payload
      .update({ collection: "electronic-signatures", id: sig.id, data: { status: "expire" } as never, overrideAccess: true })
      .catch(() => undefined);

  const doc = signableDocOf(client, kind);
  const bytes = doc ? await fetchMediaBytes(doc.url) : null;
  if (!doc || !bytes) {
    await expire();
    return NextResponse.json(
      { error: "expired", message: "Le document n'est plus disponible (il a peut-être été retiré). Rechargez la page." },
      { status: 410 },
    );
  }
  // Le document a-t-il changé depuis la demande de code ? Alors ce n'est plus
  // celui que le client a lu : on ne signe pas.
  if (sha256(bytes) !== sig.documentHash) {
    await expire();
    return NextResponse.json(
      { error: "document_changed", message: "Le document a été mis à jour entre-temps. Relisez-le, puis signez à nouveau." },
      { status: 409 },
    );
  }

  // Contrat généré : TIM contresigne ensuite ; la copie attendra. La version
  // est RÉSERVÉE avant de signer : si TIM la reprend ou l'annule au même
  // moment, un seul des deux gestes aboutit.
  const generated = kind === "contrat" ? await sentGeneratedContract(payload, client.id, doc.id) : null;
  if (generated && !(await moveContractStatus(payload, generated.id, "envoye", "signe-client"))) {
    await expire();
    return NextResponse.json(
      { error: "expired", message: "Ce contrat vient d'être retiré par TIM. Rechargez la page." },
      { status: 409 },
    );
  }

  const signedAt = new Date().toISOString();
  const reference = `SIG-${String(sig.id).padStart(6, "0")}`;
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  try {
    const pdf = await buildSignedPdf({
      original: bytes,
      mime: doc.mime,
      kind,
      reference,
      company: client.companyName ?? null,
      signer: {
        firstName: sig.signerFirstName ?? "",
        lastName: sig.signerLastName ?? "",
        role: sig.signerRole,
        email: sig.signerEmail ?? "",
      },
      consent: sig.consentText ?? "",
      originalHash: sig.documentHash ?? "",
      codeSentAt: sig.codeSentAt ?? signedAt,
      signedAt,
      ip,
      userAgent,
      documentName: doc.filename,
      signatureFont: await loadSignatureFont(style),
      pageConfirmations: Array.isArray(sig.pageConfirmations)
        ? (sig.pageConfirmations as { page: number; at: string; signed?: boolean }[])
        : null,
    });

    const slug = fileSlug(client.companyName ?? "client");
    const media = await payload.create({
      collection: "media",
      overrideAccess: true,
      data: { alt: `${SIGNABLE[kind].noun === "devis" ? "Devis" : "Contrat"} signé en ligne — ${client.companyName ?? "client"}` },
      file: {
        data: Buffer.from(pdf),
        mimetype: "application/pdf",
        name: `${randomBytes(8).toString("hex")}-${SIGNABLE[kind].noun}-signe-${slug}.pdf`,
        size: pdf.byteLength,
      },
    });

    // Rangé comme un dépôt : la fiche pose la date, l'étape s'arme, le
    // partenaire est prévenu (voir stampSigning, armJourneySteps).
    await payload.update({
      collection: "partner-clients",
      id: client.id,
      data: { [SIGNABLE[kind].signed]: media.id } as never,
      overrideAccess: true,
    });

    if (generated) {
      await recordClientSignature(payload, { contractId: generated.id, clientId: client.id, signedDocument: media.id, signedAt });
    }

    await payload.update({
      collection: "electronic-signatures",
      id: sig.id,
      data: {
        status: "signe",
        signedAt,
        ip,
        userAgent,
        signedDocument: media.id,
        signedHash: sha256(pdf),
      } as never,
      overrideAccess: true,
    });

    if (generated) {
      // Pas de copie au client : il recevra le contrat signé par les DEUX
      // parties, après la contresignature. TIM est prévenu, sur le moment.
      afterResponse(async () => {
        const to = await adminEmails(payload);
        if (!to.length) return;
        const url = adminUrl(`/collections/partner-clients/${client.id}`);
        await payload.sendEmail({
          to: to.join(","),
          subject: `À contresigner : contrat ${generated.reference} — ${client.companyName ?? "client"}`,
          html: internalNotice({
            kicker: "Contrat",
            heading: "Le client a signé : à vous de contresigner",
            rows: [
              ["Client", client.companyName ?? "—"],
              ["Contrat", generated.reference],
              ["Signé par", [sig.signerFirstName, sig.signerLastName].filter(Boolean).join(" ") + (sig.signerRole ? `, ${sig.signerRole}` : "")],
            ],
            message: "Le client recevra son exemplaire signé par les deux parties dès votre contresignature.",
            cta: { label: "Contresigner le contrat", url },
          }),
          text: `Le client ${client.companyName ?? ""} a signé le contrat ${generated.reference}. Contresignez-le : ${url}`,
        });
      }, (e) => payload.logger.error(`[signature] alerte « à contresigner » non envoyée : ${e}`));
      return NextResponse.json({ ok: true, url: null, reference, awaitingCountersign: true });
    }

    // La copie au signataire, après la réponse : il attend son écran.
    const texts = await templateTexts(payload, "document-signe");
    afterResponse(async () => {
      const built = JOURNEY_EMAILS["document-signe"]({
        clientName: client.companyName ?? null,
        contactFirstName: sig.signerFirstName ?? null,
        documentNoun: SIGNABLE[kind].noun,
        documentUrl: media.url ?? null,
        texts,
      });
      await payload.sendEmail({ to: sig.signerEmail, subject: built.subject, html: built.html, text: built.text });
    }, (e) => payload.logger.error(`[signature] copie signée non envoyée : ${e}`));

    return NextResponse.json({ ok: true, url: media.url ?? null, filename: media.filename ?? null, reference });
  } catch (err) {
    payload.logger.error(`[signature] signature ${sig.id} non finalisée : ${err}`);
    await expire();
    if (generated) await moveContractStatus(payload, generated.id, "signe-client", "envoye").catch(() => undefined);
    return NextResponse.json(
      { error: "sign_failed", message: "La signature n'a pas pu être finalisée. Demandez un nouveau code et recommencez." },
      { status: 500 },
    );
  }
}
