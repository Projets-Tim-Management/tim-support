/**
 * Structure hiérarchique du menu de l'admin (groupes → sous-groupes repliables).
 *
 * Payload ne gère qu'un seul niveau de menu via `admin.group`. Ce fichier décrit
 * un 2ᵉ niveau : pour chaque groupe de 1er niveau (= la valeur `admin.group` d'une
 * collection), on donne l'ORDRE d'affichage sous forme d'items qui sont soit :
 *   - une chaîne = slug d'une collection, rendue directement dans le groupe ;
 *   - un objet { label, slugs } = sous-groupe repliable (clic) regroupant des
 *     collections.
 *
 * 👉 Pour réorganiser le menu, il suffit d'éditer NAV_LAYOUT ci-dessous : pas de
 *    code à toucher. Un slug non listé ici reste affiché (à la fin du groupe,
 *    dans l'ordre de Payload) → aucune collection ne disparaît jamais du menu.
 */

export interface NavSubGroup {
  /** Titre du sous-groupe repliable (aussi la clé de mémorisation ouvert/fermé). */
  label: string;
  /** Slugs des collections rangées dans ce sous-groupe, dans l'ordre. */
  slugs: string[];
}

/** Un item de groupe : un slug rendu directement, ou un sous-groupe repliable. */
export type NavItem = string | NavSubGroup;

/** Layout par groupe de 1er niveau (clé = valeur exacte de `admin.group`). */
export const NAV_LAYOUT: Record<string, NavItem[]> = {
  Éditorial: [
    "features",
    "parcours",
    { label: "Paramètres", slugs: ["feature-categories", "platforms"] },
  ],
  Partenaires: [
    { label: "Comptes", slugs: ["partners", "partner-clients"] },
    { label: "Missions", slugs: ["missions", "mission-submissions"] },
    { label: "Récompenses", slugs: ["rewards", "reward-orders"] },
    { label: "Points", slugs: ["point-transactions"] },
  ],
};

export function isSubGroup(item: NavItem): item is NavSubGroup {
  return typeof item !== "string";
}
