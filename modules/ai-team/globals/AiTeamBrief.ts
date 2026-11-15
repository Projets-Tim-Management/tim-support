import type { GlobalConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";
import { BRIEF_SECTIONS, QUOTE_TAGS } from "@/modules/ai-team/lib/brief-sections";

/**
 * La FICHE PRODUIT & POSITIONNEMENT de TIM (voir lib/brief-sections) : lue
 * par tous les agents, tenue par la direction. L'assistant (en tête de page)
 * rédige un premier jet et propose ensuite des mises à jour, section par
 * section, avec les mots exacts des clients trouvés dans le CRM — la direction
 * accepte ou ignore chaque proposition.
 */
export const AiTeamBrief: GlobalConfig = {
  slug: "ai-team-brief",
  label: "Fiche produit & positionnement",
  admin: { group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, update: isDirectionAccess },
  fields: [
    { name: "assistant", type: "ui", admin: { components: { Field: "/modules/ai-team/admin/BriefAssistant#BriefAssistant" } } },
    ...BRIEF_SECTIONS.map((s) => ({ name: s.key, type: "textarea" as const, label: s.label, admin: { description: s.help, rows: s.rows } })),
    {
      name: "quotes",
      type: "array",
      label: "Les mots des clients",
      admin: { description: "Les phrases exactes de prospects et de clients, chacune avec sa source. Les agents les reprennent telles quelles." },
      fields: [
        { name: "quote", type: "textarea", label: "Citation exacte", required: true },
        {
          type: "row",
          fields: [
            { name: "tag", type: "select", label: "Nature", options: [...QUOTE_TAGS], admin: { width: "30%" } },
            { name: "who", type: "text", label: "Qui (rôle, entreprise)", admin: { width: "35%" } },
            { name: "source", type: "text", label: "Source", admin: { width: "35%" } },
          ],
        },
      ],
    },
    // Ce que l'assistant propose, en attente de la direction (section → texte ; citations).
    { name: "proposals", type: "json", admin: { hidden: true } },
    { name: "proposedAt", type: "date", admin: { hidden: true } },
    { name: "version", type: "number", defaultValue: 1, admin: { readOnly: true, position: "sidebar" } },
    {
      name: "changelog",
      type: "array",
      label: "Historique",
      admin: { position: "sidebar", readOnly: true },
      fields: [
        { name: "at", type: "date", label: "Le" },
        { name: "change", type: "text", label: "Changement" },
      ],
    },
  ],
};
