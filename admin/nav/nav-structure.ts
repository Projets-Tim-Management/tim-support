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

/** Lien libre vers une vue custom (hors collection). */
export interface NavLink {
  label: string;
  /** Chemin absolu, ex. « /admin/analyses/acquisition ». */
  href: string;
  /** Réservé aux admins : les autres rôles ne voient pas le lien. */
  adminOnly?: boolean;
}

/** Un item de groupe : un slug, un sous-groupe repliable, ou un lien libre. */
export type NavItem = string | NavSubGroup | NavLink;

/**
 * ORDRE des groupes de 1er niveau dans le menu.
 *
 * Sans lui, l'ordre venait de celui des collections dans `payload.config.ts` :
 * déplacer un groupe demandait de réordonner des imports, et le résultat était
 * imprévisible. Ici il se lit et se change en une ligne.
 *
 * Un groupe absent de cette liste n'est pas perdu : il s'affiche à la fin, dans
 * l'ordre de Payload — même principe que pour les slugs non listés plus bas.
 */
export const NAV_ORDER = [
  "Support",
  "Développements",
  "Partenaires",
  "Facturation",
  "Analyses",
  "Utilisateurs",
  "Éditorial",
  "Marketing",
  "Système",
];

/**
 * Layout par groupe de 1er niveau (clé = valeur exacte de `admin.group`).
 *
 * Un groupe peut n'avoir AUCUNE collection derrière lui (« Facturation ») : il
 * n'existe que par ses liens libres. Il est alors rendu quand même, à sa place
 * dans NAV_ORDER, avec l'icône déclarée sous son libellé dans `$group-icons`
 * (nav.scss) — et disparaît si aucun de ses liens n'est visible pour le rôle.
 */
export const NAV_LAYOUT: Record<string, NavItem[]> = {
  Éditorial: [
    "features",
    "parcours",
    { label: "Paramètres", slugs: ["feature-categories", "platforms"] },
  ],
  /**
   * Deux objets, le même motif : un modèle qui porte le contenu, une instance
   * qui porte le calendrier. Les instances côte à côte, les modèles côte à côte
   * dans les paramètres — c'est ce qui rend la parenté lisible.
   */
  Marketing: [
    "journey-runs",
    "sequence-runs",
    "form-submissions",
    {
      label: "Paramètres",
      slugs: ["marketing-journeys", "sequences", "forms", "email-suppressions"],
    },
  ],
  /**
   * Deux groupes de TÊTE distincts, et la coupure est celle du métier :
   * « Partenaires », ce qu'on ouvre pour travailler sur un dossier ;
   * « Utilisateur », le programme de points vu du partenaire.
   */
  Partenaires: ["partners", "partner-clients"],
  /**
   * Ce que TIM facture. Aucune collection : l'écran lit Pennylane à la demande.
   * Réservé aux admins, les partenaires n'en voient rien.
   */
  Facturation: [{ label: "Rapprochement", href: "/admin/facturation", adminOnly: true }],
  /**
   * Les chiffres : une page par sujet, des tableaux et des graphiques. Réservé
   * aux admins. Aucune collection derrière : ce sont des vues calculées.
   */
  Analyses: [
    { label: "Facturation", href: "/admin/analyses/facturation", adminOnly: true },
    { label: "Clients & pipeline", href: "/admin/analyses/pipeline", adminOnly: true },
    { label: "Acquisition", href: "/admin/analyses/acquisition", adminOnly: true },
    { label: "Support", href: "/admin/analyses/support", adminOnly: true },
    { label: "Développements", href: "/admin/analyses/developpements", adminOnly: true },
    { label: "Partenaires", href: "/admin/analyses/partenaires", adminOnly: true },
  ],
  Utilisateurs: [
    { label: "Missions", slugs: ["missions", "mission-submissions"] },
    { label: "Récompenses", slugs: ["rewards", "reward-orders"] },
    { label: "Points", slugs: ["point-transactions"] },
  ],
  /**
   * Ce qui est en cours d'abord — c'est l'écran qu'on ouvre tous les jours —
   * puis « Paramètres », qui met à distance ce qui se règle une fois : les
   * colonnes du Kanban. Une seule entrée dedans pour l'instant, et c'est bien
   * ainsi : ce qui se règle ne doit pas côtoyer ce qui se travaille.
   */
  Développements: [
    "developments",
    "integrations",
    { label: "Paramètres", slugs: ["dev-statuses"] },
  ],
  /** Les réglages : comptes, apparence, boîtes connectées. */
  Système: ["users", "appearance", "mailbox-connections", "media"],
};

export function isSubGroup(item: NavItem): item is NavSubGroup {
  return typeof item !== "string" && "slugs" in item;
}

export function isLink(item: NavItem): item is NavLink {
  return typeof item !== "string" && "href" in item;
}
