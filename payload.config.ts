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
import { ClientContacts } from "./modules/partner/collections/ClientContacts";
import { PointTransactions } from "./modules/partner/collections/PointTransactions";
import { Missions } from "./modules/partner/collections/Missions";
import { MissionSubmissions } from "./modules/partner/collections/MissionSubmissions";
import { Rewards } from "./modules/partner/collections/Rewards";
import { RewardOrders } from "./modules/partner/collections/RewardOrders";
import { Tickets } from "./modules/support/collections/Tickets";
import { MarketingJourneys } from "./modules/marketing/collections/MarketingJourneys";
import { JourneyRuns } from "./modules/marketing/collections/JourneyRuns";
import { ClientEmployees } from "./modules/marketing/collections/ClientEmployees";
import { ClientSites } from "./modules/marketing/collections/ClientSites";
import { ClientVehicles } from "./modules/marketing/collections/ClientVehicles";
import { ClientMachines } from "./modules/marketing/collections/ClientMachines";
import { ClientPortalAccounts } from "./modules/marketing/collections/ClientPortalAccounts";
import { CalendarConnections } from "./modules/marketing/collections/CalendarConnections";
import { seedJourneys } from "./modules/marketing/lib/seed";
import {
  hideUnlessAdmin,
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
  // Partenaires — la fiche « Partenaires » (Comptes) est réservée à l'admin et au
  // partenaire-MÉTIER ; masquée pour le partenaire-utilisateur (il n'administre pas
  // de comptes). L'accès data à sa propre fiche (ownPartnerRecord) reste inchangé.
  partners: hideUnlessMetier,
  "partner-clients": hideUnlessMetier,
  // Le partenaire-utilisateur voit les CATALOGUES (missions, récompenses) — ce
  // sont ses écrans d'action. Les collections de suivi qui en découlent
  // (soumissions, commandes) sont des tables de traitement pour TIM : leur état
  // lui est déjà rendu là où il compte pour lui, dans le catalogue et sur son
  // accueil. Les lui montrer exposerait des écrans de gestion sans usage.
  missions: hideUnlessUtilisateur,
  "mission-submissions": hideUnlessAdmin,
  rewards: hideUnlessUtilisateur,
  "reward-orders": hideUnlessAdmin,
  // Support
  tickets: hideUnlessSupport,
  // Marketing — les phases de test se pilotent à deux (partenaire-métier +
  // admin) ; le MODÈLE de parcours reste un réglage TIM, donc admin seul.
  "journey-runs": hideUnlessMetier,
  "marketing-journeys": hideUnlessAdmin,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyRoleNavVisibility = (cols: any[]): any[] =>
  cols.map((c) =>
    c.slug in ROLE_NAV_HIDDEN
      ? { ...c, admin: { ...(c.admin ?? {}), hidden: ROLE_NAV_HIDDEN[c.slug] } }
      : c,
  );

/**
 * Bouton « ← <Liste> » en tête des contrôles de CHAQUE fiche. Injecté ici plutôt
 * que déclaré dans les 14 collections : un seul endroit, et toute collection
 * ajoutée plus tard en hérite sans y penser. Le composant déduit la collection et
 * son libellé du contexte, et s'efface si la liste est masquée pour ce rôle.
 * Placé en TÊTE des contrôles existants (SmartSaveButton, modals…), qu'il préserve.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withBackToList = (cols: any[]): any[] =>
  cols.map((c) => {
    const admin = c.admin ?? {};
    const components = admin.components ?? {};
    const edit = components.edit ?? {};
    return {
      ...c,
      admin: {
        ...admin,
        components: {
          ...components,
          edit: {
            ...edit,
            beforeDocumentControls: [
              "/admin/components/BackToListButton#BackToListButton",
              ...(edit.beforeDocumentControls ?? []),
            ],
          },
        },
      },
    };
  });

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
      // Pose une classe de rôle sur <body> (tim-is-admin / tim-not-admin) pour
      // piloter en CSS les éléments sans visibilité par rôle (onglet API, action
      // « Créer un » des contrôles de document). Voir admin/providers/.
      providers: [
        "/admin/providers/RoleBodyClass#default",
        // Clic sur toute la largeur d'une ligne de liste → ouvre la fiche.
        "/admin/providers/RowClick#default",
      ],
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
  collections: withBackToList(
    applyRoleNavVisibility([
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
      ClientContacts, // caché du menu (admin.hidden) — géré via le join de la fiche client
      PointTransactions,
      // Missions
      Missions,
      MissionSubmissions,
      // Récompenses
      Rewards,
      RewardOrders,
      // Marketing (parcours : le modèle + les phases de test en cours)
      JourneyRuns,
      MarketingJourneys,
      // Dossier de démarrage — cachées du menu (admin.hidden), gérées via les
      // champs `join` de l'onglet « Dossier de démarrage » de la fiche client.
      ClientEmployees,
      ClientSites,
      ClientVehicles,
      ClientMachines,
      // Espace client : le compte de connexion + les accès applicatifs de test.
      ClientPortalAccounts,
      // Agendas connectés des partenaires (jetons OAuth chiffrés).
      CalendarConnections,
      // Système
      Media,
      Users,
    ]),
  ),

  // Back-office en français uniquement.
  i18n: {
    supportedLanguages: { fr },
    fallbackLanguage: "fr",
    // Surcharge des libellés « genrés » de Payload (« un(e) nouveau ou nouvelle »,
    // « Créé(e) », « Aucun(e) »…) → une seule forme (masculin singulier), plus
    // lisible. Deep-mergé sur les traductions fr ; le reste est inchangé.
    translations: {
      fr: {
        fields: {
          addNew: "Ajouter",
          addNewLabel: "Ajouter un {{label}}",
          chooseFromExisting: "Choisir parmi les existants",
          chooseLabel: "Choisir un {{label}}",
          newLabel: "Nouveau {{label}}",
          uploadNewLabel: "Téléverser un {{label}}",
        },
        general: {
          created: "Créé",
          createdAt: "Créé le",
          // Libellé du bouton d'ajout des listes : « Ajouter », plus court et
          // identique partout (le nom de la collection est déjà en titre).
          // `createNewLabel` reste explicite : il sert d'intitulé accessible du
          // bouton et de texte visible sur les écrans « aucun résultat ».
          createNew: "Ajouter",
          createNewLabel: "Ajouter un {{label}}",
          creatingNewLabel: "Création d'un {{label}}",
          // Cellule sans donnée → visuellement RIEN (au lieu de « <Pas de X> »).
          // ⚠️ NE PAS mettre "" : la résolution i18n de Payload fait `translation ||
          // key`, donc une chaîne vide retombe sur la clé brute « general:noLabel »
          // (affichée telle quelle dans les cellules). Une espace insécable est
          // « truthy » → elle est renvoyée telle quelle et la cellule reste blanche.
          noLabel: " ",
          deletedSuccessfully: "Supprimé avec succès.",
          descending: "Descendant",
          newLabel: "Nouveau {{label}}",
          none: "Aucun",
          noResults:
            "Aucun {{label}} trouvé. Soit aucun {{label}} n'existe encore, soit aucun ne correspond aux filtres que vous avez spécifiés ci-dessus",
          successfullyCreated: "{{label}} créé avec succès.",
          successfullyDuplicated: "{{label}} dupliqué avec succès.",
          titleDeleted: '{{label}} "{{title}}" supprimé avec succès.',
        },
        version: {
          aboutToRestoreGlobal:
            "Vous êtes sur le point de restaurer le {{label}} global à l'état où il se trouvait le {{versionDate}}.",
          noRowsFound: "Aucun {{label}} trouvé",
          restoredSuccessfully: "Restauré avec succès.",
        },
      },
    },
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

    // Crée le modèle de parcours « Phase de test » s'il n'existe pas encore.
    // Idempotent : ne réécrit jamais un parcours existant (cf. seedJourneys).
    await seedJourneys(payload);
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
      //
      // Pendant un BUILD, le budget se partage entre les processus de prérendu.
      // `experimental.cpus: 2` (next.config) en borne le nombre à 2 : 6 connexions
      // chacun tiennent dans les 15, tout en évitant la file d'attente. Descendre
      // à 2 par worker faisait dépasser 60 s à des pages entières (le prérendu
      // rend PLUSIEURS pages en parallèle dans un même worker) et faisait échouer
      // le build Vercel — d'autant que la base est en Europe et le builder aux
      // États-Unis, chaque requête payant l'aller-retour.
      max: process.env.NEXT_PHASE === "phase-production-build" ? 6 : 5,
      idleTimeoutMillis: 10000,
    },
  }),

  sharp,
});
