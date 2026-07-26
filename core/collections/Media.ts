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
  upload: true,
};
