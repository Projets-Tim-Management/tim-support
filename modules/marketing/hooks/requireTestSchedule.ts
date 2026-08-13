import type { CollectionBeforeChangeHook } from "payload";

/**
 * Un client ne passe « En test » que si sa phase de test est DATÉE.
 *
 * Le Kanban demande la date dans un modal, mais le statut se change aussi depuis
 * la fiche, l'API REST ou un import : la règle doit vivre côté serveur, sinon
 * elle n'existe que dans un écran. Sans date de démarrage, un parcours n'a ni
 * échéances d'étapes, ni séquence d'e-mails — il est inerte.
 *
 * Deux sorties de secours volontaires :
 *  - la synchronisation venue du parcours lui-même (`req.context.fromJourneySync`)
 *    n'est pas contrôlée : c'est le parcours qui pilote, il ne peut pas se
 *    bloquer lui-même ;
 *  - un client DÉJÀ en test n'est pas re-contrôlé (on ne veut pas verrouiller
 *    l'édition d'une fiche à cause d'un parcours mal renseigné en amont).
 */
const CLOSED = ["gagne", "perdu", "annule"];

export const requireTestSchedule: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (data?.clientStatus !== "en-test") return data;
  if (originalDoc?.clientStatus === "en-test") return data;
  if ((req.context as { fromJourneySync?: boolean })?.fromJourneySync) return data;

  // À la création, aucun parcours ne peut encore exister : on laisse passer et
  // la date se pose au démarrage du parcours.
  const clientId = operation === "create" ? null : originalDoc?.id;
  if (clientId == null) return data;

  const runs = await req.payload.find({
    collection: "journey-runs",
    where: { client: { equals: clientId }, status: { not_in: CLOSED } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });

  const run = runs.docs[0] as { startDate?: string } | undefined;
  if (!run) {
    throw new Error(
      "Aucune phase de test pour ce client. Démarrez-la depuis l'encart « Phase de test » de la barre latérale.",
    );
  }
  if (!run.startDate) {
    throw new Error(
      "La phase de test de ce client n'a pas de date de démarrage (un lundi). Renseignez-la avant de passer le client « En test ».",
    );
  }

  return data;
};
