import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { ETAPE_LABELS, ETAPES, INCONNU } from "@/modules/analytics/lib/video-views";

/**
 * Les compteurs de vues des vidéos du site vitrine : une ligne par (vidéo,
 * page, étape, jour de Paris, appareil, canal), et son `nombre` (voir
 * lib/video-views.ts). Appareil et canal sont des catégories, « inconnu » par
 * défaut — jamais vides : l'unicité ne tiendrait pas sur une valeur nulle.
 *
 * Rien qui touche le visiteur — ni IP, ni navigateur, ni heure : c'est ce qui
 * permet de compter TOUTES les lectures sans demander de consentement (mesure
 * d'audience exemptée, CNIL). L'unicité des six colonnes est tenue par la
 * base : l'incrément passe par un « INSERT … ON CONFLICT » atomique.
 *
 * Lue par l'écran « Analyses → Vidéos » ; jamais saisie à la main.
 */
export const VideoViews: CollectionConfig = {
  slug: "video-views",
  labels: { singular: "Vue vidéo", plural: "Vues vidéo" },
  admin: {
    useAsTitle: "videoId",
    defaultColumns: ["jour", "videoId", "page", "etape", "appareil", "canal", "nombre"],
    group: "Analyses",
    hidden: true,
  },
  // Écrite par la route seule (SQL) : personne ne crée, ne modifie ni ne supprime un compteur.
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  disableDuplicate: true,
  defaultSort: "-jour",
  indexes: [{ fields: ["videoId", "page", "etape", "jour", "appareil", "canal"], unique: true }],
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
    // Catégories en texte, validées par la route : en ajouter une ne demande pas de migration.
    { name: "appareil", type: "text", label: "Appareil", required: true, defaultValue: INCONNU },
    { name: "canal", type: "text", label: "Canal", required: true, defaultValue: INCONNU },
    { name: "nombre", type: "number", label: "Nombre", required: true, defaultValue: 0 },
  ],
};
