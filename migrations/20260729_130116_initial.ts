import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tickets_messages_author" AS ENUM('client', 'support');
  CREATE TYPE "public"."enum_tickets_status" AS ENUM('new', 'acknowledged', 'in_progress', 'on_hold', 'resolved');
  CREATE TYPE "public"."enum_tickets_priority" AS ENUM('urgent', 'high', 'normal', 'low');
  CREATE TYPE "public"."enum_tickets_type" AS ENUM('assistance', 'suggestion', 'autre');
  CREATE TYPE "public"."enum_tickets_service" AS ENUM('technique', 'facturation', 'support', 'commercial', 'autre');
  CREATE TYPE "public"."enum_features_doc_media_position" AS ENUM('droite', 'gauche');
  CREATE TYPE "public"."enum_features_availability" AS ENUM('disponible', 'beta', 'prochainement');
  CREATE TYPE "public"."enum_features_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__features_v_version_doc_media_position" AS ENUM('droite', 'gauche');
  CREATE TYPE "public"."enum__features_v_version_availability" AS ENUM('disponible', 'beta', 'prochainement');
  CREATE TYPE "public"."enum__features_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_parcours_profil" AS ENUM('admin', 'conducteur', 'chef-chantier', 'compagnon');
  CREATE TYPE "public"."enum_parcours_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__parcours_v_version_profil" AS ENUM('admin', 'conducteur', 'chef-chantier', 'compagnon');
  CREATE TYPE "public"."enum__parcours_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_partners_partner_kind" AS ENUM('metier', 'utilisateur');
  CREATE TYPE "public"."enum_partners_partnership_model" AS ENUM('apporteur-affaires', 'revendeur', 'revendeur-sav');
  CREATE TYPE "public"."enum_partners_commission_duration" AS ENUM('24m', 'vie');
  CREATE TYPE "public"."enum_partners_acquisition_source" AS ENUM('recommandation', 'salon', 'prospection', 'site-web', 'reseaux-sociaux', 'autre');
  CREATE TYPE "public"."enum_partners_tier" AS ENUM('bronze', 'argent', 'or');
  CREATE TYPE "public"."enum_partners_status" AS ENUM('active', 'paused', 'archived');
  CREATE TYPE "public"."enum_partner_clients_client_status" AS ENUM('actif', 'resilie', 'archive');
  CREATE TYPE "public"."enum_partner_clients_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__partner_clients_v_version_client_status" AS ENUM('actif', 'resilie', 'archive');
  CREATE TYPE "public"."enum__partner_clients_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_point_transactions_source" AS ENUM('contrat', 'avis', 'ajustement', 'echange');
  CREATE TYPE "public"."enum_missions_type" AS ENUM('preuve', 'manuelle');
  CREATE TYPE "public"."enum_mission_submissions_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TYPE "public"."enum_reward_orders_status" AS ENUM('pending', 'approved', 'shipped', 'delivered', 'cancelled');
  CREATE TYPE "public"."enum_users_roles" AS ENUM('super-admin', 'admin', 'partner-metier', 'partner-utilisateur', 'support');
  CREATE TABLE "tickets_messages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"author" "enum_tickets_messages_author" DEFAULT 'client',
  	"body" varchar,
  	"sent_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "tickets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"number" numeric,
  	"status" "enum_tickets_status" DEFAULT 'new',
  	"priority" "enum_tickets_priority" DEFAULT 'normal',
  	"type" "enum_tickets_type" DEFAULT 'assistance',
  	"service" "enum_tickets_service",
  	"internal_notes" varchar,
  	"email" varchar NOT NULL,
  	"name" varchar,
  	"url" varchar,
  	"resolved_at" timestamp(3) with time zone,
  	"needs_attention" boolean DEFAULT true,
  	"unread_client_reply" boolean DEFAULT false,
  	"ip" varchar,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tickets_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "features_blocks_img" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"block_name" varchar
  );
  
  CREATE TABLE "features_blocks_galerie" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "features_blocks_editeur" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "features_blocks_fichier" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"file_id" integer,
  	"block_name" varchar
  );
  
  CREATE TABLE "features_doc" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title_doc" varchar,
  	"description_doc" jsonb,
  	"media_position" "enum_features_doc_media_position" DEFAULT 'droite'
  );
  
  CREATE TABLE "features" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"title_feature" varchar,
  	"short_description" varchar,
  	"content" jsonb,
  	"thumbnail_id" integer,
  	"availability" "enum_features_availability" DEFAULT 'disponible',
  	"feedback_helpful" numeric DEFAULT 0,
  	"feedback_not_helpful" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_features_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "features_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "features_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"platforms_id" integer,
  	"feature_categories_id" integer
  );
  
  CREATE TABLE "_features_v_blocks_img" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_features_v_blocks_galerie" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_features_v_blocks_editeur" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_features_v_blocks_fichier" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"file_id" integer,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_features_v_version_doc" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title_doc" varchar,
  	"description_doc" jsonb,
  	"media_position" "enum__features_v_version_doc_media_position" DEFAULT 'droite',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_features_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_title_feature" varchar,
  	"version_short_description" varchar,
  	"version_content" jsonb,
  	"version_thumbnail_id" integer,
  	"version_availability" "enum__features_v_version_availability" DEFAULT 'disponible',
  	"version_feedback_helpful" numeric DEFAULT 0,
  	"version_feedback_not_helpful" numeric DEFAULT 0,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__features_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_features_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_features_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"platforms_id" integer,
  	"feature_categories_id" integer
  );
  
  CREATE TABLE "feature_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"parent_id" integer,
  	"path_title" varchar,
  	"sort_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "platforms" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "parcours" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"order" numeric DEFAULT 0,
  	"profil" "enum_parcours_profil",
  	"intro" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_parcours_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "parcours_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"features_id" integer
  );
  
  CREATE TABLE "_parcours_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_order" numeric DEFAULT 0,
  	"version_profil" "enum__parcours_v_version_profil",
  	"version_intro" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__parcours_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_parcours_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"features_id" integer
  );
  
  CREATE TABLE "partners" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"avatar_id" integer,
  	"partner_kind" "enum_partners_partner_kind" DEFAULT 'metier' NOT NULL,
  	"email" varchar NOT NULL,
  	"name" varchar,
  	"first_name" varchar,
  	"phone" varchar,
  	"societe" varchar,
  	"mobile" varchar,
  	"contact_name" varchar,
  	"contact_role" varchar,
  	"address_street" varchar,
  	"address_postal_code" varchar,
  	"address_city" varchar,
  	"address_country" varchar DEFAULT 'France',
  	"siret" varchar,
  	"vat_number" varchar,
  	"legal_form" varchar,
  	"headcount" numeric,
  	"partnership_model" "enum_partners_partnership_model",
  	"commission_rate" numeric,
  	"commission_duration" "enum_partners_commission_duration",
  	"contract_signed" boolean DEFAULT false,
  	"contract_signature_date" timestamp(3) with time zone,
  	"contract_start_date" timestamp(3) with time zone,
  	"contract_end_date" timestamp(3) with time zone,
  	"contract_document_id" integer,
  	"contract_notes" varchar,
  	"joined_at" timestamp(3) with time zone,
  	"acquisition_source" "enum_partners_acquisition_source",
  	"tier" "enum_partners_tier",
  	"account_manager_id" integer,
  	"notes" jsonb,
  	"code" varchar,
  	"status" "enum_partners_status" DEFAULT 'active',
  	"app_user_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "partners_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "partners_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "partner_clients_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"total_licences" numeric,
  	"ca_h_t" numeric,
  	"commission_rate" numeric,
  	"commission" numeric,
  	"detail" jsonb
  );
  
  CREATE TABLE "partner_clients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"company_name" varchar,
  	"partner_id" integer,
  	"signature_date" timestamp(3) with time zone,
  	"client_status" "enum_partner_clients_client_status" DEFAULT 'actif',
  	"resiliation_date" timestamp(3) with time zone,
  	"raison_sociale" varchar,
  	"siren" varchar,
  	"vat_number" varchar,
  	"email" varchar,
  	"billing_address" varchar,
  	"billing_address_complement" varchar,
  	"phone" varchar,
  	"recipient" varchar,
  	"billing_remarks" varchar,
  	"licences_admin_qty" numeric DEFAULT 0,
  	"licences_admin_price" numeric DEFAULT 39,
  	"licences_conducteur_qty" numeric DEFAULT 0,
  	"licences_conducteur_price" numeric DEFAULT 32,
  	"licences_chef_chantier_qty" numeric DEFAULT 0,
  	"licences_chef_chantier_price" numeric DEFAULT 18,
  	"licences_chef_equipe_qty" numeric DEFAULT 0,
  	"licences_chef_equipe_price" numeric DEFAULT 16,
  	"licences_compagnon_qty" numeric DEFAULT 0,
  	"licences_compagnon_price" numeric DEFAULT 8,
  	"notes" varchar,
  	"total_licences" numeric,
  	"ca_paye" numeric,
  	"ca_brut" numeric,
  	"discount_pct" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_partner_clients_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_partner_clients_v_version_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"total_licences" numeric,
  	"ca_h_t" numeric,
  	"commission_rate" numeric,
  	"commission" numeric,
  	"detail" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_partner_clients_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_company_name" varchar,
  	"version_partner_id" integer,
  	"version_signature_date" timestamp(3) with time zone,
  	"version_client_status" "enum__partner_clients_v_version_client_status" DEFAULT 'actif',
  	"version_resiliation_date" timestamp(3) with time zone,
  	"version_raison_sociale" varchar,
  	"version_siren" varchar,
  	"version_vat_number" varchar,
  	"version_email" varchar,
  	"version_billing_address" varchar,
  	"version_billing_address_complement" varchar,
  	"version_phone" varchar,
  	"version_recipient" varchar,
  	"version_billing_remarks" varchar,
  	"version_licences_admin_qty" numeric DEFAULT 0,
  	"version_licences_admin_price" numeric DEFAULT 39,
  	"version_licences_conducteur_qty" numeric DEFAULT 0,
  	"version_licences_conducteur_price" numeric DEFAULT 32,
  	"version_licences_chef_chantier_qty" numeric DEFAULT 0,
  	"version_licences_chef_chantier_price" numeric DEFAULT 18,
  	"version_licences_chef_equipe_qty" numeric DEFAULT 0,
  	"version_licences_chef_equipe_price" numeric DEFAULT 16,
  	"version_licences_compagnon_qty" numeric DEFAULT 0,
  	"version_licences_compagnon_price" numeric DEFAULT 8,
  	"version_notes" varchar,
  	"version_total_licences" numeric,
  	"version_ca_paye" numeric,
  	"version_ca_brut" numeric,
  	"version_discount_pct" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__partner_clients_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "point_transactions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"partner_id" integer NOT NULL,
  	"delta" numeric NOT NULL,
  	"motif" varchar NOT NULL,
  	"source" "enum_point_transactions_source" DEFAULT 'ajustement',
  	"ref" varchar,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "missions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"instructions" jsonb,
  	"logo_id" integer,
  	"points" numeric DEFAULT 0,
  	"type" "enum_missions_type" DEFAULT 'preuve',
  	"url" varchar,
  	"order" numeric DEFAULT 0,
  	"repeatable" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mission_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"mission_id" integer NOT NULL,
  	"partner_id" integer NOT NULL,
  	"note" varchar,
  	"status" "enum_mission_submissions_status" DEFAULT 'pending',
  	"reviewer_email" varchar,
  	"credited" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mission_submissions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "rewards" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" jsonb,
  	"image_id" integer,
  	"cost" numeric NOT NULL,
  	"stock" numeric DEFAULT -1,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reward_orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"partner_id" integer NOT NULL,
  	"reward_id" integer NOT NULL,
  	"cost" numeric NOT NULL,
  	"status" "enum_reward_orders_status" DEFAULT 'pending',
  	"ledger_transaction_id" integer,
  	"refunded" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric
  );
  
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"avatar_id" integer,
  	"first_name" varchar,
  	"last_name" varchar,
  	"name" varchar,
  	"partner_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tickets_id" integer,
  	"features_id" integer,
  	"feature_categories_id" integer,
  	"platforms_id" integer,
  	"parcours_id" integer,
  	"partners_id" integer,
  	"partner_clients_id" integer,
  	"point_transactions_id" integer,
  	"missions_id" integer,
  	"mission_submissions_id" integer,
  	"rewards_id" integer,
  	"reward_orders_id" integer,
  	"media_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tickets_messages" ADD CONSTRAINT "tickets_messages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tickets_rels" ADD CONSTRAINT "tickets_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tickets_rels" ADD CONSTRAINT "tickets_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_blocks_img" ADD CONSTRAINT "features_blocks_img_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "features_blocks_img" ADD CONSTRAINT "features_blocks_img_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_blocks_galerie" ADD CONSTRAINT "features_blocks_galerie_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_blocks_editeur" ADD CONSTRAINT "features_blocks_editeur_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_blocks_fichier" ADD CONSTRAINT "features_blocks_fichier_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "features_blocks_fichier" ADD CONSTRAINT "features_blocks_fichier_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_doc" ADD CONSTRAINT "features_doc_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features" ADD CONSTRAINT "features_thumbnail_id_media_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "features_texts" ADD CONSTRAINT "features_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_rels" ADD CONSTRAINT "features_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_rels" ADD CONSTRAINT "features_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_rels" ADD CONSTRAINT "features_rels_platforms_fk" FOREIGN KEY ("platforms_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "features_rels" ADD CONSTRAINT "features_rels_feature_categories_fk" FOREIGN KEY ("feature_categories_id") REFERENCES "public"."feature_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_blocks_img" ADD CONSTRAINT "_features_v_blocks_img_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_features_v_blocks_img" ADD CONSTRAINT "_features_v_blocks_img_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_features_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_blocks_galerie" ADD CONSTRAINT "_features_v_blocks_galerie_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_features_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_blocks_editeur" ADD CONSTRAINT "_features_v_blocks_editeur_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_features_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_blocks_fichier" ADD CONSTRAINT "_features_v_blocks_fichier_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_features_v_blocks_fichier" ADD CONSTRAINT "_features_v_blocks_fichier_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_features_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_version_doc" ADD CONSTRAINT "_features_v_version_doc_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_features_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v" ADD CONSTRAINT "_features_v_parent_id_features_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."features"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_features_v" ADD CONSTRAINT "_features_v_version_thumbnail_id_media_id_fk" FOREIGN KEY ("version_thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_features_v_texts" ADD CONSTRAINT "_features_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_features_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_rels" ADD CONSTRAINT "_features_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_features_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_rels" ADD CONSTRAINT "_features_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_rels" ADD CONSTRAINT "_features_v_rels_platforms_fk" FOREIGN KEY ("platforms_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_features_v_rels" ADD CONSTRAINT "_features_v_rels_feature_categories_fk" FOREIGN KEY ("feature_categories_id") REFERENCES "public"."feature_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "feature_categories" ADD CONSTRAINT "feature_categories_parent_id_feature_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."feature_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "parcours_rels" ADD CONSTRAINT "parcours_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parcours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "parcours_rels" ADD CONSTRAINT "parcours_rels_features_fk" FOREIGN KEY ("features_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_parcours_v" ADD CONSTRAINT "_parcours_v_parent_id_parcours_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parcours"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_parcours_v_rels" ADD CONSTRAINT "_parcours_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_parcours_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_parcours_v_rels" ADD CONSTRAINT "_parcours_v_rels_features_fk" FOREIGN KEY ("features_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partners" ADD CONSTRAINT "partners_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "partners" ADD CONSTRAINT "partners_contract_document_id_media_id_fk" FOREIGN KEY ("contract_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "partners" ADD CONSTRAINT "partners_account_manager_id_users_id_fk" FOREIGN KEY ("account_manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "partners_texts" ADD CONSTRAINT "partners_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partners_rels" ADD CONSTRAINT "partners_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partners_rels" ADD CONSTRAINT "partners_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partner_clients_history" ADD CONSTRAINT "partner_clients_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."partner_clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partner_clients" ADD CONSTRAINT "partner_clients_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v_version_history" ADD CONSTRAINT "_partner_clients_v_version_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_partner_clients_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_partner_clients_v" ADD CONSTRAINT "_partner_clients_v_parent_id_partner_clients_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partner_clients_v" ADD CONSTRAINT "_partner_clients_v_version_partner_id_partners_id_fk" FOREIGN KEY ("version_partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "missions" ADD CONSTRAINT "missions_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mission_submissions" ADD CONSTRAINT "mission_submissions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mission_submissions" ADD CONSTRAINT "mission_submissions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mission_submissions_rels" ADD CONSTRAINT "mission_submissions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."mission_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "mission_submissions_rels" ADD CONSTRAINT "mission_submissions_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rewards" ADD CONSTRAINT "rewards_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reward_orders" ADD CONSTRAINT "reward_orders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reward_orders" ADD CONSTRAINT "reward_orders_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reward_orders" ADD CONSTRAINT "reward_orders_ledger_transaction_id_point_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."point_transactions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tickets_fk" FOREIGN KEY ("tickets_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_features_fk" FOREIGN KEY ("features_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_feature_categories_fk" FOREIGN KEY ("feature_categories_id") REFERENCES "public"."feature_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_platforms_fk" FOREIGN KEY ("platforms_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parcours_fk" FOREIGN KEY ("parcours_id") REFERENCES "public"."parcours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_partners_fk" FOREIGN KEY ("partners_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_partner_clients_fk" FOREIGN KEY ("partner_clients_id") REFERENCES "public"."partner_clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_point_transactions_fk" FOREIGN KEY ("point_transactions_id") REFERENCES "public"."point_transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_missions_fk" FOREIGN KEY ("missions_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mission_submissions_fk" FOREIGN KEY ("mission_submissions_id") REFERENCES "public"."mission_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rewards_fk" FOREIGN KEY ("rewards_id") REFERENCES "public"."rewards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reward_orders_fk" FOREIGN KEY ("reward_orders_id") REFERENCES "public"."reward_orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tickets_messages_order_idx" ON "tickets_messages" USING btree ("_order");
  CREATE INDEX "tickets_messages_parent_id_idx" ON "tickets_messages" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "tickets_number_idx" ON "tickets" USING btree ("number");
  CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");
  CREATE INDEX "tickets_priority_idx" ON "tickets" USING btree ("priority");
  CREATE INDEX "tickets_resolved_at_idx" ON "tickets" USING btree ("resolved_at");
  CREATE INDEX "tickets_needs_attention_idx" ON "tickets" USING btree ("needs_attention");
  CREATE INDEX "tickets_unread_client_reply_idx" ON "tickets" USING btree ("unread_client_reply");
  CREATE INDEX "tickets_updated_at_idx" ON "tickets" USING btree ("updated_at");
  CREATE INDEX "tickets_created_at_idx" ON "tickets" USING btree ("created_at");
  CREATE INDEX "tickets_rels_order_idx" ON "tickets_rels" USING btree ("order");
  CREATE INDEX "tickets_rels_parent_idx" ON "tickets_rels" USING btree ("parent_id");
  CREATE INDEX "tickets_rels_path_idx" ON "tickets_rels" USING btree ("path");
  CREATE INDEX "tickets_rels_media_id_idx" ON "tickets_rels" USING btree ("media_id");
  CREATE INDEX "features_blocks_img_order_idx" ON "features_blocks_img" USING btree ("_order");
  CREATE INDEX "features_blocks_img_parent_id_idx" ON "features_blocks_img" USING btree ("_parent_id");
  CREATE INDEX "features_blocks_img_path_idx" ON "features_blocks_img" USING btree ("_path");
  CREATE INDEX "features_blocks_img_image_idx" ON "features_blocks_img" USING btree ("image_id");
  CREATE INDEX "features_blocks_galerie_order_idx" ON "features_blocks_galerie" USING btree ("_order");
  CREATE INDEX "features_blocks_galerie_parent_id_idx" ON "features_blocks_galerie" USING btree ("_parent_id");
  CREATE INDEX "features_blocks_galerie_path_idx" ON "features_blocks_galerie" USING btree ("_path");
  CREATE INDEX "features_blocks_editeur_order_idx" ON "features_blocks_editeur" USING btree ("_order");
  CREATE INDEX "features_blocks_editeur_parent_id_idx" ON "features_blocks_editeur" USING btree ("_parent_id");
  CREATE INDEX "features_blocks_editeur_path_idx" ON "features_blocks_editeur" USING btree ("_path");
  CREATE INDEX "features_blocks_fichier_order_idx" ON "features_blocks_fichier" USING btree ("_order");
  CREATE INDEX "features_blocks_fichier_parent_id_idx" ON "features_blocks_fichier" USING btree ("_parent_id");
  CREATE INDEX "features_blocks_fichier_path_idx" ON "features_blocks_fichier" USING btree ("_path");
  CREATE INDEX "features_blocks_fichier_file_idx" ON "features_blocks_fichier" USING btree ("file_id");
  CREATE INDEX "features_doc_order_idx" ON "features_doc" USING btree ("_order");
  CREATE INDEX "features_doc_parent_id_idx" ON "features_doc" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "features_slug_idx" ON "features" USING btree ("slug");
  CREATE INDEX "features_thumbnail_idx" ON "features" USING btree ("thumbnail_id");
  CREATE INDEX "features_updated_at_idx" ON "features" USING btree ("updated_at");
  CREATE INDEX "features_created_at_idx" ON "features" USING btree ("created_at");
  CREATE INDEX "features__status_idx" ON "features" USING btree ("_status");
  CREATE INDEX "features_texts_order_parent" ON "features_texts" USING btree ("order","parent_id");
  CREATE INDEX "features_rels_order_idx" ON "features_rels" USING btree ("order");
  CREATE INDEX "features_rels_parent_idx" ON "features_rels" USING btree ("parent_id");
  CREATE INDEX "features_rels_path_idx" ON "features_rels" USING btree ("path");
  CREATE INDEX "features_rels_media_id_idx" ON "features_rels" USING btree ("media_id");
  CREATE INDEX "features_rels_platforms_id_idx" ON "features_rels" USING btree ("platforms_id");
  CREATE INDEX "features_rels_feature_categories_id_idx" ON "features_rels" USING btree ("feature_categories_id");
  CREATE INDEX "_features_v_blocks_img_order_idx" ON "_features_v_blocks_img" USING btree ("_order");
  CREATE INDEX "_features_v_blocks_img_parent_id_idx" ON "_features_v_blocks_img" USING btree ("_parent_id");
  CREATE INDEX "_features_v_blocks_img_path_idx" ON "_features_v_blocks_img" USING btree ("_path");
  CREATE INDEX "_features_v_blocks_img_image_idx" ON "_features_v_blocks_img" USING btree ("image_id");
  CREATE INDEX "_features_v_blocks_galerie_order_idx" ON "_features_v_blocks_galerie" USING btree ("_order");
  CREATE INDEX "_features_v_blocks_galerie_parent_id_idx" ON "_features_v_blocks_galerie" USING btree ("_parent_id");
  CREATE INDEX "_features_v_blocks_galerie_path_idx" ON "_features_v_blocks_galerie" USING btree ("_path");
  CREATE INDEX "_features_v_blocks_editeur_order_idx" ON "_features_v_blocks_editeur" USING btree ("_order");
  CREATE INDEX "_features_v_blocks_editeur_parent_id_idx" ON "_features_v_blocks_editeur" USING btree ("_parent_id");
  CREATE INDEX "_features_v_blocks_editeur_path_idx" ON "_features_v_blocks_editeur" USING btree ("_path");
  CREATE INDEX "_features_v_blocks_fichier_order_idx" ON "_features_v_blocks_fichier" USING btree ("_order");
  CREATE INDEX "_features_v_blocks_fichier_parent_id_idx" ON "_features_v_blocks_fichier" USING btree ("_parent_id");
  CREATE INDEX "_features_v_blocks_fichier_path_idx" ON "_features_v_blocks_fichier" USING btree ("_path");
  CREATE INDEX "_features_v_blocks_fichier_file_idx" ON "_features_v_blocks_fichier" USING btree ("file_id");
  CREATE INDEX "_features_v_version_doc_order_idx" ON "_features_v_version_doc" USING btree ("_order");
  CREATE INDEX "_features_v_version_doc_parent_id_idx" ON "_features_v_version_doc" USING btree ("_parent_id");
  CREATE INDEX "_features_v_parent_idx" ON "_features_v" USING btree ("parent_id");
  CREATE INDEX "_features_v_version_version_slug_idx" ON "_features_v" USING btree ("version_slug");
  CREATE INDEX "_features_v_version_version_thumbnail_idx" ON "_features_v" USING btree ("version_thumbnail_id");
  CREATE INDEX "_features_v_version_version_updated_at_idx" ON "_features_v" USING btree ("version_updated_at");
  CREATE INDEX "_features_v_version_version_created_at_idx" ON "_features_v" USING btree ("version_created_at");
  CREATE INDEX "_features_v_version_version__status_idx" ON "_features_v" USING btree ("version__status");
  CREATE INDEX "_features_v_created_at_idx" ON "_features_v" USING btree ("created_at");
  CREATE INDEX "_features_v_updated_at_idx" ON "_features_v" USING btree ("updated_at");
  CREATE INDEX "_features_v_latest_idx" ON "_features_v" USING btree ("latest");
  CREATE INDEX "_features_v_texts_order_parent" ON "_features_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_features_v_rels_order_idx" ON "_features_v_rels" USING btree ("order");
  CREATE INDEX "_features_v_rels_parent_idx" ON "_features_v_rels" USING btree ("parent_id");
  CREATE INDEX "_features_v_rels_path_idx" ON "_features_v_rels" USING btree ("path");
  CREATE INDEX "_features_v_rels_media_id_idx" ON "_features_v_rels" USING btree ("media_id");
  CREATE INDEX "_features_v_rels_platforms_id_idx" ON "_features_v_rels" USING btree ("platforms_id");
  CREATE INDEX "_features_v_rels_feature_categories_id_idx" ON "_features_v_rels" USING btree ("feature_categories_id");
  CREATE UNIQUE INDEX "feature_categories_slug_idx" ON "feature_categories" USING btree ("slug");
  CREATE INDEX "feature_categories_parent_idx" ON "feature_categories" USING btree ("parent_id");
  CREATE INDEX "feature_categories_updated_at_idx" ON "feature_categories" USING btree ("updated_at");
  CREATE INDEX "feature_categories_created_at_idx" ON "feature_categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "platforms_slug_idx" ON "platforms" USING btree ("slug");
  CREATE INDEX "platforms_updated_at_idx" ON "platforms" USING btree ("updated_at");
  CREATE INDEX "platforms_created_at_idx" ON "platforms" USING btree ("created_at");
  CREATE UNIQUE INDEX "parcours_slug_idx" ON "parcours" USING btree ("slug");
  CREATE INDEX "parcours_order_idx" ON "parcours" USING btree ("order");
  CREATE INDEX "parcours_updated_at_idx" ON "parcours" USING btree ("updated_at");
  CREATE INDEX "parcours_created_at_idx" ON "parcours" USING btree ("created_at");
  CREATE INDEX "parcours__status_idx" ON "parcours" USING btree ("_status");
  CREATE INDEX "parcours_rels_order_idx" ON "parcours_rels" USING btree ("order");
  CREATE INDEX "parcours_rels_parent_idx" ON "parcours_rels" USING btree ("parent_id");
  CREATE INDEX "parcours_rels_path_idx" ON "parcours_rels" USING btree ("path");
  CREATE INDEX "parcours_rels_features_id_idx" ON "parcours_rels" USING btree ("features_id");
  CREATE INDEX "_parcours_v_parent_idx" ON "_parcours_v" USING btree ("parent_id");
  CREATE INDEX "_parcours_v_version_version_slug_idx" ON "_parcours_v" USING btree ("version_slug");
  CREATE INDEX "_parcours_v_version_version_order_idx" ON "_parcours_v" USING btree ("version_order");
  CREATE INDEX "_parcours_v_version_version_updated_at_idx" ON "_parcours_v" USING btree ("version_updated_at");
  CREATE INDEX "_parcours_v_version_version_created_at_idx" ON "_parcours_v" USING btree ("version_created_at");
  CREATE INDEX "_parcours_v_version_version__status_idx" ON "_parcours_v" USING btree ("version__status");
  CREATE INDEX "_parcours_v_created_at_idx" ON "_parcours_v" USING btree ("created_at");
  CREATE INDEX "_parcours_v_updated_at_idx" ON "_parcours_v" USING btree ("updated_at");
  CREATE INDEX "_parcours_v_latest_idx" ON "_parcours_v" USING btree ("latest");
  CREATE INDEX "_parcours_v_rels_order_idx" ON "_parcours_v_rels" USING btree ("order");
  CREATE INDEX "_parcours_v_rels_parent_idx" ON "_parcours_v_rels" USING btree ("parent_id");
  CREATE INDEX "_parcours_v_rels_path_idx" ON "_parcours_v_rels" USING btree ("path");
  CREATE INDEX "_parcours_v_rels_features_id_idx" ON "_parcours_v_rels" USING btree ("features_id");
  CREATE INDEX "partners_avatar_idx" ON "partners" USING btree ("avatar_id");
  CREATE UNIQUE INDEX "partners_email_idx" ON "partners" USING btree ("email");
  CREATE INDEX "partners_contract_document_idx" ON "partners" USING btree ("contract_document_id");
  CREATE INDEX "partners_account_manager_idx" ON "partners" USING btree ("account_manager_id");
  CREATE UNIQUE INDEX "partners_code_idx" ON "partners" USING btree ("code");
  CREATE INDEX "partners_updated_at_idx" ON "partners" USING btree ("updated_at");
  CREATE INDEX "partners_created_at_idx" ON "partners" USING btree ("created_at");
  CREATE INDEX "partners_texts_order_parent" ON "partners_texts" USING btree ("order","parent_id");
  CREATE INDEX "partners_rels_order_idx" ON "partners_rels" USING btree ("order");
  CREATE INDEX "partners_rels_parent_idx" ON "partners_rels" USING btree ("parent_id");
  CREATE INDEX "partners_rels_path_idx" ON "partners_rels" USING btree ("path");
  CREATE INDEX "partners_rels_media_id_idx" ON "partners_rels" USING btree ("media_id");
  CREATE INDEX "partner_clients_history_order_idx" ON "partner_clients_history" USING btree ("_order");
  CREATE INDEX "partner_clients_history_parent_id_idx" ON "partner_clients_history" USING btree ("_parent_id");
  CREATE INDEX "partner_clients_partner_idx" ON "partner_clients" USING btree ("partner_id");
  CREATE INDEX "partner_clients_updated_at_idx" ON "partner_clients" USING btree ("updated_at");
  CREATE INDEX "partner_clients_created_at_idx" ON "partner_clients" USING btree ("created_at");
  CREATE INDEX "partner_clients__status_idx" ON "partner_clients" USING btree ("_status");
  CREATE INDEX "_partner_clients_v_version_history_order_idx" ON "_partner_clients_v_version_history" USING btree ("_order");
  CREATE INDEX "_partner_clients_v_version_history_parent_id_idx" ON "_partner_clients_v_version_history" USING btree ("_parent_id");
  CREATE INDEX "_partner_clients_v_parent_idx" ON "_partner_clients_v" USING btree ("parent_id");
  CREATE INDEX "_partner_clients_v_version_version_partner_idx" ON "_partner_clients_v" USING btree ("version_partner_id");
  CREATE INDEX "_partner_clients_v_version_version_updated_at_idx" ON "_partner_clients_v" USING btree ("version_updated_at");
  CREATE INDEX "_partner_clients_v_version_version_created_at_idx" ON "_partner_clients_v" USING btree ("version_created_at");
  CREATE INDEX "_partner_clients_v_version_version__status_idx" ON "_partner_clients_v" USING btree ("version__status");
  CREATE INDEX "_partner_clients_v_created_at_idx" ON "_partner_clients_v" USING btree ("created_at");
  CREATE INDEX "_partner_clients_v_updated_at_idx" ON "_partner_clients_v" USING btree ("updated_at");
  CREATE INDEX "_partner_clients_v_latest_idx" ON "_partner_clients_v" USING btree ("latest");
  CREATE UNIQUE INDEX "point_transactions_number_idx" ON "point_transactions" USING btree ("number");
  CREATE INDEX "point_transactions_partner_idx" ON "point_transactions" USING btree ("partner_id");
  CREATE INDEX "point_transactions_created_by_idx" ON "point_transactions" USING btree ("created_by_id");
  CREATE INDEX "point_transactions_updated_at_idx" ON "point_transactions" USING btree ("updated_at");
  CREATE INDEX "point_transactions_created_at_idx" ON "point_transactions" USING btree ("created_at");
  CREATE INDEX "missions_logo_idx" ON "missions" USING btree ("logo_id");
  CREATE INDEX "missions_order_idx" ON "missions" USING btree ("order");
  CREATE INDEX "missions_updated_at_idx" ON "missions" USING btree ("updated_at");
  CREATE INDEX "missions_created_at_idx" ON "missions" USING btree ("created_at");
  CREATE UNIQUE INDEX "mission_submissions_number_idx" ON "mission_submissions" USING btree ("number");
  CREATE INDEX "mission_submissions_mission_idx" ON "mission_submissions" USING btree ("mission_id");
  CREATE INDEX "mission_submissions_partner_idx" ON "mission_submissions" USING btree ("partner_id");
  CREATE INDEX "mission_submissions_status_idx" ON "mission_submissions" USING btree ("status");
  CREATE INDEX "mission_submissions_updated_at_idx" ON "mission_submissions" USING btree ("updated_at");
  CREATE INDEX "mission_submissions_created_at_idx" ON "mission_submissions" USING btree ("created_at");
  CREATE INDEX "mission_submissions_rels_order_idx" ON "mission_submissions_rels" USING btree ("order");
  CREATE INDEX "mission_submissions_rels_parent_idx" ON "mission_submissions_rels" USING btree ("parent_id");
  CREATE INDEX "mission_submissions_rels_path_idx" ON "mission_submissions_rels" USING btree ("path");
  CREATE INDEX "mission_submissions_rels_media_id_idx" ON "mission_submissions_rels" USING btree ("media_id");
  CREATE UNIQUE INDEX "rewards_slug_idx" ON "rewards" USING btree ("slug");
  CREATE INDEX "rewards_image_idx" ON "rewards" USING btree ("image_id");
  CREATE INDEX "rewards_updated_at_idx" ON "rewards" USING btree ("updated_at");
  CREATE INDEX "rewards_created_at_idx" ON "rewards" USING btree ("created_at");
  CREATE UNIQUE INDEX "reward_orders_number_idx" ON "reward_orders" USING btree ("number");
  CREATE INDEX "reward_orders_partner_idx" ON "reward_orders" USING btree ("partner_id");
  CREATE INDEX "reward_orders_reward_idx" ON "reward_orders" USING btree ("reward_id");
  CREATE INDEX "reward_orders_status_idx" ON "reward_orders" USING btree ("status");
  CREATE INDEX "reward_orders_ledger_transaction_idx" ON "reward_orders" USING btree ("ledger_transaction_id");
  CREATE INDEX "reward_orders_updated_at_idx" ON "reward_orders" USING btree ("updated_at");
  CREATE INDEX "reward_orders_created_at_idx" ON "reward_orders" USING btree ("created_at");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_avatar_idx" ON "users" USING btree ("avatar_id");
  CREATE INDEX "users_partner_idx" ON "users" USING btree ("partner_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_tickets_id_idx" ON "payload_locked_documents_rels" USING btree ("tickets_id");
  CREATE INDEX "payload_locked_documents_rels_features_id_idx" ON "payload_locked_documents_rels" USING btree ("features_id");
  CREATE INDEX "payload_locked_documents_rels_feature_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("feature_categories_id");
  CREATE INDEX "payload_locked_documents_rels_platforms_id_idx" ON "payload_locked_documents_rels" USING btree ("platforms_id");
  CREATE INDEX "payload_locked_documents_rels_parcours_id_idx" ON "payload_locked_documents_rels" USING btree ("parcours_id");
  CREATE INDEX "payload_locked_documents_rels_partners_id_idx" ON "payload_locked_documents_rels" USING btree ("partners_id");
  CREATE INDEX "payload_locked_documents_rels_partner_clients_id_idx" ON "payload_locked_documents_rels" USING btree ("partner_clients_id");
  CREATE INDEX "payload_locked_documents_rels_point_transactions_id_idx" ON "payload_locked_documents_rels" USING btree ("point_transactions_id");
  CREATE INDEX "payload_locked_documents_rels_missions_id_idx" ON "payload_locked_documents_rels" USING btree ("missions_id");
  CREATE INDEX "payload_locked_documents_rels_mission_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("mission_submissions_id");
  CREATE INDEX "payload_locked_documents_rels_rewards_id_idx" ON "payload_locked_documents_rels" USING btree ("rewards_id");
  CREATE INDEX "payload_locked_documents_rels_reward_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("reward_orders_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "tickets_messages" CASCADE;
  DROP TABLE "tickets" CASCADE;
  DROP TABLE "tickets_rels" CASCADE;
  DROP TABLE "features_blocks_img" CASCADE;
  DROP TABLE "features_blocks_galerie" CASCADE;
  DROP TABLE "features_blocks_editeur" CASCADE;
  DROP TABLE "features_blocks_fichier" CASCADE;
  DROP TABLE "features_doc" CASCADE;
  DROP TABLE "features" CASCADE;
  DROP TABLE "features_texts" CASCADE;
  DROP TABLE "features_rels" CASCADE;
  DROP TABLE "_features_v_blocks_img" CASCADE;
  DROP TABLE "_features_v_blocks_galerie" CASCADE;
  DROP TABLE "_features_v_blocks_editeur" CASCADE;
  DROP TABLE "_features_v_blocks_fichier" CASCADE;
  DROP TABLE "_features_v_version_doc" CASCADE;
  DROP TABLE "_features_v" CASCADE;
  DROP TABLE "_features_v_texts" CASCADE;
  DROP TABLE "_features_v_rels" CASCADE;
  DROP TABLE "feature_categories" CASCADE;
  DROP TABLE "platforms" CASCADE;
  DROP TABLE "parcours" CASCADE;
  DROP TABLE "parcours_rels" CASCADE;
  DROP TABLE "_parcours_v" CASCADE;
  DROP TABLE "_parcours_v_rels" CASCADE;
  DROP TABLE "partners" CASCADE;
  DROP TABLE "partners_texts" CASCADE;
  DROP TABLE "partners_rels" CASCADE;
  DROP TABLE "partner_clients_history" CASCADE;
  DROP TABLE "partner_clients" CASCADE;
  DROP TABLE "_partner_clients_v_version_history" CASCADE;
  DROP TABLE "_partner_clients_v" CASCADE;
  DROP TABLE "point_transactions" CASCADE;
  DROP TABLE "missions" CASCADE;
  DROP TABLE "mission_submissions" CASCADE;
  DROP TABLE "mission_submissions_rels" CASCADE;
  DROP TABLE "rewards" CASCADE;
  DROP TABLE "reward_orders" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_tickets_messages_author";
  DROP TYPE "public"."enum_tickets_status";
  DROP TYPE "public"."enum_tickets_priority";
  DROP TYPE "public"."enum_tickets_type";
  DROP TYPE "public"."enum_tickets_service";
  DROP TYPE "public"."enum_features_doc_media_position";
  DROP TYPE "public"."enum_features_availability";
  DROP TYPE "public"."enum_features_status";
  DROP TYPE "public"."enum__features_v_version_doc_media_position";
  DROP TYPE "public"."enum__features_v_version_availability";
  DROP TYPE "public"."enum__features_v_version_status";
  DROP TYPE "public"."enum_parcours_profil";
  DROP TYPE "public"."enum_parcours_status";
  DROP TYPE "public"."enum__parcours_v_version_profil";
  DROP TYPE "public"."enum__parcours_v_version_status";
  DROP TYPE "public"."enum_partners_partner_kind";
  DROP TYPE "public"."enum_partners_partnership_model";
  DROP TYPE "public"."enum_partners_commission_duration";
  DROP TYPE "public"."enum_partners_acquisition_source";
  DROP TYPE "public"."enum_partners_tier";
  DROP TYPE "public"."enum_partners_status";
  DROP TYPE "public"."enum_partner_clients_client_status";
  DROP TYPE "public"."enum_partner_clients_status";
  DROP TYPE "public"."enum__partner_clients_v_version_client_status";
  DROP TYPE "public"."enum__partner_clients_v_version_status";
  DROP TYPE "public"."enum_point_transactions_source";
  DROP TYPE "public"."enum_missions_type";
  DROP TYPE "public"."enum_mission_submissions_status";
  DROP TYPE "public"."enum_reward_orders_status";
  DROP TYPE "public"."enum_users_roles";`)
}
