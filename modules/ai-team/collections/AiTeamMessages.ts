import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";

/**
 * La conversation entre la direction et un chef de l'équipe IA — un message
 * par ligne, dans l'ordre où ils ont été échangés.
 *
 * Écrite par le serveur seul (route /api/admin/ai-team/chat) : on garde ce qui
 * a été dit, qui l'a dit, et ce que la réponse a coûté. Lue par la direction
 * seule. Hors menu : elle se lit sur la fiche du chef, dans Équipe IA.
 */
export const AiTeamMessages: CollectionConfig = {
  slug: "ai-team-messages",
  labels: { singular: "Message à l'équipe IA", plural: "Messages à l'équipe IA" },
  admin: { useAsTitle: "text", defaultColumns: ["createdAt", "member", "from", "text"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: () => false },
  defaultSort: "createdAt",
  fields: [
    { name: "member", type: "relationship", relationTo: "ai-team-members", label: "Chef", required: true, index: true },
    {
      name: "from",
      type: "select",
      label: "De",
      required: true,
      options: [
        { label: "La direction", value: "direction" },
        { label: "Le chef", value: "agent" },
      ],
    },
    { name: "text", type: "textarea", label: "Message", required: true },
    { name: "author", type: "relationship", relationTo: "users", label: "Écrit par" },
    { name: "costEur", type: "number", label: "Coût de la réponse (€)" },
  ],
};
