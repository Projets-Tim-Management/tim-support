import path from "path";
import { fileURLToPath } from "url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { fr } from "@payloadcms/translations/languages/fr";
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
import { Partners } from "./collections/Partners";
import { PointTransactions } from "./collections/PointTransactions";
import { Missions } from "./collections/Missions";
import { MissionSubmissions } from "./collections/MissionSubmissions";
import { Rewards } from "./collections/Rewards";
import { RewardOrders } from "./collections/RewardOrders";
import { Tickets } from "./collections/Tickets";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  // Collection qui porte l'authentification du back-office.
  // API Payload isolée sous /payload-api pour ne pas entrer en collision avec
  // les routes /api/* du front (app/(frontend)/api/*).
  routes: { api: "/payload-api" },

  admin: {
    user: Users.slug,
    // Fond blanc systématique (aligné sur le front), pas de thème sombre.
    theme: "light",
    // Résolution des composants admin custom (logo/icône) depuis la racine.
    importMap: { baseDir: dirname },
    components: {
      graphics: {
        Logo: "/admin/graphics/Logo#Logo",
        Icon: "/admin/graphics/Icon#Icon",
      },
    },
  },

  collections: [
    // Éditorial
    Articles,
    ArticleCategories,
    Features,
    FeatureCategories,
    Platforms,
    Parcours,
    // Métier partenaires
    Partners,
    PointTransactions,
    Missions,
    MissionSubmissions,
    Rewards,
    RewardOrders,
    // Support
    Tickets,
    // Système
    Media,
    Users,
  ],

  // Back-office en français uniquement.
  i18n: {
    supportedLanguages: { fr },
    fallbackLanguage: "fr",
  },

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
      // Le session pooler Supabase plafonne à 15 clients : on garde une petite
      // marge et on libère vite les connexions inactives (surtout en dev, où
      // les rechargements à chaud peuvent multiplier les pools).
      max: 5,
      idleTimeoutMillis: 10000,
    },
  }),

  sharp,
});
