import type { CollectionBeforeChangeHook } from "payload";

/**
 * Une affaire ne passe « Gagnée » que si son contrat a une DATE DE DÉBUT.
 *
 * C'est cette date qui enclenche l'abonnement mensuel : sans elle, la fiche
 * afficherait « Gagnée » avec un CA et une commission à zéro, sans que rien
 * n'indique pourquoi. Le Kanban et le champ « Statut » la demandent dans un
 * modal, mais le statut se change aussi depuis l'API REST ou un import : la
 * règle vit donc côté serveur, sinon elle n'existe que dans un écran.
 *
 * Même esprit que `requireTestSchedule` : on ne contrôle que la TRANSITION —
 * une fiche déjà gagnée n'est pas re-contrôlée, pour ne pas verrouiller
 * l'édition d'un client hérité dont la date manquerait.
 */
export const requireContractStart: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (data?.clientStatus !== "actif") return data;
  if (originalDoc?.clientStatus === "actif") return data;
  // Sortie de secours, identique à celle de `requireTestSchedule` : quand c'est
  // le PARCOURS qui pilote le statut (affaire gagnée), il fournit lui-même la
  // date de début de contrat. Sans cette exception, l'exception levée ici tuait
  // la transaction Payload : la mise en « gagné » d'un parcours renvoyait 200 et
  // n'enregistrait rien.
  if ((req?.context as { fromJourneySync?: boolean })?.fromJourneySync) return data;
  if (data?.contractStartDate ?? originalDoc?.contractStartDate) return data;

  throw new Error(
    "Date de début de contrat requise pour passer l'affaire en « Gagnée » : " +
      "c'est elle qui déclenche le calcul des licences mensuelles.",
  );
};
