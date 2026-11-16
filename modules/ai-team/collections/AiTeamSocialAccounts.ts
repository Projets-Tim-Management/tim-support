import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";

/**
 * LES COMPTES DE RÉSEAUX branchés pour l'agent Réseaux & vidéo (équipe
 * SEO/GEO, 13/11/2026) — un par réseau : la chaîne YouTube (jeton de
 * rafraîchissement OAuth) et la page Facebook avec son compte Instagram
 * (jeton de page, sans échéance).
 *
 * Les jetons sont CHIFFRÉS (AES-GCM, `encryptSecret`) et ne sortent jamais par
 * l'API : le champ est illisible pour tout le monde, le serveur le lit en
 * accès système. Branchés et débranchés depuis la fiche de l'agent, par la
 * direction seule.
 */
export const AiTeamSocialAccounts: CollectionConfig = {
  slug: "ai-team-social-accounts",
  labels: { singular: "Compte de réseau (équipe IA)", plural: "Comptes de réseaux (équipe IA)" },
  admin: { useAsTitle: "label", defaultColumns: ["platform", "label", "status", "updatedAt"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: isDirectionAccess },
  fields: [
    {
      name: "platform",
      type: "select",
      label: "Réseau",
      required: true,
      unique: true,
      options: [
        { label: "YouTube", value: "youtube" },
        { label: "Facebook / Instagram", value: "meta" },
      ],
    },
    { name: "label", type: "text", label: "Compte" },
    { name: "externalId", type: "text", label: "Identifiant chez le réseau (chaîne, page)" },
    { name: "igUserId", type: "text", label: "Compte Instagram (identifiant)" },
    { name: "igUsername", type: "text", label: "Compte Instagram" },
    { name: "accountEmail", type: "text", label: "Compte Google qui a autorisé" },
    { name: "token", type: "text", label: "Jeton (chiffré)", access: { read: () => false, update: () => false }, admin: { hidden: true } },
    {
      name: "status",
      type: "select",
      label: "État",
      defaultValue: "actif",
      options: [
        { label: "Actif", value: "actif" },
        { label: "En erreur", value: "erreur" },
      ],
    },
    { name: "lastError", type: "textarea", label: "Dernière erreur" },
  ],
};
