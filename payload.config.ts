import path from "path";
import { fileURLToPath } from "url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import { fr } from "@payloadcms/translations/languages/fr";
import { buildConfig } from "payload";
import sharp from "sharp";

import { Users } from "./core/collections/Users";
import { Media } from "./core/collections/Media";
import { Platforms } from "./modules/editorial/collections/Platforms";
import { FeatureCategories } from "./modules/editorial/collections/FeatureCategories";
import { Features } from "./modules/editorial/collections/Features";
import { Parcours } from "./modules/editorial/collections/Parcours";
import { Partners } from "./modules/partner/collections/Partners";
import { PartnerClients } from "./modules/partner/collections/PartnerClients";
import { PointTransactions } from "./modules/partner/collections/PointTransactions";
import { Missions } from "./modules/partner/collections/Missions";
import { MissionSubmissions } from "./modules/partner/collections/MissionSubmissions";
import { Rewards } from "./modules/partner/collections/Rewards";
import { RewardOrders } from "./modules/partner/collections/RewardOrders";
import { Tickets } from "./modules/support/collections/Tickets";
import {
  hideUnlessAdmin,
  hideUnlessAdminOrPartner,
  hideUnlessMetier,
  hideUnlessSupport,
  hideUnlessUtilisateur,
} from "./core/access";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * Masquage du menu par rôle (`admin.hidden`), centralisé ici plutôt que répliqué
 * dans chaque collection. La sécurité réelle vit dans l'access control de chaque
 * collection (Phase 3) ; ceci ne fait que filtrer le menu/URL selon le rôle.
 * CustomNav respecte automatiquement ce masquage via `visibleEntities`.
 */
