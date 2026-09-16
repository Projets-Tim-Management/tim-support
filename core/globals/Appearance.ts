import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";

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
 */
export const Appearance: GlobalConfig = {
  slug: "appearance",
  label: "Apparence",
  admin: {
    group: "Système",
    description:
      "Les logos affichés dans le menu de l'administration. Sans image ici, les logos livrés avec le code sont utilisés.",
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
  ],
};
