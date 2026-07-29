import type { CollectionBeforeChangeHook } from "payload";

import { hasAdminRole, isPartner, partnerIdOf } from "@/core/access";

/**
 * Anti-usurpation : à la création/modification d'un document lié à un partenaire
 * (clients, soumissions, commandes…), un utilisateur de rôle partenaire est
 * FORCÉ sur SA propre fiche — il ne peut jamais rattacher un document à la fiche
 * d'un autre partenaire. Les admins gardent la main sur n'importe quelle fiche.
 *
 * @param fieldName nom du champ relation vers `partners` (défaut "partner").
 */
export const enforcePartnerField =
  (fieldName = "partner"): CollectionBeforeChangeHook =>
  ({ data, req }) => {
    if (!hasAdminRole(req.user) && isPartner(req.user)) {
      const pid = partnerIdOf(req.user);
      if (pid != null) data[fieldName] = pid;
    }
    return data;
  };
