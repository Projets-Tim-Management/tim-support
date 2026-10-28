import { NextResponse } from "next/server";

import { authorizeClient } from "@/modules/partner/lib/client-access";
import { SIGNING_ACCESS_ERRORS, ensureSigningAccess } from "@/modules/partner/lib/signing-access";
import { signingStarted } from "@/modules/partner/lib/signing";

/**
 * L'accès à l'espace client, vu depuis l'onglet « Signature » de la fiche.
 *
 * GET  ?clientId=… → l'accès existe-t-il, est-il ouvert, l'invitation est-elle
 *                    partie, le client s'est-il déjà connecté
 * POST { clientId } → crée l'accès s'il manque, l'ouvre, envoie l'invitation
 *                    de signature (ou la renvoie)
 *
 * Ouvert au PARTENAIRE qui suit la fiche, pas seulement aux admins : c'est lui
 * qui porte le process de signature. La règle « TIM ouvre les accès » vaut pour
 * la phase de test, où l'accès précède le Go/No-Go de TIM ; ici l'affaire est
 * déjà conclue, il n'y a plus de décision à attendre. D'où la condition : le
 * process doit être lancé — ce bouton n'ouvre pas d'espace à un prospect.
 */
export const dynamic = "force-dynamic";

type ClientDoc = {
  id: number | string;
  partner?: unknown;
  signingStartedAt?: string | null;
  signatureDate?: string | null;
};

const authorize = (req: Request, clientId: unknown) => authorizeClient<ClientDoc>(req, clientId);

export async function GET(req: Request) {
  const ctx = await authorize(req, new URL(req.url).searchParams.get("clientId"));
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });

  const account = (
    await ctx.payload.find({
      collection: "client-portal-accounts",
      where: { client: { equals: ctx.client.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as
    | { email?: string; active?: boolean; lastLoginAt?: string | null; invitationSentAt?: string | null }
    | undefined;

  return NextResponse.json({
    hasAccount: Boolean(account),
    email: account?.email ?? null,
    active: Boolean(account) && account?.active !== false,
    lastLoginAt: account?.lastLoginAt ?? null,
    invitationSentAt: account?.invitationSentAt ?? null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { clientId?: number | string } | null;
  const ctx = await authorize(req, body?.clientId);
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });

  if (!signingStarted(ctx.client as Record<string, unknown>)) {
    return NextResponse.json(
      { error: "not_started", message: "Le process de signature n'est pas lancé sur cette fiche." },
      { status: 409 },
    );
  }

  const result = await ensureSigningAccess(ctx.payload, ctx.client.id, { invite: true });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, message: SIGNING_ACCESS_ERRORS[result.reason] },
      { status: result.reason === "send_failed" ? 502 : 409 },
    );
  }
  return NextResponse.json({ ok: true, email: result.email, created: result.created });
}
