import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { ENGAGEMENT_OPTIONS, usedVariables } from "@/modules/partner/lib/contract-vars";
import {
  applyDraft,
  contractParams,
  contractVars,
  idOf,
  infoGroups,
  inputsOf,
  loadContractContext,
  missingList,
  overridesMap,
  renderFromContext,
  requireAdmin,
  type ContractDoc,
  type DraftBody,
} from "@/modules/partner/lib/contracts-server";

/**
 * Un contrat, pour la préparation pas à pas (TIM seul).
 *
 * GET    → le contrat ; étape 1 : conditions commerciales et informations
 *          (valeur de la fiche + valeur saisie pour ce contrat) ; étape 2 :
 *          sections du modèle et personnalisations ; les manques.
 * PATCH  { overrides?, params?, variables? } → enregistre le brouillon.
 *          Seul le contrat change : la fiche du client reste telle quelle.
 * DELETE → supprime un brouillon.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function load(req: Request, id: string) {
  const payload = await payloadClient();
  const user = await requireAdmin(payload, req);
  if (!user) return { payload, error: NextResponse.json({ error: "denied" }, { status: 403 }) };
  const contract = (await payload
    .findByID({ collection: "client-contracts", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as ContractDoc | null;
  if (!contract) return { payload, error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { payload, contract, user };
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const r = await load(req, id);
  if ("error" in r) return r.error;
  const ctx = await loadContractContext(r.payload, idOf(r.contract.client)!);
  const overrides = overridesMap(r.contract);
  const inputs = inputsOf(r.contract);
  const rendered = renderFromContext(ctx, overrides, contractVars(ctx, inputs));
  return NextResponse.json({
    contract: {
      id: r.contract.id,
      reference: r.contract.reference,
      version: r.contract.version,
      status: r.contract.status,
      clientName: ctx.vars["client.denomination"] ?? ctx.client.companyName ?? null,
    },
    params: contractParams(ctx, inputs.params),
    engagementOptions: ENGAGEMENT_OPTIONS,
    info: infoGroups(ctx, inputs, overrides),
    sections: ctx.template.sections.map((s) => ({ key: s.key, title: s.title, kind: s.kind, body: s.body })),
    overrides,
    missing: missingList(rendered),
    variables: [...usedVariables(ctx.template.sections.map((s) => s.body))].sort(),
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const r = await load(req, id);
  if ("error" in r) return r.error;
  if (r.contract.status !== "brouillon") {
    return NextResponse.json({ error: "frozen", message: "Seul un brouillon se modifie." }, { status: 409 });
  }
  const body = (await req.json().catch(() => null)) as DraftBody | null;
  const { overrides, inputs } = applyDraft(r.contract, body);
  await r.payload.update({
    collection: "client-contracts",
    id,
    data: {
      overrides: Object.entries(overrides).map(([key, text]) => ({ key, body: text })),
      params: inputs.params,
      variables: inputs.variables,
    } as never,
    overrideAccess: true,
  });
  return NextResponse.json({ ok: true, customSections: Object.keys(overrides).length });
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const r = await load(req, id);
  if ("error" in r) return r.error;
  if (r.contract.status !== "brouillon") {
    return NextResponse.json({ error: "frozen", message: "Seul un brouillon se supprime." }, { status: 409 });
  }
  await r.payload.delete({ collection: "client-contracts", id, overrideAccess: true });
  return NextResponse.json({ ok: true });
}
