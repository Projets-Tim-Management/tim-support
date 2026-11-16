import type { GlobalConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";
import { BRIEF_SECTIONS, QUOTE_TAGS } from "@/modules/ai-team/lib/brief-sections";

/**
 * La FICHE PRODUIT & POSITIONNEMENT de TIM (voir lib/brief-sections) : lue
 * par tous les agents, tenue par la direction : elle la corrige ici, à la main.
 * Le premier jet (16/11/2026) vient de l'assistant de lib/brief, lancé à la
 * demande — plus de bouton sur la page : la fiche change rarement.
 */
export const AiTeamBrief: GlobalConfig = {
  slug: "ai-team-brief",
  label: "Fiche produit & positionnement",
  admin: { group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, update: isDirectionAccess },
  fields: [
    ...BRIEF_SECTIONS.map((s) => ({ name: s.key, type: "textarea" as const, label: s.label, admin: { description: s.help, rows: s.rows } })),
    {
      name: "quotes",
      type: "array",
      label: "Les mots des clients",
      // Tenue par Malo chaque lundi (lib/client-voice) ; la liste défile au-delà d'une hauteur fixe (custom.scss).
      admin: { className: "brief-quotes", description: "Les phrases exactes de prospects et de clients, chacune avec sa source — Malo ajoute chaque lundi celles de la semaine, les plus récentes en tête. Les agents lisent les 30 premières et les reprennent telles quelles." },
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
