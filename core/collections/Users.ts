import type { CollectionConfig, PayloadRequest } from "payload";

import { ALL_ROLES, ROLES, adminOnlyField, hasBackofficeRole, isAdmin, isAdminOrSelf } from "@/core/access";
import { guardSuperAdminOnChange, guardSuperAdminOnDelete } from "@/core/hooks/superAdmin";

/** Libellés FR des rôles pour le champ select. */
const ROLE_LABELS: Record<(typeof ALL_ROLES)[number], string> = {
  [ROLES.superAdmin]: "Super-admin",
  [ROLES.admin]: "Admin",
  [ROLES.partnerMetier]: "Partenaire — Métier",
  [ROLES.partnerUtilisateur]: "Partenaire — Utilisateur",
  [ROLES.support]: "Support",
};

/**
 * Utilisateurs du back-office.
 *
 * SÉCURITÉ — pas d'auto-inscription :
 *  - `access.create` = admins uniquement → personne ne peut créer un compte
 *    sans être un admin connecté. C'est TOI qui crées les accès.
 *  - `access.admin`  = admins uniquement → seuls les admins entrent dans /admin
 *    (élargi aux rôles partenaire/support en Phase 5).
 *  - Le champ `roles` n'est modifiable que par un admin (anti-escalade), et le
 *    rôle super-admin est protégé par des gardes dédiés (voir core/hooks/superAdmin).
 *
 * Exception unique : tant que la base ne contient AUCUN utilisateur, Payload
 * autorise la création du tout premier compte via /admin (« Create first
 * user »). Ensuite, verrouillé.
 */
export const Users: CollectionConfig = {
  slug: "users",
  labels: { singular: "Utilisateur", plural: "Utilisateurs" },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["lastName", "firstName", "email", "roles"],
    group: "Système",
  },
  auth: {
    /**
     * 24 heures, au lieu des 2 heures par défaut de Payload.
     *
     * Le jeton n'est renouvelé qu'au CHANGEMENT DE PAGE dans le back-office, et
     * seulement dans les quatre dernières minutes avant son terme. Une fiche
     * laissée ouverte pendant une réunion, un long e-mail en cours de rédaction,
     * et l'enregistrement renvoyait vers l'écran de connexion — travail perdu.
     *
     * Une journée de travail tient désormais dans une session. Le compromis est
     * assumé : un poste laissé déverrouillé reste connecté plus longtemps, ce
     * qui pour un back-office interne pèse moins que la perte de saisie.
     */
    tokenExpiration: 24 * 60 * 60,
  },
  access: {
    // `admin` (droit d'entrer dans /admin) doit renvoyer un booléen strict.
    // Élargi à TOUS les rôles back-office : partenaires et support se connectent
    // au même /admin mais voient une interface restreinte (nav filtrée par
    // admin.hidden, dashboard gardé, access control row-level Phase 3).
    admin: ({ req: { user } }) => hasBackofficeRole(user),
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  hooks: {
    // Protection du rôle super-admin (attribution, dernier super-admin, suppression).
    beforeChange: [guardSuperAdminOnChange],
    beforeDelete: [guardSuperAdminOnDelete],
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
      defaultValue: [ROLES.admin],
      options: ALL_ROLES.map((value) => ({ label: ROLE_LABELS[value], value })),
      // Champ modifiable par un admin uniquement (anti-escalade). L'attribution
      // du rôle super-admin est en plus gardée par guardSuperAdminOnChange.
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
    },
    {
      // LIEN User ↔ Partenaire — la « clé de scoping » (voir docs/RBAC-PLAN.md §2).
      // Un compte de rôle partenaire ne voit que les données de CETTE fiche.
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      label: "Fiche partenaire",
      index: true,
      admin: {
        position: "sidebar",
        description: "Fiche partenaire rattachée à ce compte (rôles partenaire uniquement).",
        // Affiché seulement quand un rôle partenaire est sélectionné.
        condition: (data, siblingData) => {
          const roles = ((siblingData?.roles ?? data?.roles) as string[] | undefined) ?? [];
          return roles.includes(ROLES.partnerMetier) || roles.includes(ROLES.partnerUtilisateur);
        },
      },
      // Seul un admin peut définir/modifier le rattachement (anti-usurpation :
      // un partenaire ne doit jamais pouvoir se relier à une autre fiche).
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      // Cohérence : requis pour un rôle partenaire, et le type de la fiche
      // (partnerKind) doit correspondre au rôle (métier ↔ utilisateur).
      validate: async (
        value: unknown,
        { req, siblingData }: { req: PayloadRequest; siblingData?: unknown },
      ) => {
        const roles = (Array.isArray((siblingData as { roles?: unknown })?.roles)
          ? (siblingData as { roles: string[] }).roles
          : []) as string[];
        const isMetier = roles.includes(ROLES.partnerMetier);
        const isUtil = roles.includes(ROLES.partnerUtilisateur);
        if (!isMetier && !isUtil) return true;
        if (!value) return "Sélectionne la fiche partenaire associée à ce compte.";
        try {
          const partner = await req.payload.findByID({
            collection: "partners",
            id: value as string | number,
            depth: 0,
            overrideAccess: true,
            req,
          });
          const kind = (partner as { partnerKind?: string })?.partnerKind;
          if (isMetier && kind !== "metier")
            return "Cette fiche partenaire n'est pas de type « Métier ».";
          if (isUtil && kind !== "utilisateur")
            return "Cette fiche partenaire n'est pas de type « Utilisateur ».";
        } catch {
          return "Fiche partenaire introuvable.";
        }
        return true;
      },
    },
  ],
};
