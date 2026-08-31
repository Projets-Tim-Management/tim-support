import type { CollectionConfig } from "payload";

import { anyone, isAdmin, isBackoffice } from "@/core/access";

/**
 * Médias (uploads) : logos partenaires, visuels de récompenses, captures de
 * missions, visuels de features. `upload: true` active le stockage de fichiers.
 *
 * Stockage sur Vercel Blob en prod (plugin vercelBlobStorage) ; disque local
 * en dev. Lecture publique, écriture réservée aux admins (editorialAccess).
 */
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Média", plural: "Médias" },
  admin: { group: "Système" },
  // Lecture publique (images du site) ; upload possible par tout compte
  // back-office (avatars, pièces jointes) ; modification/suppression = admins.
  access: {
    read: anyone,
    create: isBackoffice,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: "alt",
      type: "text",
      label: "Texte alternatif",
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
