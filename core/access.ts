import type { Access, CollectionConfig, FieldAccess } from "payload";

/**
 * Contrôles d'accès partagés par les collections Payload — SOURCE DE VÉRITÉ UNIQUE.
 *
 * Deux axes (voir docs/RBAC-PLAN.md) :
 *  - Axe A « row-level » : les fonctions renvoyant un `Where` scopent les LIGNES
 *    visibles (un partenaire ne voit que `partner = user.partner`).
 *  - Axe B « module-level » : une `read` réservée (ex. `isAdmin`) + `admin.hidden`
 *    cachent des SECTIONS entières à certains rôles.
 *
 * Posture DENY-BY-DEFAULT : chaque collection déclare explicitement qui accède à
 * quoi (aucune n'est ouverte par défaut). Écrit défensivement (sans dépendre des
 * types générés) pour rester valide tant que payload-types.ts n'est pas régénéré.
 */

// ─── Rôles ───────────────────────────────────────────────────────────────────
export const ROLES = {
  superAdmin: "super-admin",
  admin: "admin",
  partnerMetier: "partner-metier",
  partnerUtilisateur: "partner-utilisateur",
  support: "support",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Toutes les valeurs de rôle (pour construire le champ select). */
export const ALL_ROLES: Role[] = Object.values(ROLES);

// ─── Lecture défensive de l'utilisateur ──────────────────────────────────────
const rolesOf = (user: unknown): string[] =>
  user && typeof user === "object" && Array.isArray((user as { roles?: unknown }).roles)
    ? ((user as { roles: unknown[] }).roles as string[])
    : [];

const hasRole = (user: unknown, role: Role): boolean => rolesOf(user).includes(role);

/**
 * Id de la fiche partenaire rattachée au compte connecté (la « clé tenant »).
 * Le champ `Users.partner` (relationship) peut être un id brut ou un objet peuplé.
 * Renvoie null si absent → un rôle partenaire sans fiche est refusé par défaut.
 */
export const partnerIdOf = (user: unknown): string | number | null => {
  if (!user || typeof user !== "object") return null;
  const p = (user as { partner?: unknown }).partner;
  if (p == null) return null;
  if (typeof p === "object") {
    const id = (p as { id?: string | number }).id;
    return id ?? null;
  }
  return p as string | number;
};

// ─── Prédicats de rôle (booléens purs) ───────────────────────────────────────
export const isSuperAdmin = (user: unknown): boolean => hasRole(user, ROLES.superAdmin);

/** Vrai pour admin ET super-admin (le super-admin peut tout ce que l'admin peut). */
export const hasAdminRole = (user: unknown): boolean =>
  hasRole(user, ROLES.admin) || isSuperAdmin(user);

export const isPartnerMetier = (user: unknown): boolean => hasRole(user, ROLES.partnerMetier);
export const isPartnerUtilisateur = (user: unknown): boolean =>
  hasRole(user, ROLES.partnerUtilisateur);
export const isPartner = (user: unknown): boolean =>
  isPartnerMetier(user) || isPartnerUtilisateur(user);
export const isSupport = (user: unknown): boolean => hasRole(user, ROLES.support);

/** Tout rôle back-office valide → autorisé à entrer dans /admin. */
export const hasBackofficeRole = (user: unknown): boolean =>
  hasAdminRole(user) || isPartner(user) || isSupport(user);

// ─── Fonctions d'access de base (Access = booléen | Where | Promise) ──────────
/** Lecture publique (contenu éditorial : features, parcours…). */
export const anyone: Access = () => true;

/** Réservé aux admins (et super-admins). */
export const isAdmin: Access = ({ req: { user } }) => hasAdminRole(user);

/** Tout rôle back-office (entrée /admin, endpoints partagés). */
export const isBackoffice: Access = ({ req: { user } }) => hasBackofficeRole(user);

/** Admin = tout ; sinon uniquement son propre document (par id). */
export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (hasAdminRole(user)) return true;
  if (user) return { id: { equals: (user as { id: string | number }).id } };
  return false;
};

/** Admin ou partenaire-métier (ex. création de ses clients). */
export const isAdminOrMetier: Access = ({ req: { user } }) =>
  hasAdminRole(user) || isPartnerMetier(user);

/** Admin ou partenaire-utilisateur (ex. création de ses soumissions / commandes). */
export const isAdminOrUtilisateur: Access = ({ req: { user } }) =>
  hasAdminRole(user) || isPartnerUtilisateur(user);

/** Lecture d'un catalogue global (missions, récompenses) : admin + partenaire-utilisateur. */
export const canReadCatalog: Access = ({ req: { user } }) =>
  hasAdminRole(user) || isPartnerUtilisateur(user);

