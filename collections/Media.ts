import type { CollectionConfig } from "payload";

import { anyone, isAdmin } from "./access";

/**
 * Médias (uploads) : logos partenaires, visuels de récompenses, captures de
 * missions, images d'articles. `upload: true` active le stockage de fichiers.
 *
 * En dev les fichiers vont sur le disque local. Pour la prod (Vercel), on
 * branchera un adapter de stockage (Vercel Blob ou Supabase Storage) en Phase 1.
 */
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Média", plural: "Médias" },
  admin: { group: "Système" },
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      name: "alt",
      type: "text",
      label: "Texte alternatif",
    },
  ],
  upload: true,
};
