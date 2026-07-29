import type { CollectionConfig } from "payload";

import { hasAdminRole, isAdmin, isAdminOrSelf } from "@/core/access";

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
  labels: { singular: "Utilisateur", plural: "Utilisateurs" },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["lastName", "firstName", "email", "roles"],
    group: "Système",
  },
  auth: true,
  access: {
    // `admin` doit renvoyer un booléen strict (pas de clause Where) :
    // on n'utilise donc pas isAdmin ici mais hasAdminRole directement.
    admin: ({ req: { user } }) => hasAdminRole(user),
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  fields: [
    {
      // Bouton « Enregistrer le mot de passe » inline, en tête de formulaire
      // (juste sous la section e-mail / mot de passe). Actif dès qu'un champ est
      // modifié. Voir admin/components/SaveButton.tsx.
      name: "passwordSave",
      type: "ui",
      admin: { components: { Field: "/admin/components/SaveButton#default" } },
    },
    {
      name: "avatar",
      type: "upload",
      relationTo: "media",
      label: "Photo de profil",
      admin: {
        position: "sidebar",
        description: "Affichée comme avatar du compte.",
        // Upload direct (Finder) sans le drawer Payload.
        components: { Field: "/admin/fields/DirectUpload#default" },
      },
    },
    { name: "firstName", type: "text", label: "Prénom" },
    { name: "lastName", type: "text", label: "Nom" },
    {
      // Nom complet, calculé automatiquement depuis prénom + nom, caché du
      // formulaire. Conservé pour les affichages qui l'utilisent (avatar, barre
      // du haut, colonnes de liste, useAsTitle éventuel).
      name: "name",
      type: "text",
      admin: { hidden: true },
      hooks: {
        beforeChange: [
          ({ siblingData }) =>
            [siblingData?.firstName, siblingData?.lastName].filter(Boolean).join(" ") || undefined,
        ],
      },
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
