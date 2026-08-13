import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import {
  CODE_TTL_MS,
  MAX_REQUESTS_PER_HOUR,
  codeEmail,
  generateCode,
  hashCode,
} from "@/modules/marketing/lib/portal-auth";

/**
 * POST /api/portal/request  { email }  → envoie un code de connexion à 6 chiffres.
 *
 * ⚠️ Réponse TOUJOURS identique, que le compte existe ou non : sinon ce
 * formulaire public devient un oracle permettant d'énumérer les clients de TIM.
 * Les seules erreurs distinctes sont l'e-mail manquant et le dépassement de
 * quota (5 demandes/heure), qui ne révèlent rien.
 */

const OK = { ok: true, message: "Si un compte existe pour cette adresse, un code vient d'être envoyé." };
const HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  let email: string | undefined;
  try {
    email = (await req.json())?.email?.toString().trim().toLowerCase();
  } catch {
    /* corps illisible → traité comme e-mail manquant */
  }
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });

  const payload = await payloadClient();

  const found = await payload.find({
    collection: "client-portal-accounts",
    where: { email: { equals: email } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  });
  const account = found.docs[0] as
    | {
        id: number | string;
        active?: boolean;
        requestCount?: number;
        requestWindowStart?: string;
        client?: { companyName?: string } | number | string;
      }
    | undefined;

  // Compte inexistant ou désactivé : on répond OK sans rien envoyer.
  if (!account || account.active === false) return NextResponse.json(OK);

  // Limitation de débit sur une fenêtre glissante d'une heure.
  const now = Date.now();
  const windowStart = account.requestWindowStart ? Date.parse(account.requestWindowStart) : 0;
  const inWindow = now - windowStart < HOUR_MS;
  const count = inWindow ? (account.requestCount ?? 0) : 0;
  if (count >= MAX_REQUESTS_PER_HOUR) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const code = generateCode();
  await payload.update({
    collection: "client-portal-accounts",
    id: account.id,
    data: {
      codeHash: hashCode(code),
      codeExpiresAt: new Date(now + CODE_TTL_MS).toISOString(),
      codeAttempts: 0,
      requestCount: count + 1,
      requestWindowStart: inWindow ? account.requestWindowStart : new Date(now).toISOString(),
    },
    overrideAccess: true,
  });

  const companyName =
    account.client && typeof account.client === "object" ? account.client.companyName : null;

  try {
    await payload.sendEmail({ to: email, ...codeEmail(code, companyName) });
  } catch (err) {
    // L'envoi a échoué : le code est posé mais inutilisable côté client. On le
    // dit (sans révéler l'existence du compte, l'erreur étant technique).
    payload.logger.error(`[espace-client] envoi du code à ${email} échoué : ${err}`);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json(OK);
}
