import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { OPEN_CONTRACT_STATUSES, SIGNED_CONTRACT_STATUSES } from "@/modules/partner/lib/contract-status";
import { contractStartOf } from "@/modules/partner/lib/contract-lifecycle";
import { paramsFromClient } from "@/modules/partner/lib/contract-vars";
import {
  contractNumberOf,
  contractReference,
  idOf,
  nextContractNumber,
  requireAdmin,
} from "@/modules/partner/lib/contracts-server";

/**
 * GET  ?clientId=… → les contrats du client, du plus récent au plus ancien
 *                    (TIM, ou le partenaire de la fiche en lecture)
 * POST { clientId } → nouvelle version en BROUILLON (TIM seul). Elle reprend
 *                    conditions, informations et sections de la dernière
 *                    version signée : une mise à jour part de ce qui a été
 *                    négocié, pas d'une page blanche. Le premier contrat part
 *                    des conditions commerciales de la fiche.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "missing_client" }, { status: 400 });
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  const admin = hasAdminRole(user);
  if (!admin) {
    const client = (await payload
      .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })
      .catch(() => null)) as { partner?: unknown } | null;
    const owns = isPartnerMetier(user) && client && String(idOf(client.partner)) === String(partnerIdOf(user));
    if (!owns) return NextResponse.json({ error: "denied" }, { status: 403 });
  }
  const res = await payload.find({
    collection: "client-contracts",
    where: { client: { equals: clientId } },
    sort: "-version",
    limit: 50,
    depth: 1,
    overrideAccess: true,
  });
  const contracts = (res.docs as unknown as Record<string, unknown>[]).map((c) => ({
    id: c.id,
    reference: c.reference,
    version: c.version,
    status: c.status,
    templateVersion: c.templateVersion ?? null,
    customSections: Array.isArray(c.overrides) ? c.overrides.length : 0,
    sentAt: c.sentAt ?? null,
    clientSignedAt: c.clientSignedAt ?? null,
    pdfUrl: (c.pdf as { url?: string } | null)?.url ?? null,
    // L'exemplaire final (contresigné) s'il existe, sinon la version signée par le client.
    signedUrl:
      (c.countersignedDocument as { url?: string } | null)?.url ?? (c.signedDocument as { url?: string } | null)?.url ?? null,
    countersignedAt: c.countersignedAt ?? null,
  }));
  // La date de début prévue au contrat : proposée en passant l'affaire « Gagnée ».
  const contractStart = await contractStartOf(payload, clientId).catch(() => null);
  return NextResponse.json({ contracts, canEdit: admin, contractStart });
}

export async function POST(req: Request) {
  const payload = await payloadClient();
  const user = await requireAdmin(payload, req);
  if (!user) return NextResponse.json({ error: "denied" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { clientId?: number | string } | null;
  if (body?.clientId == null) return NextResponse.json({ error: "missing_client" }, { status: 400 });

  const existing = (
    await payload.find({
      collection: "client-contracts",
      where: { client: { equals: body.clientId } },
      sort: "-version",
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as {
    status?: string;
    version?: number;
    reference?: string;
    overrides?: { key?: string; body?: string }[];
    params?: unknown;
    variables?: unknown;
  }[];

  if (existing.some((c) => OPEN_CONTRACT_STATUSES.includes(c.status as never))) {
    return NextResponse.json(
      { error: "open_exists", message: "Un contrat est déjà en cours pour ce client (brouillon, envoyé ou à contresigner)." },
      { status: 409 },
    );
  }

  const version = (existing[0]?.version ?? 0) + 1;
  // Une nouvelle version garde le numéro du contrat ; un premier contrat prend
  // le suivant de la séquence.
  const number =
    existing.map((c) => contractNumberOf(c.reference)).find((n) => n != null) ?? (await nextContractNumber(payload));
  const base = existing.find((c) => [...SIGNED_CONTRACT_STATUSES, "remplace"].includes(c.status as never));
  // Premier contrat : les conditions commerciales partent de la fiche.
  const client = base
    ? null
    : ((await payload
        .findByID({ collection: "partner-clients", id: body.clientId, depth: 0, overrideAccess: true })
        .catch(() => null)) as Record<string, unknown> | null);
  if (!base && !client) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const contract = await payload.create({
    collection: "client-contracts",
    data: {
      client: body.clientId,
      version,
      reference: contractReference(number, version),
      status: "brouillon",
      overrides: (base?.overrides ?? []).map((o) => ({ key: o.key, body: o.body })),
      params: base ? (base.params ?? null) : paramsFromClient(client!),
      variables: base?.variables ?? null,
    } as never,
    overrideAccess: true,
  });
  return NextResponse.json({ id: contract.id, version });
}
