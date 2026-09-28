import type { CollectionAfterChangeHook } from "payload";

import { relId } from "@/core/lib/relations";
import { SIGNED_CONTRACT_STATUSES } from "@/modules/partner/lib/contract-status";
import { isoDay } from "@/modules/partner/lib/contract-vars";

type Req = import("payload").PayloadRequest;
type Payload = import("payload").Payload;

/**
 * Les pièces de la fiche telles que PUBLIÉES avant l'enregistrement en cours.
 *
 * `previousDoc` est la dernière VERSION — un brouillon s'il y en a un. Publier
 * un brouillon qui portait déjà le contrat signé ne ferait alors rien
 * « arriver » : on compare à la dernière version publiée, relue ici avant
 * l'écriture (voir linkSignedContract, notifyDocumentAvailable).
 */
export const rememberPublishedDocs: import("payload").CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (operation !== "update" || data?._status === "draft" || originalDoc?.id == null) return data;
  const published = (await req.payload
    .findByID({ collection: "partner-clients", id: originalDoc.id, depth: 0, draft: false, overrideAccess: true, req })
    .catch(() => null)) as Record<string, unknown> | null;
  const ctx = req.context as { publishedDocs?: Record<string, Record<string, unknown> | null> };
  ctx.publishedDocs = { ...ctx.publishedDocs, [String(originalDoc.id)]: published };
  return data;
};

/** La valeur publiée d'une pièce avant l'enregistrement, sinon celle de la version précédente. */
export const publishedBefore = (req: Req, doc: { id?: unknown }, previousDoc: Record<string, unknown> | undefined, field: string): unknown => {
  const published = (req.context as { publishedDocs?: Record<string, Record<string, unknown> | null> }).publishedDocs?.[String(doc.id)];
  return published !== undefined ? published?.[field] : previousDoc?.[field];
};

/**
 * La signature du client est posée sur une version : « signée par le client »,
 * avec son PDF signé. C'est désormais le contrat de référence ; les versions
 * signées plus anciennes passent « remplacées » — elles restent dans
 * l'historique, rien n'est effacé.
 */
export async function recordClientSignature(
  payload: Payload,
  { contractId, clientId, signedDocument, signedAt, req }: { contractId: number | string; clientId: number | string; signedDocument: number | string; signedAt: string; req?: Req },
): Promise<void> {
  const opts = { overrideAccess: true, ...(req ? { req } : {}) } as const;
  const contracts = (
    await payload.find({ collection: "client-contracts", where: { client: { equals: clientId } }, sort: "-version", limit: 50, depth: 0, ...opts })
  ).docs as { id: number | string; status?: string; version?: number }[];
  const signed = contracts.find((c) => String(c.id) === String(contractId));
  await payload.update({
    collection: "client-contracts",
    id: contractId,
    data: { status: "signe-client", signedDocument, clientSignedAt: signedAt } as never,
    ...opts,
  });
  for (const older of contracts) {
    if (String(older.id) === String(contractId) || (older.version ?? 0) > (signed?.version ?? 0)) continue;
    if (!SIGNED_CONTRACT_STATUSES.includes(older.status as never)) continue;
    await payload.update({ collection: "client-contracts", id: older.id, data: { status: "remplace" } as never, ...opts });
  }
}

/**
 * Un contrat signé DÉPOSÉ sur la fiche (PDF signé déposé par TIM) : la version
 * envoyée dont c'est le document passe « signée par le client ».
 *
 * La signature en ligne, elle, pose la signature elle-même (sign/confirm, qui
 * réserve la version avant de signer) : ici, plus aucune version n'est alors
 * « envoyée », rien ne bouge. Un contrat signé hors du générateur non plus :
 * le PDF déposé fait foi, comme avant.
 */
