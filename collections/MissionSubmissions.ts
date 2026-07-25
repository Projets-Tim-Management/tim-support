import type { CollectionConfig } from "payload";

import { adminOnly } from "./access";
import { creditApprovedSubmission } from "./hooks";
import { partnerField } from "../fields/partner";
import { referenceNumber } from "../fields/referenceNumber";

/**
 * Soumissions de missions (CPT `mission_submission` côté WP).
 *
 * Passage à `approved` → crédit des points au partenaire (logique métier
 * branchée en Phase 5). `credited` est le garde-fou anti double-crédit.
 */
export const MissionSubmissions: CollectionConfig = {
  slug: "mission-submissions",
  labels: { singular: "Soumission de mission", plural: "Soumissions de missions" },
  admin: {
    useAsTitle: "number",
    defaultColumns: ["number", "mission", "partner", "status"],
    group: "Partenaires",
  },
  access: adminOnly,
  hooks: { afterChange: [creditApprovedSubmission] },
  fields: [
    referenceNumber,
    {
      name: "mission",
      type: "relationship",
      relationTo: "missions",
      label: "Mission",
      required: true,
      index: true,
    },
    partnerField,
    { name: "note", type: "textarea", label: "Note du partenaire" },
    {
      name: "status",
      type: "select",
      label: "Statut",
      defaultValue: "pending",
      options: [
        { label: "En attente", value: "pending" },
        { label: "Validée", value: "approved" },
        { label: "Refusée", value: "rejected" },
      ],
      index: true,
    },
    {
      name: "reviewerEmail",
      type: "email",
      label: "Email de l'avis",
      admin: {
        position: "sidebar",
        description: "Optionnel (contexte avis).",
      },
    },
    {
      name: "attachments",
      type: "upload",
      relationTo: "media",
      hasMany: true,
      maxRows: 3,
      label: "Pièces jointes",
    },
    {
      name: "credited",
      type: "checkbox",
      label: "Points crédités",
      defaultValue: false,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Garde-fou anti double-crédit.",
      },
    },
  ],
};
