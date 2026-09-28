import { PDFDocument } from "pdf-lib";
import type { Payload } from "payload";

import { fetchMediaBytes, pageSizes } from "@/modules/partner/lib/e-signature-server";
import { planFor, type SignPlan } from "@/modules/partner/lib/sign-fields";
import { readLayout, type SignatureLayout } from "@/modules/partner/lib/signature-layout";

import { idOf, requireAdmin } from "@/modules/partner/lib/contracts-server";

/**
 * Ce que partagent les routes de contresignature : le contrat À CONTRESIGNER
 * (signé par le client), lu pour un admin, avec son PDF signé.
 */
export type CountersignContract = {
  id: number | string;
  client?: unknown;
  reference?: string;
  status?: string;
  pdf?: { id?: number | string; url?: string | null } | number | string | null;
  signedDocument?: { id?: number | string; url?: string | null } | number | string | null;
  countersignedBy?: { id?: number | string } | number | string | null;
  clientSignedHash?: string | null;
  countersignerFirstName?: string | null;
  countersignerLastName?: string | null;
  countersignerRole?: string | null;
  countersignerEmail?: string | null;
  countersignConsent?: string | null;
  countersignCodeSentAt?: string | null;
  countersignCodeHash?: string | null;
  countersignCodeExpiresAt?: string | null;
  countersignAttempts?: number | null;
};

export async function loadForCountersign(payload: Payload, req: Request, id: string) {
  const user = (await requireAdmin(payload, req)) as { id: number | string; email?: string; firstName?: string; lastName?: string } | null;
  if (!user) return { error: "denied" as const, status: 403 };
  const contract = (await payload
    .findByID({ collection: "client-contracts", id, depth: 1, overrideAccess: true, showHiddenFields: true })
    .catch(() => null)) as CountersignContract | null;
  if (!contract) return { error: "not_found" as const, status: 404 };
  if (contract.status !== "signe-client") return { error: "not_ready" as const, status: 409 };
  const signedUrl =
    contract.signedDocument && typeof contract.signedDocument === "object" ? (contract.signedDocument.url ?? null) : null;
  if (!signedUrl) return { error: "no_document" as const, status: 409 };
  return { user, contract, signedUrl, clientId: idOf(contract.client as never)! };
}

/**
 * Le plan des champs de TIM sur le PDF signé par le client. Un PDF signé avant
 * que le plan ne suive la signature n'en porte pas : on le relit alors dans le
 * PDF envoyé (`sent`), dont les pages sont les mêmes.
 *
 * Sans plan du tout (contrat signé déposé à la main), TIM n'a rien à parapher :
 * le PDF final n'aurait nulle part où écrire ses paraphes — seul le certificat
 * de contresignature s'ajoute. Un PDF illisible : null, la visionneuse s'ouvre
 * sans étiquettes.
 */
async function countersignPlan(
  signed: Uint8Array,
  sent: Uint8Array | null,
): Promise<{ plan: SignPlan; layout: SignatureLayout | null } | null> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(signed, { ignoreEncryption: true });
  } catch {
    return null;
  }
  let layout = readLayout(pdf);
  if (!layout && sent) {
    try {
      layout = readLayout(await PDFDocument.load(sent, { ignoreEncryption: true }));
    } catch {
      layout = null;
    }
  }
  const sizes = pageSizes(pdf);
  const plan: SignPlan = layout ? planFor("provider", sizes, layout) : { count: sizes.length, sizes, fields: [], signaturePages: [] };
  return { plan, layout };
}

/** Le plan de TIM, avec les octets du PDF envoyé relus si besoin. */
export async function countersignPlanFor(contract: CountersignContract, signed: Uint8Array) {
  const sentUrl = contract.pdf && typeof contract.pdf === "object" ? (contract.pdf.url ?? null) : null;
  return countersignPlan(signed, sentUrl ? await fetchMediaBytes(sentUrl) : null);
}
