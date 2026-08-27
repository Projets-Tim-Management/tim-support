import type { CollectionBeforeChangeHook } from "payload";

import { needsLossReason } from "@/modules/partner/lib/lossReason";

/**
 * Une affaire ne s'arrête pas sans qu'on dise POURQUOI.
 *
 * « Perdue », « Résilié », « Archivé » : ces trois statuts ferment une
 * opportunité. Les accepter sans motif, c'est se condamner à regarder un taux de
 * perte sans jamais savoir sur quoi agir — et personne ne revient renseigner la
 * raison trois semaines plus tard.
 *
 * Le modal la demande au moment du geste, mais le statut se change aussi depuis
 * l'API ou un import : la règle vit donc ici, sinon elle n'existe que dans un
 * écran.
 *
 * Comme les autres garde-fous du module, seule la TRANSITION est contrôlée : une
 * fiche déjà close n'est pas re-contrôlée, pour ne pas bloquer la correction
 * d'une opportunité archivée avant l'existence du champ.
 */
export const requireLossReason: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const status = data?.clientStatus;
  if (!needsLossReason(status)) return data;
  if (status === originalDoc?.clientStatus) return data;
  if (data?.lossReason ?? originalDoc?.lossReason) return data;

  throw new Error(
    "Motif requis pour clore cette opportunité : indiquez pourquoi elle s'arrête.",
  );
};
