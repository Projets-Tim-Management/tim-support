import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { ETAPE_LABELS, ETAPES } from "@/modules/analytics/lib/video-views";

/**
 * Les compteurs de vues des vidéos du site vitrine : une ligne par (vidéo,
 * page, étape, jour de Paris), et son `nombre` (voir lib/video-views.ts).
 *
 * Rien qui touche le visiteur — ni IP, ni navigateur, ni heure : c'est ce qui
 * permet de compter TOUTES les lectures sans demander de consentement (mesure
 * d'audience exemptée, CNIL). L'unicité des quatre colonnes est tenue par la
 * base : l'incrément passe par un « INSERT … ON CONFLICT » atomique.
 *
 * Lue par l'écran « Analyses → Vidéos » ; jamais saisie à la main.
 */
export const VideoViews: CollectionConfig = {
  slug: "video-views",
  labels: { singular: "Vue vidéo", plural: "Vues vidéo" },
  admin: {
    useAsTitle: "videoId",
    defaultColumns: ["jour", "videoId", "page", "etape", "nombre"],
    group: "Analyses",
    hidden: true,
  },
  // Écrite par la route seule (SQL) : personne ne crée, ne modifie ni ne supprime un compteur.
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  disableDuplicate: true,
  defaultSort: "-jour",
  indexes: [{ fields: ["videoId", "page", "etape", "jour"], unique: true }],
  fields: [
    { name: "videoId", type: "text", label: "Vidéo", required: true, index: true },
    { name: "page", type: "text", label: "Page", required: true },
    {
      name: "etape",
      type: "select",
      label: "Étape",
      required: true,
      options: ETAPES.map((value) => ({ value, label: ETAPE_LABELS[value] })),
    },
    // Le jour au fuseau de Paris, « AAAA-MM-JJ » : se trie et se compare comme du texte.
    { name: "jour", type: "text", label: "Jour", required: true, index: true },
    { name: "nombre", type: "number", label: "Nombre", required: true, defaultValue: 0 },
  ],
};
