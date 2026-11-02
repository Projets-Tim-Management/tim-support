import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";
import { EXPENSE_KINDS } from "@/modules/analytics/lib/expenses";

/**
 * Analyses → « Postes de dépenses » : les règles qui rangent chaque sortie du
 * relevé bancaire dans un poste. Celles d'ici passent AVANT les règles
 * d'origine du code (Google Ads, Linkuma, OpenAI…) : on ajoute un fournisseur
 * nouveau, on corrige un classement, sans toucher au code. Réservé à TIM.
 */
export const ExpenseRules: GlobalConfig = {
  slug: "expense-rules",
  label: "Postes de dépenses",
  admin: {
    group: "Analyses",
    description:
      "Chaque sortie du relevé bancaire Pennylane est rangée dans un poste d'après son libellé. Vos règles passent avant celles d'origine (Google Ads, ChatGPT Ads, SEO, IT…) : ajoutez ici un fournisseur resté « À classer », ou corrigez un classement. Le libellé exact se lit dans Analyses → Facturation, tableau « Détail des dépenses ».",
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      name: "rules",
      type: "array",
      label: "Règles",
      labels: { singular: "Règle", plural: "Règles" },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "match",
              type: "text",
              label: "Le libellé contient",
              required: true,
              admin: { width: "40%", description: "Majuscules indifférentes. Ex. : LINKUMA, GOOGLE ADS." },
            },
            { name: "poste", type: "text", label: "Poste", required: true, admin: { width: "30%", description: "Ex. : SEO, Google Ads, IT, Autres." } },
            {
              name: "kind",
              type: "select",
              label: "Type",
              required: true,
              defaultValue: "depense",
              options: EXPENSE_KINDS,
              admin: { width: "30%" },
            },
          ],
        },
      ],
    },
  ],
};
