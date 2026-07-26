import type { CollectionConfig } from "payload";

import { editorialAccess } from "@/core/access";

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
  access: editorialAccess,
  fields: [
    {
      name: "alt",
      type: "text",
      label: "Texte alternatif",
    },
  ],
  // Pas de recadrage / point focal : on stocke les fichiers tels quels (dont de
  // gros GIF animés de 200+ frames que le pipeline sharp de Payload ne doit pas
  // tenter de retravailler — sinon échec de téléversement). Aucune imageSizes
  // n'est définie non plus : les visuels sont servis en taille d'origine.
  upload: { focalPoint: false, crop: false },
};
