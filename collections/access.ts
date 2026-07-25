import type { Access, CollectionConfig } from "payload";

/**
 * Contrôles d'accès partagés par les collections Payload.
 *
 * Écrits défensivement (sans dépendre des types générés) pour rester valides
 * tant que payload-types.ts n'est pas régénéré.
 */

/** Vrai si l'utilisateur connecté porte le rôle "admin". */
export const hasAdminRole = (user: unknown): boolean =>
  Boolean(
    user &&
      typeof user === "object" &&
      Array.isArray((user as { roles?: unknown }).roles) &&
      ((user as { roles: unknown[] }).roles).includes("admin"),
  );

/** Accès réservé aux admins. */
export const isAdmin: Access = ({ req: { user } }) => hasAdminRole(user);

/** Lecture publique (contenu éditorial : articles, features, parcours…). */
export const anyone: Access = () => true;

/** Admin = tout ; sinon uniquement son propre document (par id). */
export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (hasAdminRole(user)) return true;
  if (user) return { id: { equals: (user as { id: string | number }).id } };
  return false;
};

/**
 * Politique d'accès du contenu éditorial : lecture publique, écriture admin.
 * Partagée par toutes les collections éditoriales (articles, features…).
 */
export const editorialAccess: CollectionConfig["access"] = {
  read: anyone,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
};

/**
 * Politique d'accès du métier / support : réservé aux admins.
 * Les données partenaires (points, missions, récompenses…) sont servies au
 * front par le serveur Next via la Local API (accès surchargé côté serveur),
 * jamais en lecture publique directe.
 */
export const adminOnly: CollectionConfig["access"] = {
  read: isAdmin,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
};
