import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Publicité › Paramètres › Garde-fous (plan Publicité, §6 et §9 ter).
 *
 * L'interrupteur général (phase 0), puis les plafonds de dépense de l'atelier de
 * créas (phase 3a, budgets décidés le 29/09/2026). Ils sont APPLIQUÉS en code
 * avant chaque appel payant — le coût maximal possible doit tenir dans ce qui
 * reste, sinon l'appel n'est pas lancé. Un réglage que rien n'applique ferait
 * croire à une protection qui n'existe pas : chaque champ ici est lu par le code.
 */
const eur = (name: string, label: string, defaultValue: number, description: string) =>
  ({ name, type: "number", label, defaultValue, min: 0, required: true, admin: { width: "25%", description } }) as const;

export const AdsSettings: GlobalConfig = {
  slug: "ads-settings",
  label: "Garde-fous",
  admin: {
    group: "Publicité",
    description: "Ce que les agents et l'atelier de créas n'ont pas le droit de faire, ni de dépenser. Réservé à TIM.",
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      name: "enabled",
      type: "checkbox",
      label: "Interrupteur général",
      defaultValue: true,
      admin: {
        description:
          "Décoché : aucun agent ne tourne, aucune génération ne part, aucune décision ne s'exécute. La synchro des chiffres, elle, continue — elle ne fait que lire.",
      },
    },
    {
      type: "collapsible",
      label: "Plafonds de dépense de l'atelier de créas",
      admin: { initCollapsed: false },
      fields: [
        {
          type: "row",
          fields: [
            eur("textDailyEur", "Textes — par jour (€)", 5, "Claude, génération des textes."),
            eur("textMonthlyEur", "Textes — par mois (€)", 50, "Claude, génération des textes."),
            eur("imagesMonthlyEur", "Images — par mois (€)", 20, "Fonds générés (Imagen)."),
            eur("videoMonthlyEur", "Vidéo générée — par mois (€)", 30, "Plans générés (Veo)."),
          ],
        },
        {
          name: "creativesPerCampaignPerWeek",
          type: "number",
          label: "Créas générées par campagne et par semaine",
          defaultValue: 6,
          min: 1,
          required: true,
          admin: { width: "50%", description: "Au-delà, la génération attend la semaine suivante (plan, §6)." },
        },
      ],
    },
    {
      type: "collapsible",
      label: "Agents de campagne",
      admin: { initCollapsed: false, description: "Plan, §9 quater. Ces plafonds s'ajoutent à ceux de l'atelier : l'agent ne dépasse aucun des deux." },
      fields: [
        {
          type: "row",
          fields: [
            eur("agentPrepMaxEur", "Préparation — par passage (€)", 5, "Le budget maximal d'un clic sur « Lancer l'agent »."),
            eur("agentDailyEur", "Tous agents — par jour (€)", 15, "Toutes campagnes confondues."),
            eur("agentMonthlyEur", "Tous agents — par mois (€)", 150, "Toutes campagnes confondues."),
          ],
        },
        {
          name: "adLibraryTokenExpiresAt",
          type: "date",
          label: "Expiration du jeton de la bibliothèque publicitaire",
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
            description: "60 jours après sa création. Rappel à J-7 ; le renouvellement se fait à la main.",
          },
        },
      ],
    },
  ],
};
