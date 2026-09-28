import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import {
  applyDraft,
  contractPdf,
  contractVars,
  idOf,
  inputsOf,
  loadContractContext,
  overridesMap,
  renderFromContext,
  requireAdmin,
  type ContractDoc,
  type DraftBody,
} from "@/modules/partner/lib/contracts-server";

/**
 * Le PDF d'un contrat (TIM seul).
 *
 * GET  → brouillon : rendu à l'instant (modèle + fiche + personnalisations),
 *        variables surlignées pour la relecture — sauf `?final=1`, le rendu
 *        exact de l'envoi ; envoyé ou signé : le PDF figé, tel que reçu.
 * POST { overrides?, params?, variables? } → aperçu d'un brouillon AVEC les
 *        modifications en cours de l'éditeur, sans rien enregistrer.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const pdfResponse = (buf: Buffer, name: string) =>
  new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });

async function load(req: Request, id: string) {
  const payload = await payloadClient();
  if (!(await requireAdmin(payload, req))) return { payload, error: NextResponse.json({ error: "denied" }, { status: 403 }) };
  const contract = (await payload
    .findByID({ collection: "client-contracts", id, depth: 1, overrideAccess: true })
    .catch(() => null)) as ContractDoc | null;
  if (!contract) return { payload, error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { payload, contract };
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const r = await load(req, id);
  if ("error" in r) return r.error;
  const frozen = r.contract.pdf && typeof r.contract.pdf === "object" ? r.contract.pdf.url : null;
  if (r.contract.status !== "brouillon" && frozen) return NextResponse.redirect(frozen);
  const ctx = await loadContractContext(r.payload, idOf(r.contract.client)!);
  const vars = contractVars(ctx, inputsOf(r.contract));
  const rendered = renderFromContext(ctx, overridesMap(r.contract), vars);
  return pdfResponse(
    await contractPdf(ctx, rendered, r.contract.reference ?? "brouillon", vars, new URL(req.url).searchParams.get("final") !== "1"),
    r.contract.reference ?? "contrat",
  );
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const r = await load(req, id);
  if ("error" in r) return r.error;
  if (r.contract.status !== "brouillon") return NextResponse.json({ error: "frozen" }, { status: 409 });
  const body = (await req.json().catch(() => null)) as DraftBody | null;
  const { overrides, inputs } = applyDraft(r.contract, body);
  const ctx = await loadContractContext(r.payload, idOf(r.contract.client)!);
  const vars = contractVars(ctx, inputs);
  const rendered = renderFromContext(ctx, overrides, vars);
  return pdfResponse(await contractPdf(ctx, rendered, r.contract.reference ?? "brouillon", vars, true), "apercu");
}
