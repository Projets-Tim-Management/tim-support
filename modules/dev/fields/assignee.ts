import type { Field } from "payload";

import { ROLES } from "@/core/access";

/**
 * « Assigné à » — un ou plusieurs membres de l'équipe TIM, partout où l'on
 * attribue du travail : un développement, une feature, un point de checklist.
 *
 * Une seule définition pour les trois : le champ doit se comporter, se nommer et
 * se filtrer de la même façon, sinon on finit avec trois listes différentes de
 * personnes assignables.
 *
 * ⚠️ La liste est restreinte aux rôles INTERNES. Les comptes partenaires
 * (apporteurs d'affaires, utilisateurs du programme de points) partagent la même
 * collection `users` : sans ce filtre, on pourrait assigner un développement à
 * un client — et lui « attribuer » un travail qu'il ne verra jamais.
 */
export const TIM_TEAM_ROLES: string[] = [ROLES.superAdmin, ROLES.admin, ROLES.support];

export const assigneeField = (options?: {
  /** Par défaut `assignee` ; `askedTo` pour la personne dont on attend une réponse. */
  name?: string;
  label?: string;
  description?: string;
  position?: "sidebar";
  className?: string;
  /** Largeur dans une rangée (`type: "row"`). */
  width?: string;
  /**
   * Rendu en rangée d'avatars plutôt qu'en menu déroulant (voir AssigneePicker).
   * Réservé aux endroits qui ont la place de montrer l'équipe entière.
   */
  picker?: boolean;
  /** Plusieurs personnes sur le même travail (le cas courant). */
  hasMany?: boolean;
}): Field => ({
  name: options?.name ?? "assignee",
  type: "relationship",
  relationTo: "users",
  ...(options?.hasMany ? { hasMany: true } : {}),
  label: options?.label ?? "Assigné à",
  index: true,
  filterOptions: () => ({ roles: { in: TIM_TEAM_ROLES } }),
  admin: {
    ...(options?.position ? { position: options.position } : {}),
    ...(options?.className ? { className: options.className } : {}),
    ...(options?.width ? { width: options.width } : {}),
    // Aucun `required` nulle part : on assigne quand on sait, pas pour remplir
    // un champ. Une tâche sans nom dessus est une tâche que l'équipe prend.
    description: options?.description ?? "Facultatif — le membre de l'équipe TIM qui s'en occupe.",
    allowCreate: false,
    ...(options?.picker
      ? { components: { Field: "/modules/dev/admin/AssigneePicker#AssigneePicker" } }
      : {}),
  },
});
