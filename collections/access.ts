import type { Access } from "payload";

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