const ROLE_NAV_HIDDEN: Record<string, (args: { user?: unknown }) => boolean> = {
  // Éditorial + Système : admins uniquement
  features: hideUnlessAdmin,
  "feature-categories": hideUnlessAdmin,
  platforms: hideUnlessAdmin,
  parcours: hideUnlessAdmin,
  media: hideUnlessAdmin,
  users: hideUnlessAdmin,
  // Partenaires
  partners: hideUnlessAdminOrPartner,
  "partner-clients": hideUnlessMetier,
  missions: hideUnlessUtilisateur,
  "mission-submissions": hideUnlessUtilisateur,
  rewards: hideUnlessUtilisateur,
  "reward-orders": hideUnlessUtilisateur,
  // Support
  tickets: hideUnlessSupport,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyRoleNavVisibility = (cols: any[]): any[] =>
  cols.map((c) =>
    c.slug in ROLE_NAV_HIDDEN
      ? { ...c, admin: { ...(c.admin ?? {}), hidden: ROLE_NAV_HIDDEN[c.slug] } }
      : c,
  );

export default buildConfig({
  // Collection qui porte l'authentification du back-office.
  // API Payload isolée sous /payload-api pour ne pas entrer en collision avec
  // les routes /api/* du front (app/(frontend)/api/*).
  routes: { api: "/payload-api" },

  admin: {
    user: Users.slug,
    // Fond blanc systématique (aligné sur le front), pas de thème sombre.
    theme: "light",
    // Avatar du compte = photo de profil (champ `avatar` de Users) si présente,
    // sinon initiale. Voir admin/graphics/Avatar.tsx.
    avatar: { Component: "/admin/graphics/Avatar#default" },
    // Résolution des composants admin custom (logo/icône) depuis la racine.
    importMap: { baseDir: dirname },
    components: {
      graphics: {
        Logo: "/admin/graphics/Logo#Logo",
        Icon: "/admin/graphics/Icon#Icon",
      },
      // Menu latéral custom : groupes à 2 niveaux (sous-groupes repliables),
      // structure définie dans admin/nav/nav-structure.ts.
      Nav: "/admin/nav/CustomNav#default",
      // Barre du haut : switcher de partenaire (recherche + bascule de contexte)
      // + cloche de notifications (compteur + popover) + compte. La cloche
      // remplace l'ancien raccourci « Notifications » du menu (retiré).
      header: ["/admin/header/PartnerSwitcher#default"],
      views: {
        // Tableau de bord custom (remplace la page d'accueil /admin). Métriques
        // par compartiment + graphiques — voir admin/dashboard/.
        dashboard: {
          Component: "/admin/dashboard/DashboardView#default",
        },
        // Page « Notifications » complète (boîte de réception des tickets à traiter).
        notifications: {
          Component: "/modules/support/admin/NotificationsView#default",
          path: "/notifications",
          exact: true,
          meta: { title: "Notifications" },
        },
      },
    },
  },

  // L'ordre ci-dessous pilote l'ordre des groupes dans le menu de l'admin.
  // applyRoleNavVisibility injecte le masquage par rôle (admin.hidden).
  collections: applyRoleNavVisibility([
    // Support
    Tickets,
    // Features (+ leurs paramètres : catégories, plateformes)
    Features,
    FeatureCategories,
    Platforms,
    // Parcours
    Parcours,
    // Partenaires
    Partners,
    PartnerClients,
    PointTransactions,
    // Missions
    Missions,
    MissionSubmissions,
    // Récompenses
    Rewards,
    RewardOrders,
    // Système
    Media,
    Users,
  ]),

  // Back-office en français uniquement.
  i18n: {
    supportedLanguages: { fr },
    fallbackLanguage: "fr",
  },

  // E-mails transactionnels via Brevo (SMTP). Repli console si non configuré.
  email: process.env.BREVO_SMTP_KEY
    ? nodemailerAdapter({
        defaultFromAddress: process.env.EMAIL_FROM || "support@tim-management.co",
        defaultFromName: process.env.EMAIL_FROM_NAME || "TIM Support",
        transportOptions: {
          host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
          port: Number(process.env.BREVO_SMTP_PORT || 587),
          auth: {
            user: process.env.BREVO_SMTP_USER || "",
            pass: process.env.BREVO_SMTP_KEY,
          },
        },
      })
    : undefined,

  // Éditeur de texte riche par défaut (pour l'éditorial à venir).
  editor: lexicalEditor(),

  // Backfill unique : calcule chemin (pathTitle) + clé de tri (sortKey) des
  // catégories existantes créées avant ces champs. Ne réécrit que celles dont
  // le sortKey manque → une seule passe, puis no-op aux démarrages suivants.
  onInit: async (payload) => {
    try {
      const all = await payload.find({
        collection: "feature-categories",
        limit: 2000,
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });
      const todo = all.docs.filter((d) => !(d as { sortKey?: string }).sortKey);
      for (const cat of todo) {
        await payload.update({
          collection: "feature-categories",
          id: cat.id,
          data: {}, // déclenche les hooks beforeChange (pathTitle + sortKey)
          depth: 0,
          overrideAccess: true,
        });
      }
      if (todo.length) {
        payload.logger.info(`[features] ${todo.length} catégorie(s) réindexée(s) (chemin + tri).`);
      }
    } catch (err) {
      payload.logger.error(`[features] réindexation des catégories échouée : ${err}`);
    }
  },

  secret: process.env.PAYLOAD_SECRET || "",

  // Types TypeScript générés à partir des collections — partagés avec le front.
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },

  // Stockage des médias sur Vercel Blob (activé dès que le token est présent ;
  // sinon repli sur le disque local en dev).
  plugins: [
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      // Store public → on sert les images en direct depuis le CDN Blob
      // (URL blob.vercel-storage.com) plutôt qu'en proxy via Payload.
      collections: { media: { disablePayloadAccessControl: true } },
      token: process.env.BLOB_READ_WRITE_TOKEN || "",
    }),
  ],

  db: postgresAdapter({
    // Migrations versionnées (dossier ./migrations). Le push auto est DÉSACTIVÉ :
    // dev et prod partagent la même base, donc tout changement de schéma doit
    // passer par une migration explicite (`payload migrate`), jamais par un push
    // implicite au démarrage (cf. incident de suppression de colonnes 2026-07-29).
    migrationDir: path.resolve(dirname, "migrations"),
    push: false,
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
