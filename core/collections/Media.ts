import type { CollectionConfig } from "payload";

import { isAdmin, isBackoffice } from "@/core/access";
import { mediaRead } from "@/core/lib/media-access";

/**
 * Médias (uploads) : logos partenaires, visuels de récompenses, captures de
 * missions, visuels de features. `upload: true` active le stockage de fichiers.
 *
 * Stockage sur Vercel Blob en prod (plugin vercelBlobStorage) ; disque local
 * en dev. Les fichiers sont servis par le CDN ; la LISTE, elle, est réservée
 * au back-office (voir mediaRead). Écriture réservée aux admins.
 */
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Média", plural: "Médias" },
  admin: { group: "Système" },
  // Lecture par l'API : back-office seulement, le partenaire limité à ses
  // pièces (mediaRead) ; upload possible par tout compte back-office (avatars,
  // pièces jointes) ; modification/suppression = admins.
  access: {
    read: mediaRead,
    create: isBackoffice,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    // Qui a déposé le fichier : un partenaire relit ce qu'il vient de déposer
    // avant même d'avoir enregistré la fiche (voir mediaRead).
    beforeChange: [
      ({ data, operation, req }) =>
        operation === "create" && req.user?.id != null ? { ...data, createdBy: req.user.id } : data,
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      label: "Texte alternatif",
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      label: "Déposé par",
      access: { update: () => false },
      admin: { readOnly: true, position: "sidebar" },
    },
  ],
  /**
   * Fichiers stockés TELS QUELS : ni recadrage, ni point focal, ni tailles
   * dérivées. Les visuels sont servis en taille d'origine.
   *
   * Ce n'est pas qu'une préférence, c'est une contrainte : les GIF de
   * démonstration dépassent les 200 images, et les faire retravailler par la
   * bibliothèque d'images échouait — au-delà de sa limite de pixels, puis au-delà
   * du délai d'une fonction. La garantie ne tient d'ailleurs pas à ces trois
   * options, mais à l'absence de `sharp` dans la configuration Payload, qui est
   * ce qui empêche RÉELLEMENT le ré-encodage (voir payload.config.ts).
   */
  upload: { focalPoint: false, crop: false },
};
