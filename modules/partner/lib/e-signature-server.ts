import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PDFDocument } from "pdf-lib";
import type { Payload } from "payload";

import { relId } from "@/core/lib/relations";
import { SIGNED_CONTRACT_STATUSES } from "@/modules/partner/lib/contract-status";
import type { PortalClient } from "@/modules/marketing/lib/portal-server";
import { SIGNABLE, SIGNATURE_STYLES, type SignableKind, type SignatureStyle } from "@/modules/partner/lib/e-signature";
import { isActionField, planFor, type SignerRole, type SignPlan } from "@/modules/partner/lib/sign-fields";
import { readLayout } from "@/modules/partner/lib/signature-layout";
import { portalProgress } from "@/modules/partner/lib/signing";

/**
 * Ce que les routes de signature partagent : le document à signer, lu depuis
 * l'entreprise de la session, et la règle « on ne signe qu'à son étape ».
 */

export type SignableDoc = { id: number | string; url: string; filename: string; mime: string };

/** Le document présenté pour `kind`, tel que rangé sur la fiche (peuplé, depth 1). */
export const signableDocOf = (client: PortalClient, kind: SignableKind): SignableDoc | null => {
  const media = (client as Record<string, unknown>)[SIGNABLE[kind].original] as
    | { id?: number | string; url?: string | null; filename?: string | null; mimeType?: string | null }
    | null
    | undefined;
  if (!media || typeof media !== "object" || !media.url || media.id == null) return null;
  const filename = media.filename ?? `${SIGNABLE[kind].noun}.pdf`;
  const mime =
    media.mimeType ||
    (/\.png$/i.test(filename) ? "image/png" : /\.jpe?g$/i.test(filename) ? "image/jpeg" : "application/pdf");
  return { id: media.id, url: media.url, filename, mime };
};

/**
 * On signe à SON étape : le devis une fois l'entreprise renseignée et tant
 * qu'il n'est pas signé ; le contrat une fois le devis signé. La page ne
 * propose pas autre chose, la route le vérifie quand même.
 */
export const canSignNow = (client: PortalClient, kind: SignableKind): boolean => {
  const { reached, done } = portalProgress(client as Record<string, unknown>);
  return reached.includes(kind) && !done[kind];
};

/**
 * Les octets d'un fichier de la médiathèque (adresse venue de NOTRE base).
 * Sans stockage Blob (en local), l'adresse est relative : on la résout sur
 * l'URL du site, comme le logo du contrat.
 */
export async function fetchMediaBytes(url: string): Promise<Uint8Array | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
    const res = await fetch(new URL(url, base), { cache: "no-store" });
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * La police du rendu de signature choisi. Lue sur le disque : le fichier est
 * embarqué dans la fonction déployée par `outputFileTracingIncludes`
 * (next.config.ts) — sans quoi il manquerait en prod seulement. Un échec de
 * lecture n'empêche pas de signer : la signature s'écrit alors en italique.
 */
export async function loadSignatureFont(style: SignatureStyle): Promise<Uint8Array | null> {
  const file = SIGNATURE_STYLES.find((s) => s.key === style)?.file;
  if (!file) return null;
  try {
    return new Uint8Array(await readFile(join(process.cwd(), "assets/fonts/signature", file)));
  } catch {
    return null;
  }
}

/** Un champ texte du formulaire de signature, nettoyé et borné. */
export const cleanField = (v: unknown, max = 80): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** L'adresse IP de l'appelant, derrière le proxy Vercel. */
export const clientIp = (req: Request): string | null =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;

/**
 * Les pages à confirmer avant de signer, et où : chaque page se paraphe, et
 * celles qui portent le bloc « Le Client » d'un contrat généré se signent
 * aussi. `fields` donne l'emplacement exact de chaque étiquette pour
 * l'affichage façon DocuSign. Une image : une seule page.
 */
export type PagePlan = SignPlan;

const A4 = { w: 595.28, h: 841.89 };

/** La taille de chaque page, en points. */
export const pageSizes = (pdf: PDFDocument) =>
  pdf.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { w: width, h: height };
  });

export async function pagePlanOf(bytes: Uint8Array, mime: string, role: SignerRole = "client"): Promise<PagePlan> {
  if (mime !== "application/pdf") return planFor(role, [A4], null);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return planFor(role, pageSizes(pdf), readLayout(pdf));
}

