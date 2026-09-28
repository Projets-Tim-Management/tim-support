import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { generateCode, hashCode } from "@/modules/marketing/lib/portal-auth";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import {
  SIGNABLE,
  SIGN_CODE_TTL_MS,
  SIGN_MAX_REQUESTS_PER_HOUR,
  consentText,
  isSignableKind,
  maskEmail,
  sha256,
} from "@/modules/partner/lib/e-signature";
import {
  canSignNow,
  checkConfirmations,
  cleanField,
  fetchMediaBytes,
  pagePlanOf,
  pendingContractUpdate,
  signableDocOf,
} from "@/modules/partner/lib/e-signature-server";
import { templateTexts } from "@/modules/partner/lib/signing-access";

/**
 * POST /api/portal/signature/sign/start — le client demande son code de
 * signature.
 *
 * { kind: "devis" | "contrat", firstName, lastName, role?, consent: true,
 *   confirmations: [{ page, at, signed? }] }
 *
 * Chaque page doit avoir été confirmée (paraphée) une à une, et signée là où
 * le contrat généré porte le bloc « Le Client » : sinon, pas de code. Ces
 * confirmations rejoignent le dossier de preuve.
 *
 * On FIGE ici ce qui sera signé : l'empreinte du document présenté est prise
 * maintenant, et revérifiée à la confirmation — un document remplacé entre les
 * deux ne peut pas être signé à l'insu du client. Le code part à l'adresse du
 * compte de connexion (déjà vérifiée par la connexion), jamais à une adresse
 * saisie dans le formulaire.
 */
export const dynamic = "force-dynamic";


export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { client, session } = ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind;
  if (!isSignableKind(kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  const firstName = cleanField(body?.firstName);
  const lastName = cleanField(body?.lastName);
  const role = cleanField(body?.role);
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "missing_name", message: "Indiquez votre prénom et votre nom." }, { status: 422 });
  }
  if (body?.consent !== true) {
    return NextResponse.json({ error: "no_consent", message: "Cochez la case d'acceptation pour signer." }, { status: 422 });
  }
  const payload = await payloadClient();
  // À son étape, ou pour signer une mise à jour du contrat déjà signé.
  const allowed = canSignNow(client, kind) || (kind === "contrat" && (await pendingContractUpdate(payload, client)) !== null);
  if (!allowed) {
    return NextResponse.json({ error: "not_now", message: "Ce document n'est pas à signer pour l'instant." }, { status: 409 });
  }
  const doc = signableDocOf(client, kind);
  if (!doc) return NextResponse.json({ error: "no_document" }, { status: 409 });


  // Au plus 5 codes par heure et par entreprise : de quoi se tromper, pas de
  // quoi arroser une boîte mail.
  const recent = await payload.count({
    collection: "electronic-signatures",
    where: {
      and: [
        { client: { equals: client.id } },
        { createdAt: { greater_than: new Date(Date.now() - 3_600_000).toISOString() } },
      ],
    },
    overrideAccess: true,
  });
  if (recent.totalDocs >= SIGN_MAX_REQUESTS_PER_HOUR) {
    return NextResponse.json(
      { error: "too_many", message: "Trop de demandes de code. Réessayez dans une heure." },
      { status: 429 },
    );
  }

  const account = (await payload
    .findByID({ collection: "client-portal-accounts", id: session.aid, depth: 0, overrideAccess: true })
    .catch(() => null)) as { email?: string } | null;
  const email = account?.email?.trim();
  if (!email) return NextResponse.json({ error: "no_email" }, { status: 409 });

  const bytes = await fetchMediaBytes(doc.url);
  if (!bytes) {
    return NextResponse.json({ error: "document_unreadable", message: "Le document est momentanément indisponible. Réessayez." }, { status: 502 });
  }

  const checked = checkConfirmations(await pagePlanOf(bytes, doc.mime), body?.confirmations);
  if (!checked.ok) {
    const pages = checked.missing.slice(0, 5).join(", ") + (checked.missing.length > 5 ? "…" : "");
    return NextResponse.json(
      { error: "pages_missing", missing: checked.missing, message: `Confirmez d'abord chaque page (reste : ${pages}).` },
      { status: 422 },
    );
  }

  // Une nouvelle demande périme les précédentes : un seul code valable à la fois.
  await payload.update({
    collection: "electronic-signatures",
    where: {
      and: [{ client: { equals: client.id } }, { kind: { equals: kind } }, { status: { equals: "en-attente" } }],
    },
    data: { status: "expire" } as never,
    overrideAccess: true,
  });

  const code = generateCode();
  const now = new Date();
  const signature = await payload.create({
    collection: "electronic-signatures",
    data: {
      client: client.id,
      kind,
      status: "en-attente",
      signerFirstName: firstName,
      signerLastName: lastName,
      signerRole: role || null,
      signerEmail: email,
      consentText: consentText(kind, client.companyName),
      documentOriginal: doc.id,
      documentHash: sha256(bytes),
      pageConfirmations: checked.list,
      codeSentAt: now.toISOString(),
      codeHash: hashCode(code),
      codeExpiresAt: new Date(now.getTime() + SIGN_CODE_TTL_MS).toISOString(),
      attempts: 0,
    } as never,
    overrideAccess: true,
  });

  const built = JOURNEY_EMAILS["code-signature"]({
    code,
    clientName: client.companyName ?? null,
    documentNoun: SIGNABLE[kind].noun,
    texts: await templateTexts(payload, "code-signature"),
  });
  try {
    await payload.sendEmail({ to: email, subject: built.subject, html: built.html, text: built.text });
  } catch (err) {
    payload.logger.error(`[signature] envoi du code à ${email} échoué : ${err}`);
    return NextResponse.json({ error: "send_failed", message: "L'e-mail n'est pas parti. Réessayez." }, { status: 502 });
  }

  return NextResponse.json({ id: signature.id, sentTo: maskEmail(email) });
}