export const linkSignedContract: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  // Un brouillon de la fiche n'engage rien : seul l'enregistrement publié compte.
  if (doc?._status === "draft") return doc;
  const signed = relId(doc?.contractDocument);
  const before = relId(publishedBefore(req, doc, previousDoc, "contractDocument"));
  if (signed == null || String(signed) === String(before ?? "")) return doc;

  const sent = (
    await req.payload.find({
      collection: "client-contracts",
      where: { and: [{ client: { equals: doc.id } }, { status: { equals: "envoye" } }] },
      limit: 5,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs as { id: number | string; pdf?: unknown }[];
  // Seulement la version dont la fiche présentait le PDF à signer.
  const match = sent.find((c) => String(relId(c.pdf)) === String(relId(doc.contractToSignDocument)));
  if (!match) return doc;

  await recordClientSignature(req.payload, {
    contractId: match.id,
    clientId: doc.id,
    signedDocument: signed,
    // La date de signature de la fiche est celle du PREMIER contrat : pour une
    // mise à jour (v2…), c'est aujourd'hui.
    signedAt: (before == null && doc.signatureDate) || new Date().toISOString(),
    req,
  });
  return doc;
};

/**
 * La date de début prévue au CONTRAT (conditions commerciales du contrat
 * généré), au format « AAAA-MM-JJ » : celle du contrat en vigueur, sinon de
 * celui qui part ou se prépare. C'est elle qu'on propose en passant l'affaire
 * « Gagnée » ou en activant le compte — modifiable, jamais imposée.
 */
export async function contractStartOf(
  payload: import("payload").Payload,
  clientId: number | string,
  req?: import("payload").PayloadRequest,
): Promise<{ date: string; reference: string } | null> {
  const contracts = (
    await payload.find({
      collection: "client-contracts",
      where: { and: [{ client: { equals: clientId } }, { status: { not_in: ["annule", "remplace"] } }] },
      sort: "-version",
      limit: 10,
      depth: 0,
      overrideAccess: true,
      ...(req ? { req } : {}),
    })
  ).docs as { status?: string; reference?: string; params?: { contractStartDate?: unknown } | null }[];
  const rank = (s?: string) => (SIGNED_CONTRACT_STATUSES.includes(s as never) ? 0 : s === "envoye" ? 1 : 2);
  // Le jour à Paris, que la date soit rangée en « AAAA-MM-JJ » ou complète.
  const withDate = contracts
    .map((c) => ({ c, date: isoDay(c.params?.contractStartDate) }))
    .filter((x): x is { c: (typeof contracts)[number]; date: string } => x.date != null)
    .sort((a, b) => rank(a.c.status) - rank(b.c.status));
  const first = withDate[0];
  return first ? { date: first.date, reference: first.c.reference ?? "" } : null;
}

/**
 * Une version est retirée (reprise en brouillon, ou annulée) : la fiche
 * retrouve le contrat EN VIGUEUR — la dernière version signée, avec son PDF
 * envoyé et son exemplaire signé — ou, s'il n'y en a pas, repasse « en
 * préparation ». `signed` : la version retirée avait été signée par le client,
 * son exemplaire est donc aussi à retirer de la fiche.
 *
 * `skipDocumentNotice` : remettre l'ancien PDF n'est pas un nouveau document à
 * signer, le client n'est pas prévenu (voir notifyDocumentAvailable).
 *
 * ⚠️ Comme tout enregistrement publié d'une fiche à brouillons, celui-ci publie
 * un brouillon en attente sur la fiche (comportement de Payload) — de même que
 * l'envoi et la signature.
 */
export async function restoreFicheContract(
  payload: import("payload").Payload,
  clientId: number | string,
  { signed }: { signed: boolean },
): Promise<void> {
  const inForce = (
    await payload.find({
      collection: "client-contracts",
      where: { and: [{ client: { equals: clientId } }, { status: { in: [...SIGNED_CONTRACT_STATUSES] } }] },
      sort: "-version",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as { pdf?: unknown; signedDocument?: unknown; countersignedDocument?: unknown } | undefined;

  const data: Record<string, unknown> = inForce
    ? { contractToSignDocument: relId(inForce.pdf) }
    : { contractToSignDocument: null, contractSentAt: null };
  if (signed) {
    Object.assign(
      data,
      inForce
        ? { contractDocument: relId(inForce.countersignedDocument) ?? relId(inForce.signedDocument) }
        : { contractDocument: null, signatureDate: null },
    );
  }
  await payload.update({
    collection: "partner-clients",
    id: clientId,
    data: data as never,
    overrideAccess: true,
    context: { skipDocumentNotice: true },
  });
}

/** Un contrat signé par le client attend la contresignature de TIM. */
export async function awaitingCountersign(payload: import("payload").Payload, clientId: number | string): Promise<boolean> {
  const res = await payload.count({
    collection: "client-contracts",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "signe-client" } }] },
    overrideAccess: true,
  });
  return res.totalDocs > 0;
}
