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
  /** Liens libres (vues custom) rendus après les collections du sous-groupe. */
  links?: NavLink[];
}

/** Lien libre vers une vue custom (hors collection). */
export interface NavLink {
  label: string;
  /** Chemin absolu, ex. « /admin/analyses/acquisition ». */
  href: string;
  /** Réservé aux admins : les autres rôles ne voient pas le lien. */
  adminOnly?: boolean;
  /**
   * La collection que ce lien affiche filtrée (« ?where[…] ») : elle ne réapparaît
   * pas en plus dans le menu. Plusieurs liens peuvent montrer la même collection.
   */
  slug?: string;
  /** La clé d'icône (`#nav-<clé>` dans nav.scss), quand le chemin ne peut pas en faire une (filtre). */
  icon?: string;
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
  "Publicité",
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
      // Les modèles d'e-mail sont ici et non sous « Partenaires » : choisir les
      // mots d'un message, c'est du marketing, même quand l'envoi part d'une
      // opportunité (décision du 21/09/2026).
      slugs: ["marketing-journeys", "sequences", "forms", "email-templates", "email-suppressions"],
    },
  ],
  /**
   * Deux groupes de TÊTE distincts, et la coupure est celle du métier :
   * « Partenaires », ce qu'on ouvre pour travailler sur un dossier ;
   * « Utilisateur », le programme de points vu du partenaire.
   */
  Partenaires: ["partners", "partner-clients"],
  /**
   * Les campagnes payantes, toutes régies. Les campagnes d'abord — c'est ce qu'on
   * regarde ; les comptes et les garde-fous se règlent une fois, ils vont dans
   * « Paramètres ». Admin seul (plan Publicité, D1).
   */
  Publicité: [
    { label: "Tableau de bord", href: "/admin/publicite", adminOnly: true },
    { label: "À valider", href: "/admin/publicite/a-valider", adminOnly: true },
    "ad-campaigns",
    "ad-creatives",
    // Une seule collection, deux listes : la matière première des vidéos (montée par les agents), et les
    // inspirations (des pubs dont l'IA tire le style, jamais montées).
    { label: "Rushes", href: "/admin/collections/ad-rushes?where[use][equals]=matiere", adminOnly: true, slug: "ad-rushes", icon: "ad-rushes" },
    { label: "Inspirations", href: "/admin/collections/ad-rushes?where[use][equals]=inspiration", adminOnly: true, slug: "ad-rushes", icon: "ad-inspirations" },
    // Ce que l'agent a fait, puis pourquoi.
    "ad-agent-runs",
    "ad-decisions",
    // Ce que l'agent doit respecter, et ce qu'il a appris : lu à chaque lancement.
    "ad-instructions",
    "ad-learnings",
    "ad-metrics-daily",
    // Paramètres toujours en dernier. La matière des créas d'abord (kit, faits, médias, concurrents), puis les réglages.
    { label: "Paramètres", slugs: ["ads-brand-kit", "ad-styles", "ad-facts", "ad-media", "ad-competitors", "ad-accounts", "ads-settings", "ads-settings-history", "ad-ai-usage"] },
  ],
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
    {
      label: "Paramètres",
      slugs: ["dev-statuses"],
      links: [{ label: "Modèles d'e-mail", href: "/admin/dev/modeles-email", adminOnly: true }],
    },
  ],
  /**
   * Les réglages : comptes, apparence, boîtes connectées — et les connexions
   * DU SUPPORT (Pennylane, Brevo, INSEE, Google) : état des variables, test,
   * notes. Aucune clé saisie là : elles vivent sur Vercel.
   */
  Système: [
    "users",
    "appearance",
    // L'identité de la société, puis le modèle du contrat qui la cite.
    // Réservés à TIM (invisibles aux autres rôles).
    "company-settings",
    "contract-settings",
    // Le programme type des formations (par profil).
    "training-settings",
    "mailbox-connections",
    "media",
    { label: "Connexions du support", href: "/admin/connexions-support", adminOnly: true },
  ],
};

export function isSubGroup(item: NavItem): item is NavSubGroup {
  return typeof item !== "string" && "slugs" in item;
}

export function isLink(item: NavItem): item is NavLink {
  return typeof item !== "string" && "href" in item;
}

/** Les adresses des liens libres du menu, pour départager deux liens imbriqués. */
const LINK_HREFS = Object.values(NAV_LAYOUT)
  .flat()
  .filter(isLink)
  .map((l) => l.href)
  // Une liste filtrée ne départage rien : elle s'allume sur son seul filtre.
  .filter((h) => !h.includes("?"));

/**
 * Vrai si la page courante correspond à ce lien (règle de Payload : l'adresse,
 * ou une sous-page), SAUF si un lien plus précis du menu y correspond aussi :
 * sur « /admin/publicite/a-valider », « À valider » s'allume, pas « Tableau de
 * bord » (/admin/publicite) avec lui. `search` : la chaîne de requête courante,
 * pour les liens vers une liste filtrée.
 */
export function isActiveHref(pathname: string, href: string, hrefs: readonly string[] = LINK_HREFS, search = ""): boolean {
  // Une liste filtrée (« …/ad-rushes?where[use][equals]=inspiration ») : la liste elle-même, avec ce filtre.
  const q = href.indexOf("?");
  if (q >= 0) {
    const current = new URLSearchParams(search);
    return pathname === href.slice(0, q) && [...new URLSearchParams(href.slice(q + 1))].every(([k, v]) => current.get(k) === v);
  }
  const matches = (h: string) => pathname.startsWith(h) && ["/", undefined].includes(pathname[h.length]);
  return matches(href) && !hrefs.some((other) => other.length > href.length && other.startsWith(href) && matches(other));
}
