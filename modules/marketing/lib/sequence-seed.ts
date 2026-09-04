import type { Payload } from "payload";

import { SEED_SEQUENCES } from "@/modules/marketing/lib/sequence-contents";

/**
 * Sème les séquences livrées avec le code au démarrage.
 *
 * ⚠️ Ne CRÉE que ce qui manque, ne réécrit jamais l'existant : une fois qu'un
 * texte a été retouché ou qu'une image y a été posée, le code n'a plus rien à y
 * dire. Un semis qui « remet à jour » effacerait le travail de quelqu'un au
 * prochain démarrage.
 */
/**
 * 1 → semis initial.
 * 2 → réponse du prospect (`stopOnReply`) et enchaînement (`nextSequence`).
 */
const SEED_VERSION = 2;

/**
 * Applique UNE FOIS les réglages apparus après la création d'une séquence.
 *
 * Le repère est `seedVersion`, et surtout PAS « le champ est-il vide ? ».
 * Ajouter une colonne booléenne avec un `DEFAULT` remplit les lignes existantes
 * au moment de la migration : le champ n'est jamais vide, et un semis qui
 * attendrait un vide ne corrigerait jamais rien. La version, elle, dit ce que
 * cette ligne a réellement reçu.
 *
 * Une seule passe par version : ce qui a été modifié ensuite en back-office
 * reste modifié — c'est une décision commerciale, le code n'y revient pas.
 *
 * L'enchaînement se pose ici et pas dans la boucle de création : il désigne une
 * AUTRE séquence, qui peut ne pas exister encore quand celle-ci est créée.
 */
async function completeSettings(payload: Payload): Promise<void> {
  for (const seq of SEED_SEQUENCES) {
    const doc = (
      await payload.find({
        collection: "sequences",
        where: { key: { equals: seq.key } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
    ).docs[0] as { id: number | string; seedVersion?: number | null } | undefined;
    if (!doc || (doc.seedVersion ?? 0) >= SEED_VERSION) continue;

    const patch: Record<string, unknown> = { stopOnReply: seq.stopOnReply, seedVersion: SEED_VERSION };

    if (seq.nextSequenceKey) {
      const target = (
        await payload.find({
          collection: "sequences",
          where: { key: { equals: seq.nextSequenceKey } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
      ).docs[0];
      // Cible absente : on ne pose PAS la version, pour réessayer au prochain
      // démarrage plutôt que de laisser une séquence sans suite pour toujours.
      if (!target) continue;
      patch.nextSequence = target.id;
    }

    await payload
      .update({ collection: "sequences", id: doc.id, data: patch as never, overrideAccess: true })
      .then(() =>
        payload.logger.info(
          `[séquence] « ${seq.label} » : réponse ${seq.stopOnReply ? "arrête" : "n'arrête pas"} la séquence` +
            `${seq.nextSequenceKey ? `, enchaîne sur « ${seq.nextSequenceKey} »` : ""}.`,
        ),
      )
      .catch((e) => payload.logger.error(`[séquence] réglages de « ${seq.key} » : ${e}`));
  }
}

export async function seedSequences(payload: Payload): Promise<void> {
  for (const seq of SEED_SEQUENCES) {
    try {
      const existing = await payload.find({
        collection: "sequences",
        where: { key: { equals: seq.key } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      if (existing.docs.length) continue;

      await payload.create({
        collection: "sequences",
        data: {
          key: seq.key,
          label: seq.label,
          description: seq.description,
          lossReasons: seq.lossReasons,
          active: seq.active,
          stopOnReply: seq.stopOnReply,
          fromEmail: seq.fromEmail,
          signature: seq.signature,
          seedVersion: SEED_VERSION,
          messages: seq.messages.map((m) => ({
            key: m.key,
            style: m.style,
            delayValue: m.delayValue,
            delayUnit: m.delayUnit,
            besoin: m.besoin,
            title: m.title,
            subject: m.subject,
            paragraphs: m.paragraphs.map((text) => ({ text })),
            payoff: m.payoff,
            cta: m.cta,
            url: m.url,
          })),
        } as never,
        overrideAccess: true,
      });
      payload.logger.info(
        `[séquence] « ${seq.label} » créée (${seq.messages.length} messages${seq.active ? "" : ", inactive"}).`,
      );
    } catch (err) {
      payload.logger.error(`[séquence] semis de « ${seq.key} » échoué : ${err}`);
    }
  }

  await completeSettings(payload);
}
