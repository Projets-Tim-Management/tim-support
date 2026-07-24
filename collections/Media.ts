import type { CollectionConfig } from "payload";

/**
 * Médias (uploads) : logos partenaires, visuels de récompenses, captures de
 * missions, images d'articles. `upload: true` active le stockage de fichiers.
 *
 * En dev les fichiers vont sur le disque local. Pour la prod (Vercel), on
 * branchera un adapter de stockage (Vercel Blob ou Supabase Storage) en Phase 1.
 */
export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "alt",
      type: "text",
      label: "Texte alternatif",
    },
  ],
  upload: true,
};