export type PageConfirmation = { page: number; at: string; signed?: boolean };

/**
 * Chaque page confirmée, et signée là où il le faut — sinon le motif du refus.
 * Les horodatages viennent du navigateur : ils racontent le parcours, le
 * serveur, lui, horodate la signature.
 */
export function checkConfirmations(
  plan: Pick<PagePlan, "count" | "signaturePages"> & Partial<Pick<PagePlan, "fields">>,
  input: unknown,
): { ok: true; list: PageConfirmation[] } | { ok: false; missing: number[] } {
  const raw = Array.isArray(input) ? input : [];
  const byPage = new Map<number, PageConfirmation>();
  for (const r of raw) {
    const page = Number((r as { page?: unknown })?.page);
    const at = String((r as { at?: unknown })?.at ?? "");
    if (!Number.isInteger(page) || page < 1 || page > plan.count || Number.isNaN(Date.parse(at))) continue;
    byPage.set(page, { page, at: new Date(at).toISOString(), ...((r as { signed?: unknown }).signed === true ? { signed: true } : {}) });
  }
  // Les pages à confirmer : celles qui portent un champ à cliquer — les pages
  // de certificat ajoutées après la signature du client n'en ont pas. Sans le
  // détail des champs, toutes les pages.
  const required = plan.fields
    ? [...new Set(plan.fields.filter(isActionField).map((f) => f.page))].sort((a, b) => a - b)
    : Array.from({ length: plan.count }, (_, i) => i + 1);
  const missing = required.filter((p) => {
    const c = byPage.get(p);
    return !c || (plan.signaturePages.includes(p) && !c.signed);
  });
  return missing.length ? { ok: false, missing } : { ok: true, list: [...byPage.values()].sort((a, b) => a.page - b.page) };
}

/**
 * Une MISE À JOUR du contrat attend la signature du client : TIM a envoyé une
 * nouvelle version (v2, v3…) alors qu'une précédente est déjà signée. L'étape
 * « Contrat » de l'espace client se rouvre sur elle — sans rien défaire
 * ailleurs : la version signée reste en vigueur jusqu'à la nouvelle signature,
 * le statut de la fiche, la mise en production et la facturation ne bougent pas.
 *
 * Renvoie la version envoyée (numéro, référence), ou null.
 */
export async function pendingContractUpdate(
  payload: Payload,
  client: PortalClient,
): Promise<{ version: number; reference: string } | null> {
  const toSign = (client as Record<string, unknown>).contractToSignDocument;
  const toSignId = relId(toSign);
  if (toSignId == null) return null;
  const contracts = (
    await payload.find({
      collection: "client-contracts",
      where: { client: { equals: client.id } },
      sort: "-version",
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as { status?: string; version?: number; reference?: string; pdf?: unknown }[];
  const sent = contracts.find((c) => c.status === "envoye");
  const pdfId = relId(sent?.pdf);
  const hasSigned = contracts.some((c) => [...SIGNED_CONTRACT_STATUSES, "remplace"].includes(c.status as never));
  if (!sent || !hasSigned || String(pdfId) !== String(toSignId)) return null;
  return { version: sent.version ?? 2, reference: sent.reference ?? "" };
}

/**
 * Le contrat GÉNÉRÉ (collection client-contracts) que présente ce document, s'il
 * est envoyé et en attente du client. Un contrat généré se contresigne : le
 * client ne reçoit son exemplaire qu'une fois TIM signataire à son tour.
 */
export async function sentGeneratedContract(
  payload: Payload,
  clientId: number | string,
  documentId: number | string,
): Promise<{ id: number | string; reference: string } | null> {
  const found = (
    await payload.find({
      collection: "client-contracts",
      where: { and: [{ client: { equals: clientId } }, { status: { equals: "envoye" } }] },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as { id: number | string; reference?: string; pdf?: unknown }[];
  const c = found.find((x) => String(relId(x.pdf)) === String(documentId));
  return c ? { id: c.id, reference: c.reference ?? "" } : null;
}

// Lu aussi par la mise en production (sans pdf-lib) : il vit avec le cycle de vie.
export { awaitingCountersign } from "@/modules/partner/lib/contract-lifecycle";
