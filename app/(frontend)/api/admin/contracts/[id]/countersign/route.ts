import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { generateCode, hashCode } from "@/modules/marketing/lib/portal-auth";
import { countersignPlanFor, loadForCountersign } from "@/modules/partner/lib/countersign-server";
import { SIGN_CODE_TTL_MS, countersignConsent, maskEmail, sha256 } from "@/modules/partner/lib/e-signature";
import { checkConfirmations, cleanField, fetchMediaBytes } from "@/modules/partner/lib/e-signature-server";
import { templateTexts } from "@/modules/partner/lib/signing-access";

/**
 * Contresignature TIM d'un contrat signé par le client (admin seul).
 *
 * GET  → de quoi préremplir : le PDF signé par le client, le signataire
 *        proposé (l'admin connecté, la qualité du représentant de
 *        Système → Entreprise), l'adresse qui recevra le code, le consentement.
 * POST { firstName, lastName, role?, consent: true, confirmations } → vérifie
 *        que chaque page à parapher l'a été, envoie le code à l'adresse de
 *        l'admin CONNECTÉ, et fige l'empreinte du PDF signé.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const payload = await payloadClient();
  const r = await loadForCountersign(payload, req, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const [company, client] = await Promise.all([
    payload.findGlobal({ slug: "company-settings", depth: 0, overrideAccess: true }),
    payload.findByID({ collection: "partner-clients", id: r.clientId, depth: 0, overrideAccess: true }),
  ]);
  const companyName = (client as { companyName?: string | null }).companyName ?? null;
  // Où parapher et signer : les étiquettes de la visionneuse.
  const signed = await fetchMediaBytes(r.signedUrl);
  const plan = signed ? ((await countersignPlanFor(r.contract, signed))?.plan ?? null) : null;
  return NextResponse.json({
    plan,
    reference: r.contract.reference,
    signedUrl: r.signedUrl,
    signer: {
      firstName: r.user.firstName ?? "",
      lastName: r.user.lastName ?? "",
      role: (company as { qualite?: string | null }).qualite ?? "",
    },
    sentTo: maskEmail(r.user.email),
    consent: countersignConsent(companyName),
  });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const payload = await payloadClient();
  const r = await loadForCountersign(payload, req, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const firstName = cleanField(body?.firstName);
  const lastName = cleanField(body?.lastName);
  const role = cleanField(body?.role);
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "missing_name", message: "Indiquez votre prénom et votre nom." }, { status: 422 });
  }
  if (body?.consent !== true) {
    return NextResponse.json({ error: "no_consent", message: "Cochez la case d'acceptation pour contresigner." }, { status: 422 });
  }
  const email = r.user.email?.trim();
  if (!email) return NextResponse.json({ error: "no_email", message: "Votre compte n'a pas d'adresse e-mail." }, { status: 409 });

  const bytes = await fetchMediaBytes(r.signedUrl);
  if (!bytes) return NextResponse.json({ error: "document_unreadable", message: "Le contrat signé est momentanément indisponible." }, { status: 502 });

  // Chaque paraphe et la signature de TIM, cliqués dans la visionneuse — la
  // même règle que pour le client.
  const planned = await countersignPlanFor(r.contract, bytes);
  if (planned) {
    const check = checkConfirmations(planned.plan, body?.confirmations);
    if (!check.ok) {
      return NextResponse.json(
        { error: "pages_missing", message: `Paraphez ou signez encore : page${check.missing.length > 1 ? "s" : ""} ${check.missing.join(", ")}.`, missing: check.missing },
        { status: 422 },
      );
    }
  }

  const [client, company] = await Promise.all([
    payload.findByID({ collection: "partner-clients", id: r.clientId, depth: 0, overrideAccess: true }) as Promise<{
      companyName?: string | null;
    }>,
    payload.findGlobal({ slug: "company-settings", depth: 0, overrideAccess: true }) as Promise<{ denomination?: string | null }>,
  ]);
  const code = generateCode();
  const now = new Date();
  await payload.update({
    collection: "client-contracts",
    id,
    data: {
      clientSignedHash: sha256(bytes),
      countersignerFirstName: firstName,
      countersignerLastName: lastName,
      countersignerRole: role || null,
      countersignerEmail: email,
      countersignedBy: r.user.id,
      countersignConsent: countersignConsent(client.companyName),
      countersignCodeSentAt: now.toISOString(),
      countersignCodeHash: hashCode(code),
      countersignCodeExpiresAt: new Date(now.getTime() + SIGN_CODE_TTL_MS).toISOString(),
      countersignAttempts: 0,
    } as never,
    overrideAccess: true,
  });

  // Le modèle dit « signer au nom de {{entreprise}} » : ici, au nom de TIM.
  const built = JOURNEY_EMAILS["code-signature"]({
    code,
    clientName: company.denomination ?? null,
    documentNoun: "contrat",
    texts: await templateTexts(payload, "code-signature"),
  });
  try {
    await payload.sendEmail({ to: email, subject: built.subject, html: built.html, text: built.text });
  } catch (err) {
    payload.logger.error(`[contresignature] envoi du code à ${email} échoué : ${err}`);
    return NextResponse.json({ error: "send_failed", message: "L'e-mail n'est pas parti. Réessayez." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: maskEmail(email) });
}