/** Périmètre support (tickets) : admin + support. */
export const canSupport: Access = ({ req: { user } }) => hasAdminRole(user) || isSupport(user);

// ─── admin.hidden : masquage nav/URL par rôle (axe B UI ; true = masqué) ─────
// Utilisés dans payload.config.ts pour cacher une collection du menu selon le
// rôle. La vraie sécurité reste l'access control (Phase 3) ; ceci soigne l'UX.
type HiddenArg = { user?: unknown };
export const hideUnlessAdmin = ({ user }: HiddenArg): boolean => !hasAdminRole(user);
export const hideUnlessAdminOrPartner = ({ user }: HiddenArg): boolean =>
  !(hasAdminRole(user) || isPartner(user));
export const hideUnlessMetier = ({ user }: HiddenArg): boolean =>
  !(hasAdminRole(user) || isPartnerMetier(user));
export const hideUnlessUtilisateur = ({ user }: HiddenArg): boolean =>
  !(hasAdminRole(user) || isPartnerUtilisateur(user));
export const hideUnlessSupport = ({ user }: HiddenArg): boolean =>
  !(hasAdminRole(user) || isSupport(user));

// ─── Row-level : scoping partenaire (axe A) ──────────────────────────────────
/**
 * Access pour la collection `partners` elle-même :
 * admin = toutes les fiches ; un rôle partenaire = UNIQUEMENT sa propre fiche.
 */
export const ownPartnerRecord: Access = ({ req: { user } }) => {
  if (hasAdminRole(user)) return true;
  const pid = partnerIdOf(user);
  if (isPartner(user) && pid != null) return { id: { equals: pid } };
  return false;
};

/**
 * Fabrique un access « row-level » pour les collections portant un champ
 * relation vers `partners` : admin = tout ; un partenaire dont le rôle satisfait
 * `allow` = seulement les lignes de SA fiche ; toute autre situation = refus.
 */
const scopedBy =
  (allow: (user: unknown) => boolean, fieldName: string): Access =>
  ({ req: { user } }) => {
    if (hasAdminRole(user)) return true;
    const pid = partnerIdOf(user);
    if (allow(user) && pid != null) return { [fieldName]: { equals: pid } };
    return false;
  };

/** Réservé au partenaire-MÉTIER (ex. ses clients). */
export const metierScoped = (fieldName = "partner"): Access => scopedBy(isPartnerMetier, fieldName);
/** Réservé au partenaire-UTILISATEUR (ex. ses soumissions, commandes, points). */
export const utilisateurScoped = (fieldName = "partner"): Access =>
  scopedBy(isPartnerUtilisateur, fieldName);

// ─── Field-level (axe B fin) ─────────────────────────────────────────────────
/** Le champ n'est modifiable que par un admin (ex. `roles`). */
export const adminOnlyField: FieldAccess = ({ req: { user } }) => hasAdminRole(user);

/** Le champ n'est lisible que par un admin (ex. champs internes TIM d'une fiche partenaire). */
export const adminOnlyFieldRead: FieldAccess = ({ req: { user } }) => hasAdminRole(user);

// ─── Politiques d'access réutilisables (collections entières) ────────────────
/** Éditorial : lecture publique, écriture admin. */
export const editorialAccess: CollectionConfig["access"] = {
  read: anyone,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
};

/** Catalogue en lecture pour un public back-office donné, écriture admin (missions, récompenses). */
export const catalogAccess = (canRead: Access): CollectionConfig["access"] => ({
  read: canRead,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
});

/**
 * Documents possédés par un partenaire-UTILISATEUR (soumissions, commandes) :
 * il voit et crée les siens ; la revue/traitement (update/delete) reste admin.
 * À combiner avec le hook enforcePartnerField (anti-usurpation à la création).
 */
export const utilisateurOwnedAccess: CollectionConfig["access"] = {
  read: utilisateurScoped(),
  create: isAdminOrUtilisateur,
  update: isAdmin,
  delete: isAdmin,
};

/** Grand livre en lecture seule pour un partenaire-utilisateur (points), écriture admin. */
export const utilisateurReadonlyAccess: CollectionConfig["access"] = {
  read: utilisateurScoped(),
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
};

/**
 * Documents possédés par un partenaire-MÉTIER (ses clients) : CRUD complet mais
 * scopé à sa fiche. À combiner avec le hook enforcePartnerField à la création.
 */
export const metierOwnedAccess: CollectionConfig["access"] = {
  read: metierScoped(),
  create: isAdminOrMetier,
  update: metierScoped(),
  delete: metierScoped(),
};
