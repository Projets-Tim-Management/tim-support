import { randomBytes } from "crypto";

import type { CollectionConfig } from "payload";

import { adminOnly } from "./access";

/** Génère un code partenaire unique au format TIM-XXXXXX (6 hex majuscules). */
const generatePartnerCode = (): string =>
  "TIM-" + randomBytes(3).toString("hex").toUpperCase();

/**
 * Partenaires — enfin une vraie entité (dans WordPress ils étaient "virtuels",
 * identifiés seulement par email).
 *
 * - `email` reste la clé de rapprochement (migration + SSO futur de Mathieu).
 * - `code` est le code de parrainage/leads, généré automatiquement à la
 *   création s'il n'est pas fourni (équivalent de l'option WP tim_partner_codes).
 * - Le solde de points n'est PAS stocké ici : il se calcule en sommant les
 *   `point-transactions` (auditable, réversible).
 */
export const Partners: CollectionConfig = {
  slug: "partners",
  labels: { singular: "Partenaire", plural: "Partenaires" },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "code", "status"],
    group: "Partenaires",
  },
  access: adminOnly,
  fields: [
    {
      name: "email",
      type: "email",
      label: "Email",
      required: true,
      unique: true,
      index: true,
    },
    { name: "name", type: "text", label: "Nom" },
    {
      name: "code",
      type: "text",
      label: "Code partenaire",
      unique: true,
      index: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Généré automatiquement (TIM-XXXXXX).",
      },
      hooks: {
        beforeChange: [
          ({ value }) => value || generatePartnerCode(),
        ],
      },
    },
    {
      name: "appUserId",
      type: "text",
      label: "ID utilisateur app",
      admin: {
        position: "sidebar",
        description: "Identifiant sur app.tim-management.co, si disponible.",
      },
    },
    {
      name: "status",
      type: "select",
      label: "Statut",
      defaultValue: "active",
      options: [
        { label: "Actif", value: "active" },
        { label: "En pause", value: "paused" },
        { label: "Archivé", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
  ],
};
