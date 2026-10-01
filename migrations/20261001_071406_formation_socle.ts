import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainings_status" AS ENUM('ouvert', 'termine', 'annule');
  CREATE TYPE "public"."enum_trainings_default_access_delivery" AS ENUM('formateur', 'client');
  CREATE TYPE "public"."enum_training_days_mode" AS ENUM('sur-place', 'distance');
  CREATE TYPE "public"."enum_training_days_trainer_type" AS ENUM('tim', 'partenaire');
  CREATE TYPE "public"."enum_training_sessions_profiles" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  CREATE TYPE "public"."enum_training_sessions_status" AS ENUM('planifiee', 'realisee', 'annulee');
  CREATE TYPE "public"."enum_training_sessions_access_delivery" AS ENUM('formateur', 'client');
  CREATE TYPE "public"."enum_training_settings_programmes_profile" AS ENUM('admin', 'conducteur', 'chefChantier', 'chefEquipe', 'compagnon');
  CREATE TABLE "trainings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"partner_id" integer,
  	"status" "enum_trainings_status" DEFAULT 'ouvert' NOT NULL,
  	"default_access_delivery" "enum_trainings_default_access_delivery" DEFAULT 'formateur' NOT NULL,
  	"notes" varchar,
  	"opened_at" timestamp(3) with time zone,
  	"opened_by_id" integer,
  	"closed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "training_days" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"training_id" integer NOT NULL,
  	"client_id" integer,
  	"partner_id" integer,
  	"date" timestamp(3) with time zone,
  	"mode" "enum_training_days_mode" DEFAULT 'sur-place' NOT NULL,
  	"location" varchar,
  	"link" varchar,
  	"trainer_type" "enum_training_days_trainer_type" DEFAULT 'tim' NOT NULL,
  	"trainer_id" integer,
  	"checklist" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "training_sessions_profiles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_training_sessions_profiles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "training_sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day_id" integer NOT NULL,
  	"training_id" integer,
  	"client_id" integer,
  	"partner_id" integer,
  	"order" numeric DEFAULT 1,
  	"start_time" varchar,
  	"end_time" varchar,
  	"status" "enum_training_sessions_status" DEFAULT 'planifiee' NOT NULL,
  	"access_delivery" "enum_training_sessions_access_delivery",
  	"attendance_at" timestamp(3) with time zone,
  	"attendance_by_id" integer,
  	"access_delivered_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "training_sessions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"client_contacts_id" integer
  );
  
  CREATE TABLE "training_settings_programmes_modules" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"minutes" numeric DEFAULT 15,
  	"feature_id" integer
  );
  
  CREATE TABLE "training_settings_programmes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"profile" "enum_training_settings_programmes_profile" NOT NULL
  );
  
  CREATE TABLE "training_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trainings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "training_days_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "training_sessions_id" integer;
  ALTER TABLE "trainings" ADD CONSTRAINT "trainings_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trainings" ADD CONSTRAINT "trainings_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trainings" ADD CONSTRAINT "trainings_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_days" ADD CONSTRAINT "training_days_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_days" ADD CONSTRAINT "training_days_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_days" ADD CONSTRAINT "training_days_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_days" ADD CONSTRAINT "training_days_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_sessions_profiles" ADD CONSTRAINT "training_sessions_profiles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_day_id_training_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."training_days"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_client_id_partner_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."partner_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_attendance_by_id_users_id_fk" FOREIGN KEY ("attendance_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_sessions_rels" ADD CONSTRAINT "training_sessions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "training_sessions_rels" ADD CONSTRAINT "training_sessions_rels_client_contacts_fk" FOREIGN KEY ("client_contacts_id") REFERENCES "public"."client_contacts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "training_settings_programmes_modules" ADD CONSTRAINT "training_settings_programmes_modules_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "training_settings_programmes_modules" ADD CONSTRAINT "training_settings_programmes_modules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."training_settings_programmes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "training_settings_programmes" ADD CONSTRAINT "training_settings_programmes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."training_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "trainings_client_idx" ON "trainings" USING btree ("client_id");
  CREATE INDEX "trainings_partner_idx" ON "trainings" USING btree ("partner_id");
  CREATE INDEX "trainings_opened_by_idx" ON "trainings" USING btree ("opened_by_id");
  CREATE INDEX "trainings_updated_at_idx" ON "trainings" USING btree ("updated_at");
  CREATE INDEX "trainings_created_at_idx" ON "trainings" USING btree ("created_at");
  CREATE INDEX "training_days_training_idx" ON "training_days" USING btree ("training_id");
  CREATE INDEX "training_days_client_idx" ON "training_days" USING btree ("client_id");
  CREATE INDEX "training_days_partner_idx" ON "training_days" USING btree ("partner_id");
  CREATE INDEX "training_days_date_idx" ON "training_days" USING btree ("date");
  CREATE INDEX "training_days_trainer_idx" ON "training_days" USING btree ("trainer_id");
  CREATE INDEX "training_days_updated_at_idx" ON "training_days" USING btree ("updated_at");
  CREATE INDEX "training_days_created_at_idx" ON "training_days" USING btree ("created_at");
  CREATE INDEX "training_sessions_profiles_order_idx" ON "training_sessions_profiles" USING btree ("order");
  CREATE INDEX "training_sessions_profiles_parent_idx" ON "training_sessions_profiles" USING btree ("parent_id");
  CREATE INDEX "training_sessions_day_idx" ON "training_sessions" USING btree ("day_id");
  CREATE INDEX "training_sessions_training_idx" ON "training_sessions" USING btree ("training_id");
  CREATE INDEX "training_sessions_client_idx" ON "training_sessions" USING btree ("client_id");
  CREATE INDEX "training_sessions_partner_idx" ON "training_sessions" USING btree ("partner_id");
  CREATE INDEX "training_sessions_attendance_by_idx" ON "training_sessions" USING btree ("attendance_by_id");
  CREATE INDEX "training_sessions_updated_at_idx" ON "training_sessions" USING btree ("updated_at");
  CREATE INDEX "training_sessions_created_at_idx" ON "training_sessions" USING btree ("created_at");
  CREATE INDEX "training_sessions_rels_order_idx" ON "training_sessions_rels" USING btree ("order");
  CREATE INDEX "training_sessions_rels_parent_idx" ON "training_sessions_rels" USING btree ("parent_id");
  CREATE INDEX "training_sessions_rels_path_idx" ON "training_sessions_rels" USING btree ("path");
  CREATE INDEX "training_sessions_rels_client_contacts_id_idx" ON "training_sessions_rels" USING btree ("client_contacts_id");
  CREATE INDEX "training_settings_programmes_modules_order_idx" ON "training_settings_programmes_modules" USING btree ("_order");
  CREATE INDEX "training_settings_programmes_modules_parent_id_idx" ON "training_settings_programmes_modules" USING btree ("_parent_id");
  CREATE INDEX "training_settings_programmes_modules_feature_idx" ON "training_settings_programmes_modules" USING btree ("feature_id");
  CREATE INDEX "training_settings_programmes_order_idx" ON "training_settings_programmes" USING btree ("_order");
  CREATE INDEX "training_settings_programmes_parent_id_idx" ON "training_settings_programmes" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainings_fk" FOREIGN KEY ("trainings_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_training_days_fk" FOREIGN KEY ("training_days_id") REFERENCES "public"."training_days"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_training_sessions_fk" FOREIGN KEY ("training_sessions_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_trainings_id_idx" ON "payload_locked_documents_rels" USING btree ("trainings_id");
  CREATE INDEX "payload_locked_documents_rels_training_days_id_idx" ON "payload_locked_documents_rels" USING btree ("training_days_id");
  CREATE INDEX "payload_locked_documents_rels_training_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("training_sessions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "training_days" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "training_sessions_profiles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "training_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "training_sessions_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "training_settings_programmes_modules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "training_settings_programmes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "training_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "trainings" CASCADE;
  DROP TABLE "training_days" CASCADE;
  DROP TABLE "training_sessions_profiles" CASCADE;
  DROP TABLE "training_sessions" CASCADE;
  DROP TABLE "training_sessions_rels" CASCADE;
  DROP TABLE "training_settings_programmes_modules" CASCADE;
  DROP TABLE "training_settings_programmes" CASCADE;
  DROP TABLE "training_settings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trainings_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_training_days_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_training_sessions_fk";
  
  DROP INDEX "payload_locked_documents_rels_trainings_id_idx";
  DROP INDEX "payload_locked_documents_rels_training_days_id_idx";
  DROP INDEX "payload_locked_documents_rels_training_sessions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trainings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "training_days_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "training_sessions_id";
  DROP TYPE "public"."enum_trainings_status";
  DROP TYPE "public"."enum_trainings_default_access_delivery";
  DROP TYPE "public"."enum_training_days_mode";
  DROP TYPE "public"."enum_training_days_trainer_type";
  DROP TYPE "public"."enum_training_sessions_profiles";
  DROP TYPE "public"."enum_training_sessions_status";
  DROP TYPE "public"."enum_training_sessions_access_delivery";
  DROP TYPE "public"."enum_training_settings_programmes_profile";`)
}
