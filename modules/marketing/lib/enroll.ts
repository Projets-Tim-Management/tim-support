import type { Payload, PayloadRequest } from "payload";

import { isSuppressed } from "@/core/lib/email-suppression";
import { planMessages, type SequenceDoc } from "@/modules/marketing/lib/sequences";

/**
 * Ouverture d'une séquence pour une opportunité.
 *
 * Écrit ici et pas dans le hook parce qu'il y a maintenant DEUX portes d'entrée :
 * la perte de l'affaire, et la fin d'une séquence qui enchaîne sur une autre.
 * Les garde-fous (adresse désinscrite, séquence déjà en cours) doivent être les
 * mêmes des deux côtés — c'est précisément le genre de contrôle qu'on oublie de
 * recopier sur le second chemin.
 */

/** Besoins cochés au formulaire, s'il y en a un derrière cette fiche. */
export async function besoinsOf(payload: Payload, submission: unknown): Promise<string[]> {
  const id =
    submission && typeof submission === "object" ? (submission as { id?: unknown }).id : submission;
  if (id == null) return [];
  try {
    const doc = (await payload.findByID({
      collection: "form-submissions",
      id: id as number,
      depth: 0,
      overrideAccess: true,
    })) as { answers?: { besoins?: unknown } } | null;
    const besoins = doc?.answers?.besoins;
    return Array.isArray(besoins) ? besoins.map(String) : [];
  } catch {
    // Sans les besoins, la séquence part dans l'ordre par défaut : moins bien
    // ciblée, mais elle part. C'est préférable à ne pas enrôler du tout.
    return [];
  }
}

export interface EnrollArgs {
  clientId: number | string;
  email: string;
  sequence: SequenceDoc;
  besoins?: string[];
  req?: PayloadRequest;
}

/**
 * @returns la raison pour laquelle rien n'a été ouvert, ou `null` si la séquence
 * l'a bien été. Un appelant qui veut journaliser sait ainsi quoi dire.
 */
export async function enrollInSequence(
  payload: Payload,
  { clientId, email, sequence, besoins = [], req }: EnrollArgs,
): Promise<string | null> {
  const address = email.trim().toLowerCase();
  if (!address) return "aucune adresse";
  if (!sequence.key) return "séquence sans clé";

  // Une adresse déjà désinscrite ne mérite pas une séquence qui n'enverra jamais
  // rien : on ne crée pas la ligne plutôt que d'en créer une morte.
  if (await isSuppressed(payload, address)) return "adresse désinscrite";

  // Un prospect recontacté puis reperdu ne doit pas cumuler deux séquences.
  const running = await payload.count({
    collection: "sequence-runs",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "en-cours" } }] },
    overrideAccess: true,
  });
  if (running.totalDocs > 0) return "une séquence est déjà en cours";

  const startedAt = new Date();
  const messages = planMessages(sequence.messages ?? [], besoins, startedAt);
  if (messages.length === 0) return "séquence sans message";

  await payload.create({
    collection: "sequence-runs",
    data: {
      client: clientId,
      email: address,
      sequence: sequence.key,
      sequenceLabel: sequence.label,
      status: "en-cours",
      startedAt: startedAt.toISOString(),
      messages,
    } as never,
    overrideAccess: true,
    ...(req ? { req } : {}),
  });

  return null;
}
