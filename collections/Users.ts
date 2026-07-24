import type { Access, CollectionConfig } from "payload";

/**
 * Vrai si l'utilisateur porte le rôle "admin". Écrit défensivement pour ne pas
 * dépendre des types générés (payload-types.ts) qui arriveront plus tard.
 */
const hasAdminRole = (user: unknown): boolean =>
  Boolean(
    user &&
      typeof user === "object" &&
      Array.isArray((user as { roles?: unknown }).roles) &&
      ((user as { roles: unknown[] }).roles).includes("admin"),
  );

const isAdmin: Access = ({ req: { user } }) => hasAdminRole(user);

/** Un admin voit/modifie tout ; un non-admin, uniquement son propre compte. */
const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (hasAdminRole(user)) return true;
  if (user) return { id: { equals: (user as { id: string | number }).id } };
  return false;
};

/**
 * Utilisateurs du back-office.
 *
 * SÉCURITÉ — pas d'auto-inscription :
 *  - `access.create` = admins uniquement → personne ne peut créer un compte
 *    sans être un admin connecté. C'est TOI qui crées les accès.
 *  - `access.admin`  = admins uniquement → seuls les admins entrent dans /admin.
 *  - Le champ `roles` n'est modifiable que par un admin (anti-escalade).
 *
 * Exception unique : tant que la base ne contient AUCUN utilisateur, Payload
 * autorise la création du tout premier compte via /admin (« Create first
 * user ») — c'est comme ça que tu crées ton super-admin. Ensuite, verrouillé.
 */
export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
    defaultColumns: ["name", "email", "roles"],
  },
  auth: true,
  access: {
    admin: ({ req: { user } }) => hasAdminRole(user),
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  fields: [
    {
      name: "name",
      type: "text",
      label: "Nom",
    },
    {
      name: "roles",
      type: "select",
      label: "Rôles",
      hasMany: true,
      defaultValue: ["admin"],
      options: [
        { label: "Admin", value: "admin" },
        { label: "Partenaire", value: "partner" },
      ],
      access: {
        create: ({ req: { user } }) => hasAdminRole(user),
        update: ({ req: { user } }) => hasAdminRole(user),
      },
    },
  ],
};
