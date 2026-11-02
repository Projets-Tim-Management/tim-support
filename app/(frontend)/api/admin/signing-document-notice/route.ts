import { NextResponse } from "next/server";

import { authorizeClient } from "@/modules/partner/lib/client-access";
import { noticeSentAt, sendDocumentNotice } from "@/modules/partner/lib/document-notice";
import { isSignableKind, SIGNABLE } from "@/modules/partner/lib/e-signature";

/**
 * L'avis « Un document vous attend » depuis l'onglet « Signature ».
 *
 * GET  ?clientId=… → pour le devis et le contrat : l'avis est-il parti (et quand),
 *                    le document est-il déposé
 * POST { clientId, kind } → l'envoie (document déposé, accès ouvert)
 *
 * Ouvert au partenaire qui suit la fiche, comme l'invitation et la relance.
 */
export const dynamic = "force-dynamic";

type ClientDoc = { id: number | string; partner?: unknown; companyName?: string | null } & Record<string, unknown>;

export async function GET(req: Request) {
  const ctx = await authorizeClient<ClientDoc>(req, new URL(req.url).searchParams.get("clientId"));
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });
  const [devis, contrat] = await Promise.all([noticeSentAt(ctx.payload, ctx.client.id, "devis"), noticeSentAt(ctx.payload, ctx.client.id, "contrat")]);
  return NextResponse.json({
    devis: { sentAt: devis, deposited: Boolean(ctx.client[SIGNABLE.devis.original]) },
    contrat: { sentAt: contrat, deposited: Boolean(ctx.client[SIGNABLE.contrat.original]) },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { clientId?: number | string; kind?: unknown } | null;
  const ctx = await authorizeClient<ClientDoc>(req, body?.clientId);
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });
  if (!isSignableKind(body?.kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  try {
    const result = await sendDocumentNotice(ctx.payload, ctx.client, body.kind);
    if (!result.ok) return NextResponse.json({ error: "unavailable", message: result.reason }, { status: 409 });
    return NextResponse.json({ ok: true, email: result.email });
  } catch (e) {
    ctx.payload.logger.error(`[signature] avis « ${body.kind} disponible » non envoyé (client ${ctx.client.id}) : ${e}`);
    return NextResponse.json({ error: "send_failed", message: "L'e-mail n'est pas parti. Réessayez dans un instant." }, { status: 502 });
  }
}
