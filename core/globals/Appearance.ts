import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";
import { BRAND_DEFAULTS, HEX } from "@/core/lib/brand";

const hexColor = (name: keyof typeof BRAND_DEFAULTS, label: string, description: string) => ({
  name,
  type: "text" as const,
  label,
  defaultValue: BRAND_DEFAULTS[name],
  validate: (v: unknown) => (!v || HEX.test(String(v)) ? true : "Code couleur au format #RRGGBB."),
  admin: {
    width: "25%",
    placeholder: BRAND_DEFAULTS[name],
    description,
    components: { Field: "/admin/fields/ColorField#default" },
  },
});

/**
 * L'identité visuelle de l'admin — les deux logos du menu.
 *
 * En base et non dans le code : changer un logo est une décision de marque, pas
 * une modification de programme. Aujourd'hui il faut remplacer un fichier dans
 * le dépôt et redéployer ; demain il suffira de le déposer ici.
 *
 * DEUX images et pas une, parce que le menu a deux états et qu'un seul fichier
 * ne peut pas servir les deux : un logo large recadré pour tenir dans 60 px
 * coupe en plein milieu du mot. Recadrer était le pis-aller ; c'est ce champ
 * qui le remplace.
 *
 * Plus bas, l'identité de TIM MANAGEMENT, la société : son logo et ses
 * couleurs, pour les documents qu'elle émet (le contrat PDF aujourd'hui) —
 * distincts du logo « TIM support » du menu.
 */
export const Appearance: GlobalConfig = {
  slug: "appearance",
  label: "Apparence",
  admin: {
    group: "Système",
    description:
      "Les logos du menu de l'administration, et l'identité de TIM Management pour les documents (contrat PDF).",
  },
  // Réservé aux administrateurs : ce réglage se voit par toute l'équipe.
  access: { read: () => true, update: isAdmin },
  fields: [
    {
      name: "logo",
      type: "upload",
      relationTo: "media",
      label: "Logo complet",
      admin: {
        description:
          "Affiché en haut du menu déplié. Format large, hauteur 34 px à l'écran — prévoir le double pour rester net sur un écran Retina.",
      },
    },
    {
      name: "icon",
      type: "upload",
      relationTo: "media",
      label: "Icône seule",
      admin: {
        description:
          "Affichée quand le menu est réduit à sa colonne d'icônes, et dans l'onglet du navigateur (favicon). CARRÉE, sans texte — c'est la marque seule. Un logo large mis ici serait illisible.",
      },
    },
    {
      type: "collapsible",
      label: "TIM Management — documents",
      admin: {
        description:
          "Le logo et les couleurs de la société, repris dans les documents qu'elle émet (en-tête et titres du contrat PDF).",
      },
      fields: [
        {
          name: "companyLogo",
          type: "upload",
          relationTo: "media",
          label: "Logo TIM Management",
          filterOptions: { mimeType: { in: ["image/png", "image/jpeg"] } },
          admin: {
            description:
              "En-tête du contrat PDF. PNG (fond transparent de préférence) ou JPEG — le PDF ne lit pas le SVG. Format large, 600 px de large environ.",
          },
        },
        {
          type: "row",
          fields: [
            hexColor("brandPrimary", "Principale", "Titres des articles."),
            hexColor("brandSecondary", "Secondaire", "Fonds d'en-têtes de tableaux."),
            hexColor("brandRed", "Rouge", "Filet d'accent."),
            hexColor("brandOther", "Autre", "Fonds légers."),
          ],
        },
      ],
    },
  ],
};
