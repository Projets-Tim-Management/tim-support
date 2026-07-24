import path from "path";
import { fileURLToPath } from "url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { ArticleCategories } from "./collections/ArticleCategories";
import { Articles } from "./collections/Articles";
import { Platforms } from "./collections/Platforms";
import { FeatureCategories } from "./collections/FeatureCategories";
import { Features } from "./collections/Features";
import { Parcours } from "./collections/Parcours";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  // Collection qui porte l'authentification du back-office.
  admin: {
    user: Users.slug,
  },

  // Éditorial (Phase 1) en place ; le métier (Partners, Points, Missions,
  // Rewards, Orders) et le support (Tickets) viendront ensuite.
  collections: [
    // Éditorial
    Articles,
    ArticleCategories,
    Features,
    FeatureCategories,
    Platforms,
    Parcours,
    // Système
    Media,
    Users,
  ],

  // Éditeur de texte riche par défaut (pour l'éditorial à venir).
  editor: lexicalEditor(),

  secret: process.env.PAYLOAD_SECRET || "",

  // Types TypeScript générés à partir des collections — partagés avec le front.
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || "",
      // Supabase impose TLS ; on tolère le certificat du pooler.
      ssl: process.env.DATABASE_URL?.includes("supabase")
        ? { rejectUnauthorized: false }
        : undefined,
    },
  }),

  sharp,
});
