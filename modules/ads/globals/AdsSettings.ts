import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Publicité › Paramètres › Garde-fous (plan Publicité, §6).
 *
 * Phase 0 : l'interrupteur général seulement — le plafond mensuel est porté par
 * chaque compte publicitaire. Les autres garde-fous arrivent avec la phase qui
 * les fait respecter : un réglage que rien n'applique ferait croire à une
 * protection qui n'existe pas.
 */
export const AdsSettings: GlobalConfig = {
  slug: "ads-settings",
  label: "Garde-fous",
  admin: {
    group: "Publicité",
    description: "Ce que les agents publicitaires n'ont pas le droit de faire. Réservé à TIM.",
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      name: "enabled",
      type: "checkbox",
      label: "Interrupteur général",
      defaultValue: true,
      admin: {
        description:
          "Décoché : aucun agent ne tourne, aucune décision ne s'exécute. La synchro des chiffres, elle, continue — elle ne fait que lire.",
      },
    },
  ],
};
