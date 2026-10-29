import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Les questions posées à l'analyste d'une campagne, et ses réponses (plan
 * Publicité, §9 nonies, étape 7 — « Poser une question à l'agent »). Écrites par
 * le serveur seul : on garde ce qui a été dit, et ce que ça a coûté.
 */
export const AdQuestions: CollectionConfig = {
  slug: "ad-questions",
  labels: { singular: "Question à l'agent", plural: "Questions à l'agent" },
  admin: { useAsTitle: "question", defaultColumns: ["askedAt", "campaign", "question"], group: "Publicité", hidden: true },
  access: { read: isAdmin, create: () => false, update: () => false, delete: isAdmin },
  defaultSort: "-askedAt",
  fields: [
    { name: "campaign", type: "relationship", relationTo: "ad-campaigns", required: true, index: true },
    { name: "question", type: "textarea", required: true },
    { name: "answer", type: "textarea" },
    { name: "error", type: "text" },
    { name: "askedBy", type: "relationship", relationTo: "users" },
    { name: "costEur", type: "number" },
    { name: "askedAt", type: "date", required: true, index: true, admin: { date: { pickerAppearance: "dayAndTime" } } },
  ],
};
